import type { GetSignatureStatusesApi, Rpc, Signature } from '@solana/kit'

// Narrowed to just the one capability this actually calls, rather than a full `Rpc` client type:
// wallet-ui's `client.rpc` comes from its own internal `@solana/kit` (a different major version
// than this app's, structurally compatible but not nominally identical), so requiring the whole
// branded client type here rejects it even though it has everything this function needs.
export async function waitForConfirmation(
  rpc: Rpc<GetSignatureStatusesApi>,
  transactionSignature: Signature,
  timeoutMs = 30_000,
) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    const {
      value: [status],
    } = await rpc.getSignatureStatuses([transactionSignature]).send()
    if (status?.err) {
      throw new Error(`Transaction ${transactionSignature} failed: ${JSON.stringify(status.err)}`)
    }
    if (status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized') {
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000))
  }
  throw new Error(`Timed out waiting for transaction ${transactionSignature} to confirm.`)
}
