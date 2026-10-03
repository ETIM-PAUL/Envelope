// JSON-RPC-over-postMessage protocol shared between the WebView bridge (this package's built
// bundle) and its React Native host (@envelope/rn-confidential). Both directions use the same
// envelope shape: a message carrying `method` is a call, one carrying `result`/`error` is a
// response to a call the receiver made earlier. Each side tracks its own outgoing calls, so the
// two directions never need to share an id namespace.
export type RpcCall<TMethod extends string = string, TParams = unknown> = Readonly<{
  id: string
  method: TMethod
  params: TParams
}>

export type RpcResponse<TResult = unknown> =
  Readonly<{ id: string; result: TResult }> | Readonly<{ id: string; error: string }>

export type RpcMessage = RpcCall | RpcResponse

export function isRpcCall(message: RpcMessage): message is RpcCall {
  return 'method' in message
}

// --- Methods the host (React Native) calls on the bridge (WebView) ---

export type PingParams = Record<string, never>
export type PingResult = { ok: true; wasmReady: boolean }

// Derives the wallet's confidential ElGamal + AES keys (one MWA `signMessage` round-trip via the
// `signMessage` host method) and keeps them in the bridge's memory for the rest of the session —
// only the public ElGamal key and the derivation signature ever cross back over the bridge, never
// the derived secret keys themselves. `signatureBase64` is the raw Ed25519 signature over the
// fixed `solana-conf-bal/v1` derivation message (see @solana-program/token-2022's
// `deriveConfidentialKeys`) — Phase 8 persists it (biometric-gated) so `restoreKeys` can
// reconstruct the same keys later without another MWA prompt: signing the same fixed message with
// the same wallet key is deterministic (RFC 8032), so replaying this signature is equivalent to
// signing again.
export type DeriveKeysParams = { owner: string }
export type DeriveKeysResult = { elgamalPubkeyBase58: string; signatureBase64: string }

// Reconstructs the same session keys `deriveKeys` would, from a previously captured derivation
// signature — no `signMessage` host round-trip, so no MWA prompt.
export type RestoreKeysParams = { owner: string; signatureBase64: string }
export type RestoreKeysResult = { elgamalPubkeyBase58: string }

// Wipes every owner's session keys from the bridge's memory ("Lock" button). Stored derivation
// signatures (secure-store, RN side) are untouched — locking only clears in-memory WebView state,
// not the ability to unlock again.
export type LockKeysParams = Record<string, never>
export type LockKeysResult = { ok: true }

// Builds a confidential transfer with `feePayer` (the relayer) as fee payer and rent payer for
// the proof context accounts — `owner` must have called `deriveKeys` first. `owner`'s signature
// (authority over the transfer, via the `signTransaction` host method / MWA) is obtained and
// attached; the relayer's own fee-payer signature slot is deliberately left empty (`createNoopSigner`
// — see @solana/signers, documented for exactly this "server will countersign and submit" case).
// The bridge never sees a MWA-controlled private key, and never sees the relayer's key either.
// Returns base64 wire transactions *partially* signed (owner's signature present, relayer's slot
// empty) — ready to POST to the relayer's `/relay` endpoint, not to submit directly.
export type BuildTransferPlanParams = {
  rpcUrl: string
  mint: string
  owner: string
  destinationOwner: string
  amount: string // stringified bigint, base units
  feePayer: string // the relayer's address — fee payer + proof-context rent payer
  // Present for free-tier senders (ask the relayer's GET /tier/:wallet) — a classic-Token SKR
  // transfer from `owner` to `feePayer`, prepended as its own small transaction ahead of the
  // transfer plan's own transactions. Omit entirely for Member/Business tiers, which are exempt.
  feeInstruction?: { skrMint: string; amount: string }
}
export type BuildTransferPlanResult = { signedTransactions: string[] }

export type DecryptAvailableParams = { rpcUrl: string; mint: string; owner: string }
export type DecryptAvailableResult = { availableBalance: string; pendingBalance: string }

// Phase 14: applies `owner`'s pending confidential balance (from incoming transfers/deposits) to
// their available balance — the standalone version of the third instruction
// use-add-to-private-balance.ts's deposit flow already includes inline. `owner` pays their own fee
// here (single signer, no relayer involvement) — same as ensureAccountReady, matching the existing
// precedent that account-maintenance operations are owner-pays while only Send is relayer-sponsored.
// A no-op (empty `signedTransactions`) when there's nothing pending, so callers can invoke this
// unconditionally on app open without an extra round trip to check first. `payer` (Phase 15):
// same override as EnsureAccountReadyParams, for applying a pot's pending contributions.
export type ApplyPendingBalanceParams = { rpcUrl: string; mint: string; owner: string; payer?: string }
export type ApplyPendingBalanceResult = { signedTransactions: string[] }

// Phase 9: gets `owner`'s cUSDC account from nothing to "ready to send and receive privately" in
// one call — creates the ATA if needed, reallocates + configures the `ConfidentialTransferAccount`
// extension (verifying the ZK pubkey-validity proof against the already-derived session keys —
// `owner` must have called `deriveKeys`/`restoreKeys` first), and reallocates + enables
// `CpiGuard`. Idempotent: only the steps the account is actually missing are included, so a
// second call on an already-ready account returns `alreadyReady: true` with nothing to sign.
// Like `buildTransferPlan`, this only builds and signs — the host submits `signedTransactions`.
// `payer` (Phase 15): defaults to `owner` — set it to a different address (the pot's host) when
// `owner` is a pot's derived identity, which never holds any SOL of its own to pay rent with.
export type EnsureAccountReadyParams = { rpcUrl: string; mint: string; owner: string; payer?: string }
export type EnsureAccountReadyResult = { alreadyReady: boolean; signedTransactions: string[] }

// Read-only "is this address ready to receive?" check — no session keys needed (it's not
// `owner`'s own account), just on-chain state: the ATA exists and its `ConfidentialTransferAccount`
// extension is configured. Deliberately doesn't check `CpiGuard`: that protects the account's own
// owner from malicious CPI, not something a sender needs before transferring to them.
export type IsAccountReadyParams = { rpcUrl: string; mint: string; owner: string }
export type IsAccountReadyResult = { ready: boolean }

// Phase 10: the one piece of "add to private balance" that needs a session key. `wrap` (mints
// public cUSDC) and `Deposit` (public -> pending) are plain, deterministic instructions the host
// builds itself (no secret material involved); only `ApplyPendingBalance`'s
// `newDecryptableAvailableBalance` argument needs the AES key to compute — this returns exactly
// that (plus the matching `expectedPendingBalanceCreditCounter`) as raw values, not a built
// instruction, so the host assembles all three instructions into one transaction and gets a
// single MWA signature for the whole "Add $50" action. `amount` is the deposit about to happen
// (same transaction, later instruction) — the bridge fetches the account's *pre*-deposit on-chain
// state itself and accounts for the deposit's own effect (available + pending + amount, credit
// counter + 1) since there's no way to re-fetch mid-transaction.
export type PrepareApplyPendingBalanceParams = { rpcUrl: string; mint: string; owner: string; amount: string }
export type PrepareApplyPendingBalanceResult = {
  newDecryptableAvailableBalanceBase64: string
  expectedPendingBalanceCreditCounter: string // stringified bigint
}

// Phase 11: decrypts recent confidential-transfer activity for `owner`'s cUSDC account —
// incoming and outgoing amounts, each recovered from that transfer's own historical transaction
// data (not live account state, which only reflects the *current* balance). Each confidential
// `Transfer` instruction's amount is encrypted three ways (source, destination, auditor handles)
// inside its paired ZK "ciphertext validity" proof instruction in the same transaction; `owner`
// decrypts whichever handle applies to them with their own ElGamal secret key — never the other
// party's. This exact recipe (proof discriminator, context byte layout, handle index per
// direction) was verified against a real devnet transfer with a known amount before being built
// here; none of it is documented in @solana/zk-sdk's public API. `owner` must have called
// `deriveKeys`/`restoreKeys` first.
export type ActivityDirection = 'incoming' | 'outgoing'
export type ActivityEntry = {
  signature: string
  direction: ActivityDirection
  amount: string // stringified bigint, base units
  blockTime: number | null
}
export type DecryptActivityParams = { rpcUrl: string; mint: string; owner: string; limit?: number }
export type DecryptActivityResult = { entries: ActivityEntry[] }

// Phase 15: a pot's own signing + confidential-balance identity, derived entirely from one MWA
// signature the host makes over `envelope-pot:<potId>` — never stored raw, recoverable any time by
// re-signing the same fixed message. The signature hashes (SHA-256) to a 32-byte seed for a real
// Ed25519 keypair (`@solana/keys`' `createKeyPairFromPrivateKeyBytes`); that keypair then signs
// its own `deriveWalletConfidentialKeys` derivation message locally (no second MWA round trip) to
// get its ElGamal/AES confidential-balance keys, exactly like a normal wallet would for itself.
// The pot's signing keypair is kept in-memory (alongside session keys) so the bridge can sign
// pot-authority instructions (`createPot`, `closePot`) itself — MWA only ever signs for the host's
// own connected wallet, never for the pot's derived address.
export type DerivePotKeysParams = { owner: string; potId: string }
export type DerivePotKeysResult = { potOwnerAddress: string; elgamalPubkeyBase58: string; signatureBase64: string }

// Reconstructs a pot's identity from a previously captured derivation signature — no MWA prompt,
// same recipe as `restoreKeys`.
export type RestorePotKeysParams = { owner: string; potId: string; signatureBase64: string }
export type RestorePotKeysResult = { potOwnerAddress: string; elgamalPubkeyBase58: string }

// Builds everything needed to stand up a new pot in one call: the on-chain `create_pot` instruction
// (envelope_vault) plus the pot's own Token-2022 account (ATA + ConfidentialTransferAccount +
// CpiGuard, same steps `ensureAccountReady` does for a wallet). `host` pays every fee — the pot
// itself never holds SOL. `potOwner` must have already been derived via `derivePotKeys`/
// `restorePotKeys` in this session. `potId` is a stringified u64; `closeTs` a stringified i64
// (unix seconds); `name` is sent as plain text and padded/truncated to the on-chain 32-byte field.
export type CreatePotParams = {
  rpcUrl: string
  mint: string
  host: string
  potOwner: string
  potId: string
  name: string
  closeTs: string
}
export type CreatePotResult = { signedTransactions: string[] }

// Builds the on-chain `close_pot` instruction plus (if the pot has a balance) applying its pending
// contributions and sweeping the full available balance to `host` — all one call, `host`-paid,
// `potOwner`-authorized (signed locally, no MWA). Safe to call on a pot with zero balance: the
// sweep step is simply omitted.
export type ClosePotParams = { rpcUrl: string; mint: string; host: string; potOwner: string; potId: string }
export type ClosePotResult = { signedTransactions: string[] }

// The host's pot dashboard: every contribution decrypted with the pot's own ElGamal key, each
// tagged with its contributor's wallet address — resolved from the confidential Transfer
// instruction's source token account, not guessed. A pot only ever receives (contributions) until
// it's closed, so unlike `decryptActivity` this never needs an `outgoing` direction.
export type PotContribution = {
  signature: string
  contributor: string
  amount: string // stringified bigint, base units
  blockTime: number | null
}
export type DecryptPotActivityParams = { rpcUrl: string; mint: string; potOwner: string; limit?: number }
export type DecryptPotActivityResult = { contributions: PotContribution[] }

// Phase 17: the confidential half of "withdraw to USDC" — moves `amount` from `owner`'s
// confidential available balance to their account's *public* cUSDC balance (equality + range
// proofs, context accounts, same machinery buildTransferPlan/applyPendingBalance already use).
// `owner` pays their own fee here, like every other self-serve balance operation
// (ensureAccountReady, applyPendingBalance) — only Send is relayer-sponsored. This is
// deliberately a separate call from the `[Approve, Unwrap]` step that follows it: that step
// needs the public cUSDC this mints to have actually landed on-chain first (its proofs would
// otherwise be built, and unwrap's balance check run, against stale pre-withdraw state) — same
// landing-order reasoning as closePot's apply-then-sweep split. The host builds and signs
// `[Approve(vaultAuthority, amount), unwrap(amount)]` itself afterward (plain instructions, no
// secret material, same precedent as `wrap` in use-add-to-private-balance.ts).
export type BuildWithdrawPlanParams = { rpcUrl: string; mint: string; owner: string; amount: string }
export type BuildWithdrawPlanResult = { signedTransactions: string[] }

export type BridgeMethodMap = {
  ping: { params: PingParams; result: PingResult }
  deriveKeys: { params: DeriveKeysParams; result: DeriveKeysResult }
  restoreKeys: { params: RestoreKeysParams; result: RestoreKeysResult }
  lockKeys: { params: LockKeysParams; result: LockKeysResult }
  buildTransferPlan: { params: BuildTransferPlanParams; result: BuildTransferPlanResult }
  decryptAvailable: { params: DecryptAvailableParams; result: DecryptAvailableResult }
  ensureAccountReady: { params: EnsureAccountReadyParams; result: EnsureAccountReadyResult }
  isAccountReady: { params: IsAccountReadyParams; result: IsAccountReadyResult }
  prepareApplyPendingBalance: { params: PrepareApplyPendingBalanceParams; result: PrepareApplyPendingBalanceResult }
  applyPendingBalance: { params: ApplyPendingBalanceParams; result: ApplyPendingBalanceResult }
  decryptActivity: { params: DecryptActivityParams; result: DecryptActivityResult }
  derivePotKeys: { params: DerivePotKeysParams; result: DerivePotKeysResult }
  restorePotKeys: { params: RestorePotKeysParams; result: RestorePotKeysResult }
  createPot: { params: CreatePotParams; result: CreatePotResult }
  closePot: { params: ClosePotParams; result: ClosePotResult }
  decryptPotActivity: { params: DecryptPotActivityParams; result: DecryptPotActivityResult }
  buildWithdrawPlan: { params: BuildWithdrawPlanParams; result: BuildWithdrawPlanResult }
}

export type BridgeMethod = keyof BridgeMethodMap

// --- Methods the bridge (WebView) calls back on the host (React Native) ---

// Off-chain message signature — used once per owner, for the confidential-key derivation.
export type SignMessageParams = { address: string; messageBase64: string }
export type SignMessageResult = { signatureBase64: string }

// Transaction signatures — every transaction a flow needs from the wallet, in ONE request, so the
// user sees one approval screen per flow. Both directions carry *whole* wire transactions (every
// required signer's slot, filled or empty), not bare messages or signatures: wallets are allowed
// to modify what they sign (Solflare appends its own ComputeBudget priority-fee instructions to
// every transaction), so the signed transactions that come back are the source of truth — their
// messages may differ from the ones sent, and each signature is only valid for its returned
// message. Same order and count in as out.
export type SignTransactionsParams = { address: string; transactionsBase64: string[] }
export type SignTransactionsResult = { signedTransactionsBase64: string[] }

export type HostMethodMap = {
  signMessage: { params: SignMessageParams; result: SignMessageResult }
  signTransactions: { params: SignTransactionsParams; result: SignTransactionsResult }
}

export type HostMethod = keyof HostMethodMap
