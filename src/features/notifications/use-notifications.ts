// The Notifications tab's feed: this device's own log (deposits, withdrawals, pots, staking — see
// notification-log.ts) merged with private sends and receives from the decrypted transfer history.
// Reads the history from its local cache only, so the tab badge never costs network round trips;
// the Notifications screen refreshes that history (and any unlocked pots' contributions) itself.
import { useCBridge } from '@envelope/rn-confidential'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo } from 'react'
import { requireMints } from '../../config/devnet-config'
import { DEVNET_RPC_URL } from '../../config/rpc'
import { useAppStore } from '../../store/app-store'
import { readActivityCache } from '../account/activity-cache'
import { listPotSummaries } from '../pots/pot-store'
import {
  markNotificationsSeen,
  readLastSeen,
  readNotificationLog,
  recordNotifications,
  subscribeToNotificationLog,
  type LoggedNotificationKind,
} from './notification-log'

export type NotificationKind = LoggedNotificationKind | 'received' | 'sent'

export type AppNotification = {
  id: string
  kind: NotificationKind
  amount?: string
  label?: string
  at: number
}

export const activityCacheQueryKey = (owner: string | null) => ['activity-cache', owner]

export function useNotifications() {
  const owner = useAppStore((s) => s.walletAddress)
  const queryClient = useQueryClient()

  const log = useQuery({
    queryKey: ['notification-log', owner],
    enabled: Boolean(owner),
    queryFn: () => readNotificationLog(owner!),
  })
  const transfers = useQuery({
    queryKey: activityCacheQueryKey(owner),
    enabled: Boolean(owner),
    queryFn: () => readActivityCache(owner!),
  })
  const lastSeen = useQuery({
    queryKey: ['notifications-seen', owner],
    enabled: Boolean(owner),
    queryFn: async () => {
      const seen = await readLastSeen(owner!)
      // Never opened before: start from now, so existing history doesn't arrive as a wall of unread.
      if (seen === 0) {
        const now = Date.now()
        await markNotificationsSeen(owner!, now)
        return now
      }
      return seen
    },
  })

  useEffect(
    () =>
      subscribeToNotificationLog(() => {
        void queryClient.invalidateQueries({ queryKey: ['notification-log', owner] })
        void queryClient.invalidateQueries({ queryKey: ['notifications-seen', owner] })
      }),
    [queryClient, owner],
  )

  const items = useMemo<AppNotification[]>(() => {
    const fromTransfers: AppNotification[] = (transfers.data ?? []).map((entry) => ({
      id: entry.signature,
      kind: entry.direction === 'incoming' ? 'received' : 'sent',
      amount: entry.amount,
      at: (entry.blockTime ?? 0) * 1000,
    }))
    return [...(log.data ?? []), ...fromTransfers].sort((a, b) => b.at - a.at)
  }, [log.data, transfers.data])

  const seenAt = lastSeen.data ?? Number.POSITIVE_INFINITY
  const unreadCount = items.filter((item) => item.at > seenAt).length

  const markAllSeen = useCallback(async () => {
    if (owner) await markNotificationsSeen(owner, Date.now())
  }, [owner])

  return { items, unreadCount, lastSeenAt: lastSeen.data ?? null, markAllSeen, isLoading: log.isLoading }
}

// Records pot contributions as "X cUSDC received for <pot>" notifications. Called wherever they've
// just been decrypted; contributions already recorded are skipped (dedup by signature).
export async function recordPotContributions(
  owner: string,
  potOwnerAddress: string,
  contributions: { signature: string; amount: string; blockTime: number | null }[],
): Promise<void> {
  if (contributions.length === 0) return
  const pot = (await listPotSummaries(owner)).find((p) => p.potOwnerAddress === potOwnerAddress)
  await recordNotifications(
    owner,
    contributions.map((contribution) => ({
      id: `pot-received-${contribution.signature}`,
      kind: 'pot-received' as const,
      amount: contribution.amount,
      label: pot?.name,
      at: contribution.blockTime ? contribution.blockTime * 1000 : undefined,
    })),
  )
}

// Checks every pot whose keys are already unlocked in this session for new contributions. A pot
// that isn't unlocked is skipped — unlocking needs a fingerprint, and a notifications refresh
// shouldn't be the thing that asks for one.
export function useRefreshPotContributions() {
  const bridge = useCBridge()
  const owner = useAppStore((s) => s.walletAddress)

  return useCallback(async () => {
    if (!owner || !bridge.ready) return
    const { cusdc } = requireMints()
    for (const pot of await listPotSummaries(owner)) {
      try {
        const { contributions } = await bridge.call('decryptPotActivity', {
          rpcUrl: DEVNET_RPC_URL,
          mint: cusdc,
          potOwner: pot.potOwnerAddress,
        })
        await recordPotContributions(owner, pot.potOwnerAddress, contributions)
      } catch {
        // Not unlocked this session (or the network blipped) — picked up next time.
      }
    }
  }, [bridge, owner])
}
