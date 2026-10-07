// Which tokens a pot accepts. Not stored anywhere: a pot accepts exactly the tokens it has a ready
// confidential account for (createPot sets one up per chosen token — see CreatePotParams), so
// on-chain state is the source of truth, a guest can never be offered a token the pot can't
// receive, and pots from before cSKR existed (one cUSDC account) need no migration.
import { useCBridge, type CBridgeApi } from '@envelope/rn-confidential'
import { useQuery } from '@tanstack/react-query'
import { availableAssetIds, getAsset, type AssetId } from '../../config/assets'
import { DEVNET_RPC_URL } from '../../config/rpc'

export async function fetchPotAssets(bridge: CBridgeApi, potOwnerAddress: string): Promise<AssetId[]> {
  const ready = await Promise.all(
    availableAssetIds().map(async (asset) => {
      const { ready } = await bridge.call('isAccountReady', {
        rpcUrl: DEVNET_RPC_URL,
        mint: getAsset(asset).confidentialMint,
        owner: potOwnerAddress,
      })
      return ready ? asset : null
    }),
  )
  return ready.filter((asset): asset is AssetId => asset !== null)
}

export function usePotAssets(potOwnerAddress: string | null) {
  const bridge = useCBridge()
  return useQuery({
    queryKey: ['pot-assets', potOwnerAddress],
    enabled: Boolean(potOwnerAddress && bridge.ready),
    queryFn: () => fetchPotAssets(bridge, potOwnerAddress!),
    staleTime: Infinity, // fixed at creation
  })
}
