// Phase 11: recent confidential-transfer activity, decrypted via the bridge (`decryptActivity`)
// and merged into the local encrypted cache (activity-cache.ts) so older entries survive even
// once they fall outside what a fresh fetch re-decrypts.
import { useCBridge } from '@envelope/rn-confidential'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { requireMints } from '../../config/devnet-config'
import { DEVNET_RPC_URL } from '../../config/rpc'
import { useAppStore } from '../../store/app-store'
import { mergeActivityCache, readActivityCache } from './activity-cache'
import { useConfidentialKeys } from '../keys/use-confidential-keys'
import { activityCacheQueryKey } from '../notifications/use-notifications'

const FETCH_LIMIT = 20

export function useActivity() {
  const bridge = useCBridge()
  const walletAddress = useAppStore((s) => s.walletAddress)
  const { keysUnlocked } = useConfidentialKeys()
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['activity', walletAddress],
    enabled: Boolean(walletAddress && keysUnlocked && bridge.ready),
    // Show the cache immediately (readActivityCache), then refresh in the background —
    // decrypting each transaction's proof instruction is real work, not instant.
    placeholderData: (previous) => previous,
    queryFn: async () => {
      const { cusdc } = requireMints()
      const [cached, { entries: fresh }] = await Promise.all([
        readActivityCache(walletAddress!),
        bridge.call('decryptActivity', {
          rpcUrl: DEVNET_RPC_URL,
          mint: cusdc,
          owner: walletAddress!,
          limit: FETCH_LIMIT,
        }),
      ])
      if (fresh.length === 0) return cached
      const merged = await mergeActivityCache(walletAddress!, fresh)
      // The Notifications feed (and its tab badge) reads this cache directly.
      void queryClient.invalidateQueries({ queryKey: activityCacheQueryKey(walletAddress) })
      return merged
    },
  })

  return { entries: query.data ?? [], isLoading: query.isLoading, refetch: query.refetch }
}
