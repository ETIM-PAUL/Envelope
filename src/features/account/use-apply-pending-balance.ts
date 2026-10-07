// Phase 14: applies any pending confidential balance to the available balance — owner pays their
// own (small, single-signer) fee, same pattern as ensureAccountReady, no relayer involved. The
// bridge method itself no-ops (empty signedTransactions) when nothing's pending, so this is safe
// to call unconditionally on app open / on a push notification.
import { useCBridge } from '@envelope/rn-confidential'
import { useMobileWallet } from '@wallet-ui/react-native-kit'
import type { GetSignatureStatusesApi, Rpc, SendTransactionApi } from '@solana/kit'
import { useCallback } from 'react'
import { availableAssetIds, getAsset, type AssetId } from '../../config/assets'
import { DEVNET_RPC_URL } from '../../config/rpc'
import { sendSignedTransactions } from '../../utils/send-signed-transactions'
import { retryOnExpiry } from '../../utils/retry-on-expiry'
import { useAppStore } from '../../store/app-store'
import { usePrivateBalance } from './use-private-balance'

export function useApplyPendingBalance() {
  const bridge = useCBridge()
  const { client } = useMobileWallet()
  const walletAddress = useAppStore((s) => s.walletAddress)
  const { refetchBalance } = usePrivateBalance()

  const applyPendingBalance = useCallback(
    async (asset: AssetId = 'usdc'): Promise<boolean> => {
      if (!walletAddress) throw new Error('connect a wallet first')
      if (!bridge.ready) throw new Error('confidential bridge is not ready yet')

      const applied = await retryOnExpiry(async () => {
        const { signedTransactions } = await bridge.call('applyPendingBalance', {
          rpcUrl: DEVNET_RPC_URL,
          mint: getAsset(asset).confidentialMint,
          owner: walletAddress,
        })
        if (signedTransactions.length === 0) return false

        await sendSignedTransactions(
          client.rpc as unknown as Rpc<SendTransactionApi & GetSignatureStatusesApi>,
          signedTransactions,
        )
        return true
      })
      if (!applied) return false
      await refetchBalance()
      return true
    },
    [bridge, walletAddress, client, refetchBalance],
  )

  // Every token, one after another; a token with no account yet (never enabled) has nothing
  // pending and is skipped by the bridge. One token failing doesn't stop the others.
  const applyAllPending = useCallback(async (): Promise<void> => {
    for (const asset of availableAssetIds()) {
      await applyPendingBalance(asset).catch(() => false)
    }
  }, [applyPendingBalance])

  return { applyPendingBalance, applyAllPending }
}
