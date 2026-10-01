// Polls for a transaction signature to reach 'confirmed' — used between transactions in a
// /relay batch, since later transactions in an instruction plan can depend on earlier ones having
// already landed (see index.ts's /relay handler for the real failure this was written to fix).
import { rpc } from './config.ts'

const POLL_INTERVAL_MS = 1_000
const TIMEOUT_MS = 30_000

export async function confirmSignature(signature: string): Promise<void> {
  const deadline = Date.now() + TIMEOUT_MS
  while (Date.now() < deadline) {
    try {
      const { value } = await rpc
        .getSignatureStatuses([signature as Parameters<typeof rpc.getSignatureStatuses>[0][0]])
        .send()
      const status = value[0]
      if (status?.err) {
        throw new Error(`transaction ${signature} failed on-chain: ${JSON.stringify(status.err)}`)
      }
      if (status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized') {
        return
      }
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('transaction')) throw err
      // The public devnet RPC rate-limits aggressively (see this repo's other devnet scripts) —
      // a transient failure on a status poll isn't a reason to fail the whole relay, just retry.
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
  }
  throw new Error(`timed out waiting for ${signature} to confirm`)
}
