// Phase 18 self-audit: "Error states for: RPC failure, relayer down, proof failure, insufficient
// balance, recipient not ready." The last two are handled with dedicated UI copy at each call
// site (see send-confirm.tsx/withdraw.tsx's `overBalance` checks, send.tsx/pay/[owner].tsx's
// `isRecipientReady` checks) — this is the shared fallback for the other three, which otherwise
// surface whatever raw message the network stack or the ZK proof layer happened to throw
// (`TypeError: fetch failed`, `HTTP error (429): Too Many Requests`, etc.) — translated to
// something a user can actually act on, before falling back to the raw message for anything
// unrecognized rather than losing information.
function translateKnownError(message: string): string | null {
  if (/fetch failed|ECONNREFUSED|Network request failed/i.test(message)) {
    return "Can't reach the relayer — check your connection and try again."
  }
  if (/429|Too Many Requests/i.test(message)) {
    return 'The network is busy right now — try again in a moment.'
  }
  if (/WebSocket failed to connect/i.test(message)) {
    return 'Lost connection while confirming — check your connection and try again.'
  }
  return null
}

export function formatError(error: unknown): string {
  const raw = (() => {
    if (error instanceof Error) return error.message
    if (error && typeof error === 'object' && 'message' in error) return String(error.message)
    if (typeof error === 'string' && error.trim().length > 0) return error
    return 'Unknown error occurred'
  })()

  return translateKnownError(raw) ?? raw
}
