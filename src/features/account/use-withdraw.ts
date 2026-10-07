// Phase 17: "private cUSDC back to spendable USDC" (or private cSKR back to SKR). One wallet approval per withdraw (see
// packages/cbridge/src/protocol.ts's BuildWithdrawPlanParams for why it's structured this way):
//   0. ensureGasTank (bridge) — only when the wallet's gas tank is low: one small SOL top-up the
//      wallet approves, so the next step needs no approval at all.
//   1. buildWithdrawPlan (bridge) — the proof setup (equality + range proof contexts), paid for
//      and signed by the gas tank; sent immediately. Confirmed before step 2, which needs it.
//   2. signContinuation (bridge) — the one transaction the wallet approves: confidential
//      withdraw (available balance -> public cUSDC), close both proof contexts, then
//      [Approve(vaultAuthority), Unwrap] — straight back into real USDC, atomically.
// If an approval outlasts its blockhash, that step re-asks the wallet with a fresh one; a
// retried step 2 reuses step 1's proofs rather than rebuilding them.
import { useCBridge } from '@envelope/rn-confidential'
import { useMobileWallet } from '@wallet-ui/react-native-kit'
import type { GetSignatureStatusesApi, Rpc, SendTransactionApi } from '@solana/kit'
import { useCallback } from 'react'
import { getAsset, type AssetId } from '../../config/assets'
import { DEVNET_RPC_URL } from '../../config/rpc'
import { retryOnExpiry } from '../../utils/retry-on-expiry'
import { sendSignedTransactions } from '../../utils/send-signed-transactions'
import { useAppStore } from '../../store/app-store'
import { usePrivateBalance } from './use-private-balance'
import { useGasTank } from '../wallet/use-gas-tank'
import { recordNotification } from '../notifications/notification-log'

export type WithdrawStep = 'unsealing' | 'unwrapping'

export function useWithdraw() {
  const bridge = useCBridge()
  const { client } = useMobileWallet()
  const walletAddress = useAppStore((s) => s.walletAddress)
  const { refetchBalance } = usePrivateBalance()
  const { ensureGasTank } = useGasTank()

  const withdraw = useCallback(
    async (amount: bigint, onStep?: (step: WithdrawStep) => void, assetId: AssetId = 'usdc'): Promise<void> => {
      if (!walletAddress) throw new Error('connect a wallet first')
      if (!bridge.ready) throw new Error('confidential bridge is not ready yet')
      const asset = getAsset(assetId)
      const rpc = client.rpc as unknown as Rpc<SendTransactionApi & GetSignatureStatusesApi>

      onStep?.('unsealing')
      await ensureGasTank()
      const continuationId = await retryOnExpiry(async () => {
        const { signedTransactions, continuationId } = await bridge.call('buildWithdrawPlan', {
          rpcUrl: DEVNET_RPC_URL,
          mint: asset.confidentialMint,
          underlyingMint: asset.underlyingMint,
          owner: walletAddress,
          amount: amount.toString(),
        })
        await sendSignedTransactions(rpc, signedTransactions)
        return continuationId
      })

      onStep?.('unwrapping')
      await retryOnExpiry(async () => {
        const { signedTransactions } = await bridge.call('signContinuation', {
          rpcUrl: DEVNET_RPC_URL,
          continuationId,
        })
        await sendSignedTransactions(rpc, signedTransactions)
      })

      await recordNotification(walletAddress, {
        id: `withdraw-${continuationId}`,
        kind: 'withdraw',
        amount: amount.toString(),
        asset: assetId,
      })
      await refetchBalance()
    },
    [bridge, walletAddress, client, refetchBalance, ensureGasTank],
  )

  return { withdraw }
}
