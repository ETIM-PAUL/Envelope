// Per-wallet sliding-window rate limit. In-memory: fine for a single-process devnet relayer; a
// production deployment behind multiple instances would need a shared store (Redis etc.) instead.
import { policyConfig } from './config.ts'

const requestTimestamps = new Map<string, number[]>()

export function checkRateLimit(owner: string): { allowed: boolean; retryAfterMs?: number } {
  const now = Date.now()
  const windowStart = now - policyConfig.rateLimitWindowMs
  const timestamps = (requestTimestamps.get(owner) ?? []).filter((t) => t > windowStart)

  if (timestamps.length >= policyConfig.rateLimitMaxRequests) {
    const oldestInWindow = timestamps[0]!
    requestTimestamps.set(owner, timestamps)
    return { allowed: false, retryAfterMs: oldestInWindow + policyConfig.rateLimitWindowMs - now }
  }

  timestamps.push(now)
  requestTimestamps.set(owner, timestamps)
  return { allowed: true }
}
