import { isConnectionError } from './format-error'

// Right after the app comes back from the wallet, Android takes a moment to restore its network
// access (it's blocked while the app is in the background — `blocked=APP_BACKGROUND`), and the
// first requests fail DNS ("Unable to resolve host") even though the network is fine. Those
// requests never left the device, so repeating them is always safe — including submitting an
// already-signed transaction. Anything other than a connection failure is rethrown immediately.
const WINDOW_MS = 10_000
const DELAY_MS = 750

export async function withNetworkRetry<T>(request: () => Promise<T>): Promise<T> {
  const deadline = Date.now() + WINDOW_MS
  for (;;) {
    try {
      return await request()
    } catch (error) {
      if (!isConnectionError(error) || Date.now() >= deadline) throw error
      await new Promise((resolve) => setTimeout(resolve, DELAY_MS))
    }
  }
}
