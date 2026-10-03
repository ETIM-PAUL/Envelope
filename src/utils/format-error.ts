// Phase 18 self-audit: "Error states for: RPC failure, relayer down, proof failure, insufficient
// balance, recipient not ready." The last two are handled with dedicated UI copy at each call
// site (see send-confirm.tsx/withdraw.tsx's `overBalance` checks, send.tsx/pay/[owner].tsx's
// `isRecipientReady` checks) — this is the shared fallback for the other three, which otherwise
// surface whatever raw message the network stack or the ZK proof layer happened to throw
// (`TypeError: fetch failed`, `HTTP error (429): Too Many Requests`, etc.) — translated to
// something a user can actually act on, before falling back to the raw message for anything
// unrecognized rather than losing information.
// envelope_vault's ErrorCode::DailyLimitExceeded is Anchor custom error index 1 -> code 6001
// (0x1771) — Anchor errors don't come back with their #[msg(...)] text over the RPC, just this
// number, so matching it is the only way to show the friendly message instead of a raw hex code.
// Was previously matched ad hoc in add-funds.tsx against formatError's *output* — moved here (and
// checked before the generic simulation-failure patterns below) so a broader pattern can't shadow
// it first and strip the hex code the caller needed to see.
const DAILY_LIMIT_EXCEEDED_CODE = '0x1771'

// Most specific checks first — a program error's raw text can also contain generic phrases like
// "Transaction simulation failed", so a specific match must win before the catch-alls below do.
function translateKnownError(message: string): string | null {
  // Not "the relayer" specifically — most flows never touch it, and these fire for any request
  // that couldn't connect at all (no network, DNS failure, RPC or relayer down).
  if (CONNECTION_ERROR.test(message)) {
    return "Can't connect to the network — check your connection and try again."
  }
  if (/429|Too Many Requests/i.test(message)) {
    return 'The network is busy right now — try again in a moment.'
  }
  if (/WebSocket failed to connect/i.test(message)) {
    return 'Lost connection while confirming — check your connection and try again.'
  }
  // User backed out of the wallet's approval screen (Android's MWA throws this as a raw
  // CancellationException) — not a failure, just nothing to do.
  if (/CancellationException|request declined|user rejected/i.test(message)) {
    return "You didn't approve the request, so nothing was sent."
  }
  if (message.includes(DAILY_LIMIT_EXCEEDED_CODE)) {
    return "You've hit today's limit for your tier — stake SKR to raise it."
  }
  // The wallet simulated the transaction before showing the approval screen and it would have
  // failed on-chain — most often insufficient balance. The raw message ("Transaction simulation
  // failed: ...") rarely has more for us to go on without parsing program logs, so point at the
  // most common cause rather than showing the raw RPC text.
  if (/insufficient funds|insufficient lamports|insufficient.*balance/i.test(message)) {
    return "You don't have enough balance to cover this, including network fees."
  }
  if (/[Bb]lockhash not found|block height exceeded/i.test(message)) {
    return 'That took too long to confirm — try again.'
  }
  // A bridge call reached the WebView before its session's confidential keys were (re)loaded —
  // should be rare now that the flows that need keys load them first, but if it ever surfaces,
  // "try again" is accurate: the in-memory keys just need re-deriving, which the normal
  // enable/unlock flow does automatically on next attempt.
  if (/call deriveKeys\(/.test(message)) {
    return 'Your private balance needs to be unlocked again — try that first.'
  }
  // Catch-alls last, once every pattern with something more specific to say has had a chance.
  if (/[Tt]ransaction simulation failed|[Ss]imulation failed/.test(message)) {
    return "That couldn't go through — try again in a moment."
  }
  // A raw @solana/kit SolanaError ("Solana error #NNNNNNN; Decode this error by running...") —
  // every code we specifically handle is caught above; anything else reaching here genuinely
  // has no better user-facing text than a generic retry prompt.
  if (/Solana error #\d+/.test(message)) {
    return 'Something went wrong talking to Solana — try again in a moment.'
  }
  return null
}

function messageOf(error: unknown): string | null {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'message' in error) return String((error as { message: unknown }).message)
  if (typeof error === 'string' && error.trim().length > 0) return error
  return null
}

// Wrapper errors (e.g. @solana/instruction-plans' "failed to execute transaction plan") carry the
// actual on-chain/RPC failure in `.cause`, not their own message — walk the chain so pattern
// matching sees the real reason instead of just the generic outer wrapper text. Capped depth: a
// cause chain that's still unresolved after 5 hops is a cycle or isn't going to resolve further.
function causeChainMessages(error: unknown): string[] {
  const messages: string[] = []
  let current = error
  for (let depth = 0; depth < 5 && current; depth++) {
    const message = messageOf(current)
    if (message) messages.push(message)
    current = current instanceof Error ? current.cause : undefined
  }
  return messages
}

const CONNECTION_ERROR =
  /fetch failed|Failed to fetch|ECONNREFUSED|Network request failed|UnknownHostException|Unable to resolve host/i

// A request that never reached the server (no network, DNS failure, server down).
export function isConnectionError(error: unknown): boolean {
  return causeChainMessages(error).some((message) => CONNECTION_ERROR.test(message))
}

// A transaction submitted after its blockhash expired — a wallet approval that took longer than
// the ~150-block lifetime. Safe to rebuild with a fresh blockhash and ask again.
export function isExpiredTransactionError(error: unknown): boolean {
  return causeChainMessages(error).some((message) =>
    /blockhash not found|block ?height exceeded|transaction (has )?expired/i.test(message),
  )
}

export function formatError(error: unknown): string {
  const chain = causeChainMessages(error)
  // Most specific (deepest) message first for display fallback, but pattern-match against the
  // whole chain joined together — a specific pattern might only appear in an outer wrapper's
  // message, or only in the innermost cause, depending on which library threw it.
  const raw = chain.at(-1) ?? 'Unknown error occurred'
  const friendly = translateKnownError(chain.join(' | '))
  // Keep the real error chain in the dev console — the user only ever sees `friendly`, but
  // whoever's looking at logs (us, right now, debugging over someone's shoulder) still needs it.
  if (friendly) console.warn('[formatError] translated:', chain)
  return friendly ?? raw
}
