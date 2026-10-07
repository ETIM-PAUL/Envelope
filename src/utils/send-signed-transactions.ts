import type { Base64EncodedWireTransaction, GetSignatureStatusesApi, Rpc, SendTransactionApi } from '@solana/kit'
import { isExpiredTransactionError } from './format-error'
import { withNetworkRetry } from './network-retry'
import { waitForConfirmation } from './wait-for-confirmation'

// Submits base64 wire transactions the cbridge WebView already fully signed (see
// ensureAccountReady/buildTransferPlan in packages/cbridge) — the bridge only builds and signs,
// "React Native only signs (MWA) and sends" (Phase 3 design), so submitting is this app's job.
// Sequential, not parallel: later transactions in a plan can depend on earlier ones landing first
// (e.g. reallocating an account before enabling an extension on it).
export async function sendSignedTransactions(
  rpc: Rpc<SendTransactionApi & GetSignatureStatusesApi>,
  signedTransactionsBase64: string[],
): Promise<void> {
  for (const wireBase64 of signedTransactionsBase64) {
    const signature = await resendWhileBlockhashUnknown(() =>
      withNetworkRetry(() =>
        rpc.sendTransaction(wireBase64 as Base64EncodedWireTransaction, { encoding: 'base64' }).send(),
      ),
    )
    await waitForConfirmation(rpc, signature)
  }
}

// "Blockhash not found" from preflight right after signing usually means the blockhash is too
// *new* for the RPC node that checked it — public devnet load-balances across nodes that can lag
// a few slots, and the wallet may have re-stamped the transaction from its own, newer node. The
// same signed transaction is valid again a moment later, so resend it (same signature: it can
// only ever land once) before giving up; only then does retryOnExpiry ask the wallet again.
const BLOCKHASH_LAG_WINDOW_MS = 8_000
const BLOCKHASH_LAG_DELAY_MS = 1_000

async function resendWhileBlockhashUnknown<T>(send: () => Promise<T>): Promise<T> {
  const deadline = Date.now() + BLOCKHASH_LAG_WINDOW_MS
  for (;;) {
    try {
      return await send()
    } catch (error) {
      if (!isExpiredTransactionError(error) || Date.now() >= deadline) throw error
      await new Promise((resolve) => setTimeout(resolve, BLOCKHASH_LAG_DELAY_MS))
    }
  }
}
