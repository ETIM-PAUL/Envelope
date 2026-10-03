import { isExpiredTransactionError } from './format-error'

// A wallet-signed transaction can only use a blockhash lifetime (~150 blocks, ~36s on devnet at
// times — Solflare rejects durable nonces, see packages/cbridge/src/signPlan.ts), so a slow
// approval can expire it before it lands. `attempt` must rebuild everything from a fresh
// blockhash each time: the wallet is simply asked again. Nothing from an expired attempt ever
// executes on-chain, so repeating it is safe; any other error is rethrown untouched.
const MAX_ATTEMPTS = 3

export async function retryOnExpiry<T>(attempt: () => Promise<T>): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await attempt()
    } catch (error) {
      if (i >= MAX_ATTEMPTS || !isExpiredTransactionError(error)) throw error
    }
  }
}
