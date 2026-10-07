// The Notifications tab's own record of fund movements this device performs or observes — the
// ones that don't show up in the decrypted transfer history (activity-cache.ts covers private
// sends/receives): deposits, withdrawals, pot lifecycle and contributions, staking. Kept in
// SecureStore like the activity cache — amounts here are exactly what the confidential balance
// hides, so they stay encrypted at rest — and capped, since SecureStore is for small values.
import * as SecureStore from 'expo-secure-store'
import type { AssetId } from '../../config/assets'

export type LoggedNotificationKind =
  | 'deposit'
  | 'withdraw'
  | 'pot-created'
  | 'pot-closed'
  | 'pot-received'
  | 'stake'
  | 'unstake-requested'
  | 'unstake-withdrawn'
  | 'faucet'

export type LoggedNotification = {
  id: string
  kind: LoggedNotificationKind
  amount?: string // stringified bigint, base units (6 decimals: cUSDC, or SKR for staking)
  asset?: AssetId // which token `amount` is in; absent on older entries, which are all dollars
  label?: string // pot name
  at: number // ms since epoch
}

const MAX_ENTRIES = 50

const logKey = (owner: string) => `envelope-notifications-${owner}`
const seenKey = (owner: string) => `envelope-notifications-seen-${owner}`

const listeners = new Set<() => void>()
export function subscribeToNotificationLog(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
const emit = () => listeners.forEach((listener) => listener())

export async function readNotificationLog(owner: string): Promise<LoggedNotification[]> {
  const raw = await SecureStore.getItemAsync(logKey(owner)).catch(() => null)
  if (!raw) return []
  try {
    return JSON.parse(raw) as LoggedNotification[]
  } catch {
    return []
  }
}

// Writes are chained so two recordings landing together (e.g. several pot contributions decrypted
// at once) can't read the same old list and overwrite each other.
let writes: Promise<unknown> = Promise.resolve()

export function recordNotifications(
  owner: string,
  entries: (Omit<LoggedNotification, 'at'> & { at?: number })[],
): Promise<void> {
  const write = writes.then(async () => {
    const existing = await readNotificationLog(owner)
    const byId = new Map(existing.map((entry) => [entry.id, entry]))
    let added = false
    for (const entry of entries) {
      if (byId.has(entry.id)) continue // already recorded (same deposit/contribution seen again)
      byId.set(entry.id, { ...entry, at: entry.at ?? Date.now() })
      added = true
    }
    if (!added) return
    const merged = [...byId.values()].sort((a, b) => b.at - a.at).slice(0, MAX_ENTRIES)
    await SecureStore.setItemAsync(logKey(owner), JSON.stringify(merged))
    emit()
  })
  writes = write.catch(() => undefined)
  return write
}

export function recordNotification(owner: string, entry: Omit<LoggedNotification, 'at'> & { at?: number }) {
  return recordNotifications(owner, [entry])
}

// "Seen" is a single timestamp: everything at or before it has been looked at.
export async function readLastSeen(owner: string): Promise<number> {
  const raw = await SecureStore.getItemAsync(seenKey(owner)).catch(() => null)
  return raw ? Number(raw) : 0
}

export async function markNotificationsSeen(owner: string, at: number): Promise<void> {
  await SecureStore.setItemAsync(seenKey(owner), String(at))
  emit()
}
