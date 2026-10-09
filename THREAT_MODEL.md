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
  itself is a locked-down WebView: `originWhitelist=['https://envelope.internal/']`,
  `onShouldStartLoadWithRequest={() => false}` (blocks all navigation), `domStorageEnabled={false}`,
  `allowFileAccess={false}`, `allowUniversalAccessFromFileURLs={false}`, loaded from an inlined
  HTML string, not a URL — there's no code-injection or remote-script surface to steal keys from.
  (`https://envelope.internal/` is a fake `baseUrl` that is never fetched: it only makes the page a
  secure context so `crypto.subtle` is available. The bridge's only network traffic is RPC calls
  to the Solana endpoint.)
- **The zk-sdk WebAssembly is a rebuild, not the npm binary.** The published `@solana/zk-sdk`
  needs WebAssembly reference types (Chrome 96+), which phones with frozen WebViews (Huawei, no
  Google services) lack. `packages/cbridge/vendor/zk-sdk-web` is the same version (0.5.3) built
  from Solana's tagged source without that feature. Trust doesn't rest on the checked-in binary:
  `packages/cbridge/scripts/build-zk-sdk-compat.sh` reproduces it from the upstream tag, and its
  keys, ciphertexts, and proofs were cross-checked against the published build (identical key
  derivation; proofs from each verify under the other).
- **The _signature_ that re-derives those keys** (not the keys themselves) is persisted via
  `expo-secure-store` with `requireAuthentication: true` (Android Keystore / iOS Keychain,
  biometric-gated on read) — both for a wallet's own keys (Phase 8) and a pot's keys (Phase 15).
  Encrypted at rest either way; the biometric gate is specifically to stop "unlock the phone once,
  read the private balance forever" — an attacker with the unlocked phone but not the fingerprint/
  Face ID still can't replay that signature. Persisting is best-effort: on devices that can't do
  biometric-gated storage (some Huawei phones report "biometric status unknown" even with a
  fingerprint enrolled), the signature is **not kept at all** — never stored without the gate —
  and the app asks the wallet to sign again on the next open.
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

## Automated security scans — triage

Two automated scans have run: a static-analysis scan on 6 October 2026 (source patterns,
dependency advisories, credentials, deployment config, Anchor program structure; 279 files), and
the hackathon's AI scanner on 9 October 2026. Neither reported a confirmed defect in Envelope's own
code. Both flagged the same three "high" Anchor leads for review, plus package and configuration
findings. Each was checked against the code. The three Anchor leads are also pinned down by tests
that assert the exact on-chain error, and the checks, results and transaction links are in
[docs/VERIFY.md](docs/VERIFY.md).

### Fixed

- **Relayer container ran as root, from a moving base tag** (`relayer/Dockerfile`) — it now runs
  as the image's unprivileged `node` user, owning only the faucet ledger directory, and the base
  image is pinned to a `sha256` digest.
- **Program crates had no license** — `anchor/Cargo.toml` now declares Apache-2.0 for the
  workspace (metadata only; the deployed programs are unchanged).
- **`uuid` 7.0.3** (Medium, GHSA-w5hq-g745-h8pq) — now 11.1.1 through an npm `overrides` entry.
  Only Expo's Xcode project tooling uses it, at build time, and only `uuid.v4()`, which 11.x
  keeps. The Android prebuild still passes. (The advisory covers v3/v5/v6 with a caller-supplied
  buffer, so 7.0.3 wasn't affected in practice.)

### Checked, not a defect

| Finding (severity as reported)                                                                                            | Why it doesn't apply                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `init_if_needed` on `stake_position` / `user_daily` (High)                                                                | Both are PDAs seeded by the signer, so an existing account can only be the caller's own. Neither handler relies on init-time zeroing: `stake` rejects a pending unstake and adds to the balance; `wrap` re-checks `day_index` and resets the daily total itself. Both re-set the owner field every call. Tests: a second wrap (with a different rent payer) updates the same record; another wallet's daily record or stake position is refused with `ConstraintSeeds`. |
| Type cosplay in `wrap`'s stake-position read (High)                                                                       | The account is checked to be owned by `envelope_stake`, deserialized with Anchor's discriminator check, its `user` field must equal the signer, and its address is pinned by `seeds::program`. Tests: another wallet's real `StakePosition`, and a `Pass` (an `envelope_stake` account of another type), are both refused with `ConstraintSeeds`.                                                                                                                       |
| User and vault token accounts "not constrained to be distinct" in `stake`, `withdraw_unstaked`, `wrap`, `unwrap` (Medium) | The vault accounts are ATAs owned by program PDAs (`pool_authority`, `vault_authority`) and pinned by `address = …`; the user accounts must be owned by the signer. One account can't satisfy both, since a signer can't equal an off-curve PDA.                                                                                                                                                                                                                        |
| `stake_position` written after a CPI without reload in `withdraw_unstaked` (Medium)                                       | The CPI is an SPL Token transfer between token accounts; it can't modify a `StakePosition`, which only `envelope_stake` owns.                                                                                                                                                                                                                                                                                                                                           |
| "Missing owner check" on admin, host, and user accounts (Low)                                                             | Anchor's `Account<T>` checks the program owner; authorization is enforced by `address = ADMIN`, `has_one = host`/`user`, and signer-derived seeds.                                                                                                                                                                                                                                                                                                                      |
| "Account reinitialization" on `init` (Low)                                                                                | Anchor's `init` fails if the account already exists.                                                                                                                                                                                                                                                                                                                                                                                                                    |
| "CpiContext target unresolved" (Low)                                                                                      | The target comes from `Program<'info, Token>` / `Program<'info, Token2022>`, which Anchor checks against the real program ID.                                                                                                                                                                                                                                                                                                                                           |
| `hello_world` findings (Low)                                                                                              | Leftover template program, not deployed and not used by Envelope.                                                                                                                                                                                                                                                                                                                                                                                                       |

### Packages — accepted for now

- **`decode-uri-component` 0.2.2** (Medium, ships in the app via `expo-router` → `query-string`):
  a malformed percent-encoded link can make decoding slow. Worst case is the app freezing while a
  link a user chose to open is parsed; no funds or keys are reachable. The fixed release (0.5.0) is
  ESM-only and `query-string` 7 `require()`s it, so forcing it would break link handling — it'll
  be picked up when Expo moves to a fixed `query-string`.
- **`bincode` 1.3.3 unmaintained** (Medium) — a transitive dependency of the Solana/Anchor crates,
  with no maintained replacement upstream yet. An advisory about maintenance, not a known
  vulnerability.

## Confidential SKR (cSKR)

`envelope_vault` gained a second wrappable asset alongside USDC <-> cUSDC: an `AssetVault` per
underlying mint, registered by the admin with `initialize_asset` and used through `wrap_asset` /
`unwrap_asset` (SKR <-> cSKR on devnet). The USDC path and its `Config` are unchanged.

- **Registration is checked on-chain, once.** `initialize_asset` is admin-only (`address = ADMIN`)
  and refuses a confidential mint the vault can't mint (`mint_authority` must be the vault PDA),
  one whose decimals differ from the underlying's, or the underlying mint itself — so `wrap_asset`
  can't be pointed at a mint that breaks the 1:1 backing.
- **Every account is pinned.** The AssetVault PDA is seeded by the underlying mint; the vault's
  token account and the confidential mint must match what it recorded (`address = …`); the user's
  accounts must be owned by the signer and of the recorded mints.
- **Unwrap burns as delegate**, exactly like `unwrap`: the client submits `[Approve(vault PDA,
amount), unwrap_asset(amount)]` in one transaction, so CPI Guard can stay on.
- **No tier limits on SKR.** Daily limits exist to cap dollars entering the private system; SKR
  is the ecosystem's own token and wraps without a limit. A deliberate product choice.
- **Supply invariant:** cSKR supply equals the SKR held by the vault, checked after every step of
  `npm run devnet:cskr-roundtrip`. Seven Anchor tests cover the instructions, including the
  rejections above.

## Gift links

A gift is a one-off "gift wallet" whose keys come from a random 32-byte secret: SHA-256 of
`envelope-gift:` and the secret gives its Ed25519 seed, and its confidential keys are derived from
that keypair the way any wallet's are. The sender's phone generates the secret, sets up the gift's
confidential account (rent from the sender's gas tank), and funds it with an ordinary private
send. The amount is hidden exactly as in any transfer. The link is
`<relayer>/gift#<secret>`.

- **The secret never reaches a server.** It's after the `#`, which browsers don't send. The
  relayer's `/gift` page is static: its own script reads the fragment and builds the
  `envelope://gift?k=…` app link. The page sets `Referrer-Policy: no-referrer`.
- **A gift link is a bearer instrument.** Whoever opens it first can claim it, and a claim can't
  be undone. The app says so when the link is created. Until a gift is claimed, the sender can
  take it back: the secret is kept on the sending phone in SecureStore (Keystore-encrypted). It is
  deliberately not behind the biometric gate, because losing it would mean losing the only way
  to take an unclaimed gift back, and the same secret is already in the shared link.
- **Claiming needs no approval and no SOL.** The bridge holds the gift's keypair, which
  authorizes applying its pending balance, moving the whole available balance to the claimer, and
  closing the account. The claimer's gas tank pays (a new user's first, free fuel refill covers
  it). The account's rent goes to the claimer's gas tank on close, and a closed account spends the
  link.
- **Linkability.** On-chain, a gift is a transfer from the sender to the gift account, then one
  from the gift account to the claimer, so who-paid-whom is visible through the intermediary.
  The relayer sees the funding transfer like any send; it isn't involved in the claim.
- **Race.** If a link leaks, whoever claims first wins, the sender's take-back included. Expiring
  gifts that return to the sender automatically would need on-chain support (see Future work in
  the README).

Verified on devnet in [docs/VERIFY.md](docs/VERIFY.md): a brand-new wallet with no SOL claims a
gift with only the secret and no wallet approval, the gift account ends up closed, and the amount
appears nowhere in the gift's transactions.

## Batch send

A batch builds each transfer's proofs against the source balance the _previous_ transfer leaves
behind, computed off-chain with the same Ristretto subtraction Token-2022 performs on-chain. A
wrong computation can't move funds: the on-chain equality proof check fails and that transfer
(and everything after it) is rejected. The relayer submits and confirms each transaction in order,
which the chain of proofs requires. A batch carries one SKR fee per transfer (free tier).

## Membership passes and SKR fuel

**Passes (`envelope_stake::buy_pass`).** A pass is SKR transferred to a treasury account fixed in
`PassConfig` (admin-set, once) for a tier and expiry. The PDA is seeded by the buyer, so
`init_if_needed` can only ever touch the caller's own pass, and every field is rewritten on each
purchase. Same-tier purchases extend from the current expiry; a higher tier starts now (the rest of
the lower pass is not refunded — the app says so); a lower tier while a higher one is active is
rejected. `wrap` reads the pass the same way it reads a stake position (owner check, Anchor
discriminator, `user` field, `seeds::program`) and uses whichever tier is higher. A pass separates
rent payer from buyer, so the buyer's gas tank can pay.

**Perks.** Daily dollar limits are enforced on-chain (`wrap`). The relayer enforces the send fee
(one per private transfer in a request) and the batch size (private transfers per request). Pot
limits (open pots, dollars-and-SKR pots) are enforced by the app only — pots don't touch the
relayer, and the program has no notion of tier for them. A modified client could exceed them; the
cost is extra pots, not anyone's funds.

**Fuel (`relayer/src/fuel.ts`).** The relayer refills a wallet's gas tank with SOL so the wallet
never needs any. Bounded so it can't be drained:

- A refill only happens when the tank is below 0.01 SOL, tops it up to 0.025 SOL, and at most 3
  times per wallet per day.
- A wallet's tank is bound on its first refill; refills to any other address are refused.
- Paid refills (Free tier) are built by the relayer and co-signed only if the signed transaction
  still contains exactly the quoted SOL transfer to exactly the bound tank, the SKR price to the
  relayer, and nothing else besides compute-budget price instructions under the cap.
- The relayer never funds accounts other people can close: rent is paid from the user's own gas
  tank, which holds SOL the user was given (welcome or member refill) or bought with SKR.
- **Devnet-only allowance:** every wallet's first refill is free, so a brand-new user with neither
  SOL nor SKR can start. A fresh wallet costs nothing to make, so on mainnet this must be gated
  (e.g. on the Seeker Genesis Token) or removed.
- **The fuel ledger isn't durable on the hosted relayer** (found 9 October 2026). Tank bindings,
  daily refill counts and who has had the welcome refill live in a JSON file
  (`relayer/.data/fuel.json`). The devnet relayer runs on Render's free tier, whose disk is wiped
  on every deploy or restart. After one, every wallet can take the welcome refill again, daily
  caps restart, and tanks can be re-bound. The amounts per refill are still capped, so this is a
  devnet cost, not a way to take funds. Mainnet needs a persistent store (a database, or a
  mounted disk) before fuel is enabled.
