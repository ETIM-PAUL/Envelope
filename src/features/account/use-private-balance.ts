// Decrypts the connected wallet's available cUSDC balance via the bridge's already-derived AES
// key (`decryptAvailable`, built in Phase 2/3). Only needs `keysUnlocked` — no wrap/deposit logic
// here, just reading and showing what's already on-chain.
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
      const { availableBalance } = await bridge.call('decryptAvailable', {
        rpcUrl: DEVNET_RPC_URL,
        mint: cusdc,
        owner: walletAddress!,
      })
      return BigInt(availableBalance)
    },
  })

  const queryClient = useQueryClient()
  const refetchBalance = () => queryClient.invalidateQueries({ queryKey: balanceQueryKey(walletAddress) })

  return { availableBalance: query.data ?? null, isLoading: query.isLoading, refetchBalance }
}
