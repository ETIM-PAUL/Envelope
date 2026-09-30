// Phase 11: "cache decrypted amounts locally (encrypted at rest)." SecureStore's values are
// always encrypted at rest (Android Keystore / iOS Keychain) regardless of `requireAuthentication`
// — that flag is for biometric-gating a *read*, which this cache doesn't need (it's convenience,
// not a secret the way Phase 8's derivation signature is). Capped to the most recent entries:
// SecureStore is meant for small values, not an unbounded growing list.
import * as SecureStore from 'expo-secure-store'
import type { ActivityDirection } from '@envelope/cbridge'

const MAX_CACHED_ENTRIES = 30

export type CachedActivityEntry = {
  signature: string
  direction: ActivityDirection
  amount: string
  blockTime: number | null
}

function keyFor(owner: string): string {
  return `envelope-activity-cache-${owner}`
}

export async function readActivityCache(owner: string): Promise<CachedActivityEntry[]> {
  const raw = await SecureStore.getItemAsync(keyFor(owner)).catch(() => null)
  if (!raw) return []
  try {
    return JSON.parse(raw) as CachedActivityEntry[]
  } catch {
    return []
  }
}

// Merges freshly decrypted entries into the existing cache (dedup by signature, freshest data
// wins), sorts newest-first, caps the length, and persists — returning the merged list so callers
// don't need a second read.
export async function mergeActivityCache(
  owner: string,
  freshEntries: CachedActivityEntry[],
): Promise<CachedActivityEntry[]> {
  const existing = await readActivityCache(owner)
  const bySignature = new Map(existing.map((entry) => [entry.signature, entry]))
  for (const entry of freshEntries) bySignature.set(entry.signature, entry)

  const merged = [...bySignature.values()]
    .sort((a, b) => (b.blockTime ?? 0) - (a.blockTime ?? 0))
    .slice(0, MAX_CACHED_ENTRIES)

  await SecureStore.setItemAsync(keyFor(owner), JSON.stringify(merged))
  return merged
}
