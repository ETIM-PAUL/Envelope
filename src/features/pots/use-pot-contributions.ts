// Phase 15: the host's pot dashboard data — total (via the same decryptAvailable every wallet
// uses, just pointed at the pot's own address) and the per-contributor breakdown
// (decryptPotActivity). Both need the pot's session keys already registered in the bridge
// (derivePotKeys/restorePotKeys), same precondition as every other confidential-balance read.
import type { PotContribution as BridgePotContribution } from '@envelope/cbridge'
import { useCBridge } from '@envelope/rn-confidential'
import { useQuery } from '@tanstack/react-query'
import { getAsset, type AssetId } from '../../config/assets'
import { DEVNET_RPC_URL } from '../../config/rpc'
import { useAppStore } from '../../store/app-store'
import { recordPotContributions } from '../notifications/use-notifications'

export type PotContribution = BridgePotContribution & { asset: AssetId }

// Every token the pot accepts (`assets`, from usePotAssets), merged newest first.
export function usePotContributions(potOwnerAddress: string | null, assets: AssetId[] | undefined) {
  const bridge = useCBridge()
  const walletAddress = useAppStore((s) => s.walletAddress)

  return useQuery({
    queryKey: ['pot-contributions', potOwnerAddress, assets?.join(',')],
    enabled: Boolean(potOwnerAddress && bridge.ready && assets),
    queryFn: async (): Promise<PotContribution[]> => {
      const all: PotContribution[] = []
      for (const asset of assets!) {
        const { contributions } = await bridge.call('decryptPotActivity', {
          rpcUrl: DEVNET_RPC_URL,
          mint: getAsset(asset).confidentialMint,
          potOwner: potOwnerAddress!,
        })
        if (walletAddress) await recordPotContributions(walletAddress, potOwnerAddress!, contributions, asset)
        all.push(...contributions.map((contribution) => ({ ...contribution, asset })))
      }
      return all.sort((a, b) => (b.blockTime ?? 0) - (a.blockTime ?? 0))
    },
  })
}
