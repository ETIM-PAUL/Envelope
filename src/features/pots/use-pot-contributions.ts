// Phase 15: the host's pot dashboard data — total (via the same decryptAvailable every wallet
// uses, just pointed at the pot's own address) and the per-contributor breakdown
// (decryptPotActivity). Both need the pot's session keys already registered in the bridge
// (derivePotKeys/restorePotKeys), same precondition as every other confidential-balance read.
import { useCBridge } from '@envelope/rn-confidential'
import { useQuery } from '@tanstack/react-query'
import { requireMints } from '../../config/devnet-config'
import { DEVNET_RPC_URL } from '../../config/rpc'
import { useAppStore } from '../../store/app-store'
import { recordPotContributions } from '../notifications/use-notifications'

export function usePotContributions(potOwnerAddress: string | null) {
  const bridge = useCBridge()
  const walletAddress = useAppStore((s) => s.walletAddress)

  return useQuery({
    queryKey: ['pot-contributions', potOwnerAddress],
    enabled: Boolean(potOwnerAddress && bridge.ready),
    queryFn: async () => {
      const { cusdc } = requireMints()
      const { contributions } = await bridge.call('decryptPotActivity', {
        rpcUrl: DEVNET_RPC_URL,
        mint: cusdc,
        potOwner: potOwnerAddress!,
      })
      if (walletAddress) await recordPotContributions(walletAddress, potOwnerAddress!, contributions)
      return contributions
    },
  })
}
