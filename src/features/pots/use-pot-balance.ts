// Phase 15: the pot's own decrypted total — usePrivateBalance's logic, but parameterized on an
// arbitrary owner address instead of the connected wallet, since a pot's "owner" is its own
// derived identity, not anything useMobileWallet() knows about.
import { useCBridge } from '@envelope/rn-confidential'
import { useQuery } from '@tanstack/react-query'
import { getAsset, type AssetId } from '../../config/assets'
import { DEVNET_RPC_URL } from '../../config/rpc'

export function usePotBalance(potOwnerAddress: string | null, asset: AssetId = 'usdc', enabled = true) {
  const bridge = useCBridge()

  const query = useQuery({
    queryKey: ['pot-balance', potOwnerAddress, asset],
    enabled: Boolean(enabled && potOwnerAddress && bridge.ready),
    queryFn: async () => {
      const { availableBalance, pendingBalance } = await bridge.call('decryptAvailable', {
        rpcUrl: DEVNET_RPC_URL,
        mint: getAsset(asset).confidentialMint,
        owner: potOwnerAddress!,
      })
      return { availableBalance: BigInt(availableBalance), pendingBalance: BigInt(pendingBalance) }
    },
  })

  return {
    availableBalance: query.data?.availableBalance ?? null,
    pendingBalance: query.data?.pendingBalance ?? null,
    isLoading: query.isLoading,
  }
}
