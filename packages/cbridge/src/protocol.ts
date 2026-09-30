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

// Builds and fully signs a confidential transfer — `owner` must have called `deriveKeys` first.
// `owner` also pays its own fees in this single-signer spike (no relayer yet — see Phase 12).
// Every required signature is obtained via the `signTransaction` host method (MWA); the bridge
// never sees a MWA-controlled private key. Returns base64 wire transactions ready to send as-is.
export type BuildTransferPlanParams = {
  rpcUrl: string
  mint: string
  owner: string
  destinationOwner: string
  amount: string // stringified bigint, base units
}
export type BuildTransferPlanResult = { signedTransactions: string[] }

export type DecryptAvailableParams = { rpcUrl: string; mint: string; owner: string }
export type DecryptAvailableResult = { availableBalance: string; pendingBalance: string }

// Phase 9: gets `owner`'s cUSDC account from nothing to "ready to send and receive privately" in
// one call — creates the ATA if needed, reallocates + configures the `ConfidentialTransferAccount`
// extension (verifying the ZK pubkey-validity proof against the already-derived session keys —
// `owner` must have called `deriveKeys`/`restoreKeys` first), and reallocates + enables
// `CpiGuard`. Idempotent: only the steps the account is actually missing are included, so a
// second call on an already-ready account returns `alreadyReady: true` with nothing to sign.
// Like `buildTransferPlan`, this only builds and signs — the host submits `signedTransactions`.
export type EnsureAccountReadyParams = { rpcUrl: string; mint: string; owner: string }
export type EnsureAccountReadyResult = { alreadyReady: boolean; signedTransactions: string[] }

// Read-only "is this address ready to receive?" check — no session keys needed (it's not
// `owner`'s own account), just on-chain state: the ATA exists and its `ConfidentialTransferAccount`
// extension is configured. Deliberately doesn't check `CpiGuard`: that protects the account's own
// owner from malicious CPI, not something a sender needs before transferring to them.
export type IsAccountReadyParams = { rpcUrl: string; mint: string; owner: string }
export type IsAccountReadyResult = { ready: boolean }

export type BridgeMethodMap = {
  ping: { params: PingParams; result: PingResult }
  deriveKeys: { params: DeriveKeysParams; result: DeriveKeysResult }
  restoreKeys: { params: RestoreKeysParams; result: RestoreKeysResult }
  lockKeys: { params: LockKeysParams; result: LockKeysResult }
  buildTransferPlan: { params: BuildTransferPlanParams; result: BuildTransferPlanResult }
  decryptAvailable: { params: DecryptAvailableParams; result: DecryptAvailableResult }
  ensureAccountReady: { params: EnsureAccountReadyParams; result: EnsureAccountReadyResult }
  isAccountReady: { params: IsAccountReadyParams; result: IsAccountReadyResult }
}

export type BridgeMethod = keyof BridgeMethodMap

// --- Methods the bridge (WebView) calls back on the host (React Native) ---

// Off-chain message signature — used once per owner, for the confidential-key derivation.
export type SignMessageParams = { address: string; messageBase64: string }
export type SignMessageResult = { signatureBase64: string }

// Transaction signature — used per transaction in a plan, for the owner's authority/fee-payer
// signature. `messageBase64` is the transaction's compiled message bytes (`transaction.messageBytes`),
// matching what MWA's `signMessages`/raw-sign API expects.
export type SignTransactionParams = { address: string; messageBase64: string }
export type SignTransactionResult = { signatureBase64: string }

export type HostMethodMap = {
  signMessage: { params: SignMessageParams; result: SignMessageResult }
  signTransaction: { params: SignTransactionParams; result: SignTransactionResult }
}

export type HostMethod = keyof HostMethodMap
