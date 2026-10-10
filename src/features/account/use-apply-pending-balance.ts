// Phase 14: moves a pending confidential balance (incoming private payments, a claimed gift) into
// the available balance. The wallet signs as the account's owner; the gas tank pays the fee, so a
// wallet with no SOL can do it (SKR fuel). The bridge no-ops (no transactions) when nothing is
// pending. Only ever run because the user asked: Home's "Add to balance", or the end of a claim.
import { useCBridge } from '@envelope/rn-confidential'
import { useMobileWallet } from '@wallet-ui/react-native-kit'
import type { GetSignatureStatusesApi, Rpc, SendTransactionApi } from '@solana/kit'
import { useCallback } from 'react'
import { getAsset, type AssetId } from '../../config/assets'
import { DEVNET_RPC_URL } from '../../config/rpc'
import { sendSignedTransactions } from '../../utils/send-signed-transactions'
import { retryOnExpiry } from '../../utils/retry-on-expiry'
import { useAppStore } from '../../store/app-store'
import { useGasTank } from '../wallet/use-gas-tank'
import { usePrivateBalance } from './use-private-balance'

export function useApplyPendingBalance() {
  const bridge = useCBridge()
  const { client } = useMobileWallet()
  const walletAddress = useAppStore((s) => s.walletAddress)
  const { refetchBalance } = usePrivateBalance()
  const { ensureGasTank } = useGasTank()

  const applyPendingBalance = useCallback(
    async (asset: AssetId = 'usdc'): Promise<boolean> => {
      if (!walletAddress) throw new Error('connect a wallet first')
      if (!bridge.ready) throw new Error('confidential bridge is not ready yet')

      await ensureGasTank()
      const applied = await retryOnExpiry(async () => {
        const { signedTransactions } = await bridge.call('applyPendingBalance', {
          rpcUrl: DEVNET_RPC_URL,
          mint: getAsset(asset).confidentialMint,
          owner: walletAddress,
          // The wallet's gas tank pays (the bridge resolves this address to it).
          payer: walletAddress,
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
    [bridge, walletAddress, client, refetchBalance, ensureGasTank],
  )

  return { applyPendingBalance }
}
