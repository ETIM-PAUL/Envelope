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
  let lastPollError: unknown
  while (Date.now() - startedAt < timeoutMs) {
    let status
    try {
      ;({
        value: [status],
      } = await rpc.getSignatureStatuses([transactionSignature]).send())
      lastPollError = undefined
    } catch (error) {
      // The transaction is already submitted, so one failed status poll — a DNS blip right after
      // the app returns from the wallet (seen repeatedly on the emulator), a rate limit — says
      // nothing about whether it landed. Keep polling; only the timeout gives up.
      lastPollError = error
    }
    if (status?.err) {
      throw new Error(`Transaction ${transactionSignature} failed: ${JSON.stringify(status.err)}`)
    }
    if (status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized') {
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000))
  }
  // Still unreachable at the deadline: surface the connection error itself, not a timeout.
  if (lastPollError) throw lastPollError
  throw new Error(`Timed out waiting for transaction ${transactionSignature} to confirm.`)
}
