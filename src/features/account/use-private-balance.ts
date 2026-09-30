// Decrypts the connected wallet's cUSDC balance via the bridge's already-derived keys
// (`decryptAvailable`, built in Phase 2/3): available (AES, fast) and pending (ElGamal, slower —
// see protocol.ts). Only needs `keysUnlocked`; both come back from the same bridge call, so
// there's one loading state for the pair, not a separate spinner per Phase 11's plan wording.
import { useCBridge } from '@envelope/rn-confidential'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { requireMints } from '../../config/devnet-config'
import { DEVNET_RPC_URL } from '../../config/rpc'
import { useAppStore } from '../../store/app-store'
import { useConfidentialKeys } from '../keys/use-confidential-keys'

function balanceQueryKey(owner: string | null) {
  return ['private-balance', owner]
}

export function usePrivateBalance() {
  const bridge = useCBridge()
  const walletAddress = useAppStore((s) => s.walletAddress)
  const { keysUnlocked } = useConfidentialKeys()

  const query = useQuery({
    queryKey: balanceQueryKey(walletAddress),
    enabled: Boolean(walletAddress && keysUnlocked && bridge.ready),
    queryFn: async () => {
      const { cusdc } = requireMints()
      const { availableBalance, pendingBalance } = await bridge.call('decryptAvailable', {
        rpcUrl: DEVNET_RPC_URL,
        mint: cusdc,
        owner: walletAddress!,
      })
      return { availableBalance: BigInt(availableBalance), pendingBalance: BigInt(pendingBalance) }
    },
  })

  const queryClient = useQueryClient()
  const refetchBalance = () => queryClient.invalidateQueries({ queryKey: balanceQueryKey(walletAddress) })

  return {
    availableBalance: query.data?.availableBalance ?? null,
    pendingBalance: query.data?.pendingBalance ?? null,
    isLoading: query.isLoading,
    refetchBalance,
  }
}
