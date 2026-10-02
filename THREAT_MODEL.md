# Envelope — Threat model

Written during Phase 18's self-audit. This is a devnet hackathon build, not a production
deployment — several items below are explicitly "fix before mainnet," not "fixed."

## Privacy table — who can see what

| Party                                         | Sees amounts?                                                                                                           | Sees who-paid-whom?                                                                                                                        | Notes                                                                               |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| The two parties to a transfer                 | Yes (their own ElGamal key decrypts both their own send/receive handle and, separately, their own balance)              | Yes, trivially (they're a party to it)                                                                                                     | Normal, intended.                                                                   |
| A pot's host                                  | Yes, for every contribution to that pot (`decryptPotActivity` decrypts with the pot's own key, which the host controls) | Yes, per contribution (source token account → owner)                                                                                       | Intended — "host sees total, guests don't see each other."                          |
| Other pot guests                              | No                                                                                                                      | No                                                                                                                                         | Verified live in Phase 15 (`pot-roundtrip.ts`'s negative check).                    |
| The relayer                                   | **Yes, partially** — see below                                                                                          | Yes — it's the fee payer on every relayed transaction, so it always knows which two wallet addresses transacted                            | Real, structural, not a bug.                                                        |
| Anyone watching the chain (explorer, indexer) | No (ciphertext only) — this is Token-2022 confidential transfers' whole point                                           | **Yes** — wallet addresses, token accounts, and the fact _that_ a confidential transfer happened are all public; only the amount is hidden | "Private" means amount-private, not metadata-private. See timing/linkability below. |
| Anyone with a wallet's ElGamal secret key     | Yes, for that wallet's own transfers (both directions)                                                                  | —                                                                                                                                          | The key never leaves the WebView bridge's memory; see Key storage below.            |

**What the relayer actually learns, precisely:** every transaction it's asked to co-sign, decoded
in full (`policy.ts` has to read every instruction to validate it) — so it knows the sender, the
recipient, and the fact that a confidential transfer, wrap, pot action, or free-tier fee payment
happened, every time, for every relayed transaction. It does **not** learn the transfer amount —
that's still ElGamal-encrypted in the instruction data, and the relayer has no decryption key for
either party. It also learns a wallet's tier (`/tier/:wallet`, needed to decide fee waivers) and,
incidentally, every SKR fee payment amount (those are plaintext classic-Token transfers, not
confidential). A compromised or malicious relayer could: refuse to relay (availability, not
privacy), correlate sender↔recipient pairs over time (it already has to, to do its job), or extract
and monetize this metadata — but it cannot see transfer amounts without breaking ElGamal.

## Relayer trust

The relayer is a necessary, explicit trust boundary, not an accident:

- **It is the fee payer for every relayed send**, which is _why_ it must see sender/recipient/
  instruction content — there's no way to pay a fee for a transaction without being able to
  validate what you're paying for (`policy.ts`'s whole reason to exist).
- **It cannot move funds it doesn't already hold**, by construction: `policy.ts` allow-lists
  programs, rejects any System instruction except `CreateAccount`, and restricts every writable
  appearance of the relayer's own address to exactly two roles (funding a ZK proof context
  account it's already proven will be owned by the ZK ElGamal Proof program — not an arbitrary
  one — and reclaiming rent it already paid, only when it's also genuinely the account's
  authority). Both of those checks were tightened during this phase's audit — see "Findings &
  fixes" below for the exploit they used to leave open.
- **It can deny service** (refuse to relay, go offline) but cannot censor a specific recipient
  without also refusing every sender — it validates transactions, not identities.
- **It is a single process today** (in-memory rate limiting, in-memory tier cache, in-memory push
  token store — see `relayer/src/config.ts`'s comments) — fine for a devnet demo, not for multiple
  relayer instances in production without shared state.
- **Its own keypair, if compromised, lets an attacker impersonate the fee payer** for arbitrary
  (policy-compliant) transactions — it can't steal funds beyond what policy already bounds, but
  it could DoS the real relayer by draining its own SOL faster, or selectively relay. The keypair
  lives in `relayer/.keys/relayer.json`, read from `RELAYER_KEYPAIR_PATH` (env-configured, gitignored)
  — never logged, never sent over the network except as a signature.

## Deposit/withdraw linkability

Wrapping (public USDC → public cUSDC) and unwrapping (public cUSDC → public USDC) are **both
fully public, on-chain, plaintext-amount operations** — `wrap`/`unwrap` move classic SPL tokens
and mint/burn Token-2022 cUSDC with no encryption involved at that step. Anyone watching the chain
can see exactly which wallet wrapped exactly how much USDC, and later which wallet unwrapped
exactly how much back. The privacy Envelope provides is specifically for the **confidential
transfer in between** — what happens to that cUSDC while it's "in the private balance" (sent,
received, pooled) is hidden; the entry and exit points are not.

This means: if the same wallet wraps $500 and later withdraws $500, a chain-watcher learns
"this wallet probably didn't spend anything privately in between" even without seeing any
confidential transfer amounts — the public-balance deltas alone leak information when the
private-balance activity in between doesn't net out close to zero. This is inherent to any
shielded-pool design with a public on-ramp/off-ramp (same class of concern as Zcash's
transparent↔shielded boundary, or Tornado Cash's deposit/withdraw correlation) — Envelope doesn't
attempt to solve it (no delay pools, no amount standardization, no relayer-mediated anonymity set
for wrap/unwrap specifically). A privacy-conscious user should wrap/unwrap in round, common
amounts and expect the _pattern_ of their wrap/unwrap activity (if not the private transfers in
between) to be publicly visible.

## Timing

- **Transaction timing is always public** — block time, slot, and submission order are visible to
  anyone, confidential or not. A chain-watcher who already knows (from off-chain context) that
  wallet A was about to pay wallet B can use timing correlation to raise confidence even without
  ever decrypting an amount.
- **The relayer's `/relay` batches multiple transactions from one plan sequentially, confirming
  each before submitting the next** (fixed during Phase 13 after a real rate-limit-induced
  ordering bug) — this means a confidential transfer's 5–6 transactions land close together in
  time, which is itself a fingerprint distinguishing "a confidential transfer just happened" from
  other relayed activity, even though no amount is visible.
- **The relayer's tier cache (~30s TTL)** means a fee-waiver or limit change from a fresh stake
  takes up to 30 seconds to take effect from the relayer's point of view — a timing quirk, not a
  privacy leak, but worth knowing if a demo stakes and immediately expects the waiver.

## Key storage

- **Wallet signing keys** never leave Mobile Wallet Adapter / the hardware-backed keystore the
  wallet app uses — Envelope never sees them, only ever asks MWA to sign.
- **Confidential-balance keys (ElGamal + AES)** are derived deterministically from one MWA
  signature over a fixed message (`solana-conf-bal/v1` for a wallet, `envelope-pot:<potId>` for a
  pot) and live **only in the WebView bridge's JS memory**, for that session — never written to
  disk, never sent to the relayer or any server, cleared on "Lock" or app reload. The bridge
  itself is a locked-down, offline WebView: `originWhitelist=['about:blank']`,
  `onShouldStartLoadWithRequest={() => false}` (blocks all navigation), `domStorageEnabled={false}`,
  `allowFileAccess={false}`, `allowUniversalAccessFromFileURLs={false}`, loaded from an inlined
  HTML string, not a URL — there's no code-injection or remote-script surface to steal keys from.
- **The _signature_ that re-derives those keys** (not the keys themselves) is persisted via
  `expo-secure-store` with `requireAuthentication: true` (Android Keystore / iOS Keychain,
  biometric-gated on read) — both for a wallet's own keys (Phase 8) and a pot's keys (Phase 15).
  Encrypted at rest either way; the biometric gate is specifically to stop "unlock the phone once,
  read the private balance forever" — an attacker with the unlocked phone but not the fingerprint/
  Face ID still can't replay that signature.
- **Decrypted activity amounts are cached** (`activity-cache.ts`, capped at 30 entries) for
  display convenience — SecureStore-encrypted at rest, deliberately **not** biometric-gated
  (it's not a secret the way a derivation signature is; a user who's already unlocked the private
  balance this session already has equivalent access).
- **No key or signature is ever logged** — verified by grepping every `console.log`/`console.warn`/
  `console.error` call in `packages/cbridge`, `packages/rn-confidential`, `src/`, and `relayer/src`
  during this phase; the only logging touches error messages, status strings, and non-secret
  config (ports, addresses).

## Devnet-only status

Every mint, program, and wallet in this build is devnet-only:

- `config/devnet.json` pins devnet mint/program/account addresses; there's no mainnet config at all.
- cUSDC and mock SKR are mints this project created and controls (via the vault PDA / admin
  wallet respectively) — not real assets.
- The one _real_ external dependency is Circle's actual devnet USDC faucet
  (`faucet.circle.com`) — used purely to exercise the `wrap`/`unwrap` flow against something that
  behaves like real USDC without being real money.
- `<DevnetBadge>` in the app UI and the cluster lock in `src/config/rpc.ts`/`NetworkProvider` are
  the only things stopping this from pointing at mainnet today — both would need deliberate,
  reviewed changes, not just a config flag flip, before any mainnet use.

## CT mint authority — revoke before mainnet

**cUSDC's Token-2022 `ConfidentialTransferMint` extension authority is currently the `admin`
wallet** (set at mint creation in `scripts/setup-mints.ts`'s `ConfidentialTransferMint` extension
config: `authority: admin.address, autoApproveNewAccounts: true, auditorElgamalPubkey: null`).
This authority can:

- Approve or reject new confidential accounts (currently moot — `autoApproveNewAccounts: true`
  means every account auto-approves, so this authority does nothing today).
- **Set an auditor ElGamal public key**, which would let whoever holds that key decrypt _every_
  confidential transfer's amount on this mint, retroactively and going forward — a mint-wide
  privacy bypass, not a per-account one.
- Update the extension's configuration in general.

For a devnet demo, holding this is harmless (it's our own test mint). **Before any mainnet
deployment, this authority must be revoked** (set to `None`, matching the repo's own comment in
`setup-mints.ts`: _"Document: revoke (set to null) before any mainnet use"_) — otherwise the
entity holding it is a permanent, silent privacy backdoor for every confidential transfer on that
mint, which defeats the entire point of using Token-2022 confidential transfers in the first
place. This is the single highest-priority pre-mainnet item in this document.

Separately, cUSDC's **mint authority** (who can mint new supply, distinct from the confidential-
transfer extension authority above) already moved from `admin` to the `envelope_vault` program's
`VaultAuth` PDA back in Phase 6 (`scripts/vault-roundtrip.ts`) — that one's already correctly
scoped to "only mintable 1:1 against a real USDC deposit," not a loose admin key.

## Findings & fixes from this phase's self-audit

A dedicated Rust/Anchor audit pass plus manual review of `relayer/src/policy.ts` surfaced real,
concrete issues — not hypothetical ones. What was found and fixed, versus found and documented as
an accepted devnet-only limitation:

### Fixed

1. **Unprotected program `initialize`** (`envelope_stake` and `envelope_vault`, both
   `instructions/initialize.rs`) — `admin: Signer<'info>` had no check against any expected key,
   so whoever's `initialize` transaction landed first on the parameter-free singleton `Pool`/
   `Config` PDA would permanently own it (Anchor's `init` constraint only ever succeeds once).
   Confirmed independently by multiple audit passes as exploitable pre-deployment (a race against
   the real deploy script) or, worse, capable of setting `member_threshold`/`business_threshold`
   to 0 — which `tier_for_stake`'s `>=` comparison would then read as "every wallet, staked or
   not, qualifies for Member/Business tier," silently defeating the entire tier system. **Fixed**
   by adding `address = ADMIN @ ErrorCode::Unauthorized` to both `Initialize` structs, gated on a
   new hardcoded `ADMIN` constant in each program's `constants.rs` (currently the devnet admin
   wallet — **a real deployment must change this constant to that deployment's actual admin
   key**). Also added `member_threshold > 0` and `cooldown_secs >= 0` validation at the same call
   site, closing two related admin-misconfiguration edges the same audit surfaced. Both programs
   were rebuilt and the devnet deployment upgraded in place (existing `Pool`/`Config`/
   `StakePosition` state is untouched — Solana program upgrades replace code, not data); re-ran
   `scripts/stake-roundtrip.ts` end to end against the upgraded program to confirm no regression.

2. **`envelope_vault::wrap`'s stake-position existence check used `lamports() == 0`, not
   ownership** (`instructions/wrap.rs`'s `read_stake_position`) — since anyone can send a plain
   1-lamport System transfer to any address, including a PDA nobody has created yet, an attacker
   could permanently break any wallet's `wrap()` calls (or anonymously grief every wallet in the
   protocol, cheaply and without the victim's cooperation) by pre-funding that wallet's future
   `StakePosition` PDA before they ever call `stake`. **Fixed** by checking `*info.owner !=
envelope_stake::ID` instead of `lamports() == 0` — a pre-funded-but-uninitialized PDA is still
   System-owned and correctly falls through to "never staked," regardless of its lamport balance.
   Rebuilt, redeployed, re-verified via `stake-roundtrip.ts`.

3. **`relayer/src/policy.ts`'s `CreateAccount` allowance didn't check the new account's owner**
   — the policy only checked the instruction's discriminator, not its `programAddress` field (the
   account's owner-to-be), so a malicious transaction could ask the relayer to fund a
   `CreateAccount` for an account owned by anything — the System program itself, or an attacker's
   own program — producing a relayer-funded, freely-attacker-controlled account with no further
   relayer involvement needed to drain it. **Fixed** by requiring the decoded `programAddress`
   field equal the ZK ElGamal Proof program address specifically.

4. **`relayer/src/policy.ts` never checked _who_ a proof context account's `authority` actually
   is** — being "safely writable" (the relayer's own address appearing in an allowed role) was
   necessary but not sufficient; nothing stopped a transaction from setting a verify/
   `CloseContextState` instruction's authority to an attacker's own key while still having the
   relayer pay the context account's rent via `CreateAccount`. The attacker, as the real
   authority, could then close that account themselves later — no relayer transaction involved —
   and keep the rent the relayer funded. **Fixed** by requiring the authority account (at its
   confirmed fixed index per instruction — index 1 for the three inline-proof verify
   discriminators, index 2 for `CloseContextState`) to equal the relayer's own address.

   Findings 3 and 4 were proven closed with concrete adversarial transactions, not just
   typechecked — see `scripts/fuzz-relayer-policy.ts` (`npx tsx scripts/fuzz-relayer-policy.ts`),
   which builds both malicious instruction shapes and confirms the relayer now rejects each with
   the specific policy violation (not a generic decode failure). The legitimate, no-longer-broken
   path was re-verified via `scripts/test-relayer-confidential-transfer.ts`, which still succeeds
   end to end against the tightened policy.

### Documented, not fixed — accepted devnet-only limitation

5. **Prefund-griefing generalizes beyond the one fixed case.** The same root cause behind finding
   2 — anyone can send lamports to any predictable PDA address before it's legitimately created —
   also affects every other `init`/`init_if_needed` account in both programs (`Pool`, `Config`,
   `StakePosition` itself at `stake` time, `UserDaily`, `Pot`), because Anchor's `init` constraint
   calls System `CreateAccount` underneath, which fails outright if the destination already holds
   any lamports (regardless of owner). An attacker who knows a target wallet's address, or a
   host's intended `pot_id`, can pre-fund that exact PDA for a fraction of a cent and permanently
   block that specific `stake`/`wrap`/`create_pot` call. This is **griefing, not theft** — the
   attacker spends real (if tiny) money for no gain beyond denial-of-service, and it requires
   per-target effort — but it's real and currently unmitigated for these five accounts.
   Properly fixing every instance means replacing Anchor's `init`/`init_if_needed` with manual
   allocate-tolerant-of-existing-lamports logic everywhere, which is a larger, higher-risk change
   than this phase's budget covers; flagged here as the clear next item for any further hardening
   pass, not silently accepted.

6. **`create_pot`'s `pot_owner`/`pot_token_account` fields are unvalidated caller-supplied
   pubkeys** — multiple audit passes confirmed this isn't exploitable _within_ `envelope_vault`
   itself (no instruction in this program ever moves funds through these fields; the actual
   confidential sweep is a separate, off-chain transfer signed by `pot_owner`, by design). The
   risk, if any, is entirely in off-chain trust: Envelope's own app always computes `pot_owner`
   from the deterministic derivation recipe and passes the matching ATA, so the shipped client is
   internally consistent — but nothing on-chain stops a _different_, malicious client from
   registering a pot whose `pot_token_account` doesn't actually match `pot_owner`. Documented,
   not fixed, since it requires an off-chain trust decision (should guests independently verify
   the pairing before contributing?) rather than an on-chain code change.

7. **`close_pot`'s `close_ts` field is stored but never enforced** — a host can close their own
   pot before the advertised close time; `handle_close_pot` only checks `!pot.closed`. Low
   severity (self-harm only — a host closing their own pot early doesn't affect anyone's funds,
   only possibly contributor expectations set off-chain) and arguably intentional (the comment on
   `close_pot.rs` treats the sweep as entirely the host's call) — documented rather than changed,
   since adding a time gate would be a behavior change worth a deliberate product decision, not a
   bug fix.
