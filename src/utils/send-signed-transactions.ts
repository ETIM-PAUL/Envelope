import type { Base64EncodedWireTransaction, GetSignatureStatusesApi, Rpc, SendTransactionApi } from '@solana/kit'
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
    const signature = await withNetworkRetry(() =>
      rpc.sendTransaction(wireBase64 as Base64EncodedWireTransaction, { encoding: 'base64' }).send(),
    )
    await waitForConfirmation(rpc, signature)
  }
}
