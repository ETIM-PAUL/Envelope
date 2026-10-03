// Phase 15: "Close pot" — apply the pot's pending contributions first and let it land (host
// pays), then build + submit close_pot plus the confidential sweep to the host, in that strict
// order. See packages/cbridge/src/bridge.ts's closePot doc comment for why these can't be one
// bridge call: the sweep's proofs need the pot's *post-apply* on-chain state, which only exists
// once the apply transaction has actually confirmed.
import { useCBridge } from '@envelope/rn-confidential'
import { useMobileWallet } from '@wallet-ui/react-native-kit'
import type { GetSignatureStatusesApi, Rpc, SendTransactionApi } from '@solana/kit'
import { useCallback } from 'react'
import { requireMints } from '../../config/devnet-config'
import { DEVNET_RPC_URL } from '../../config/rpc'
import { sendSignedTransactions } from '../../utils/send-signed-transactions'
import { retryOnExpiry } from '../../utils/retry-on-expiry'
import { useAppStore } from '../../store/app-store'
import { listPotSummaries, removePotSummary } from './pot-store'
import { recordNotification } from '../notifications/notification-log'
import { useGasTank } from '../wallet/use-gas-tank'

export function useClosePot() {
  const bridge = useCBridge()
  const { client } = useMobileWallet()
  const walletAddress = useAppStore((s) => s.walletAddress)
  const { ensureGasTank } = useGasTank()

  const closePot = useCallback(
    async (potOwnerAddress: string, potId: string): Promise<void> => {
      if (!walletAddress) throw new Error('connect a wallet first')
      if (!bridge.ready) throw new Error('confidential bridge is not ready yet')
      const { cusdc } = requireMints()
      const rpc = client.rpc as unknown as Rpc<SendTransactionApi & GetSignatureStatusesApi>
      await ensureGasTank()

      await retryOnExpiry(async () => {
        const { signedTransactions: applyTransactions } = await bridge.call('applyPendingBalance', {
          rpcUrl: DEVNET_RPC_URL,
          mint: cusdc,
          owner: potOwnerAddress,
          payer: walletAddress,
        })
        if (applyTransactions.length > 0) {
          await sendSignedTransactions(rpc, applyTransactions)
        }
      })

      await retryOnExpiry(async () => {
        const { signedTransactions } = await bridge.call('closePot', {
          rpcUrl: DEVNET_RPC_URL,
          mint: cusdc,
          host: walletAddress,
          potOwner: potOwnerAddress,
          potId,
        })
        await sendSignedTransactions(rpc, signedTransactions)
      })

      const pot = (await listPotSummaries(walletAddress)).find((p) => p.potId === potId)
      await removePotSummary(walletAddress, potId)
      await recordNotification(walletAddress, { id: `pot-closed-${potId}`, kind: 'pot-closed', label: pot?.name })
    },
    [bridge, walletAddress, client, ensureGasTank],
  )

  return { closePot }
}
