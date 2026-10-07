// Batch send: several private transfers of one token from one balance, approved once. Same shape as
// useSendPrivately — proof setup relayed first with no approval, then the wallet signs every
// transfer in a single request and the relayer lands them in order — but the bridge chains each
// transfer's proofs off the balance the previous one leaves (see BuildBatchTransferPlanParams).
import { useCBridge } from '@envelope/rn-confidential'
import { useCallback, useState } from 'react'
import { getAsset, type AssetId } from '../../config/assets'
import { DEVNET_RPC_URL } from '../../config/rpc'
import { relayTransactions } from '../../utils/relay-transactions'
import { retryOnExpiry } from '../../utils/retry-on-expiry'
import { useAppStore } from '../../store/app-store'
import { usePrivateBalance } from './use-private-balance'
import { useConfidentialAccount } from './use-confidential-account'
import { fetchTierInfo } from './use-tier'
import type { SendStep } from './use-send-privately'

// The most any tier allows (Business); each tier's own cap comes from the relayer (TierPerks).
export const MAX_BATCH_RECIPIENTS = 25

export type BatchRecipient = { address: string; amount: bigint }

export function useSendBatch() {
  const bridge = useCBridge()
  const walletAddress = useAppStore((s) => s.walletAddress)
  const { isRecipientReady } = useConfidentialAccount()
  const { refetchBalance } = usePrivateBalance()
  const [step, setStep] = useState<SendStep>('idle')

  const sendBatch = useCallback(
    async (recipients: BatchRecipient[], asset: AssetId): Promise<string[]> => {
      if (!walletAddress) throw new Error('connect a wallet first')
      if (!bridge.ready) throw new Error('confidential bridge is not ready yet')
      if (recipients.length === 0 || recipients.length > MAX_BATCH_RECIPIENTS) {
        throw new Error(`send to between 1 and ${MAX_BATCH_RECIPIENTS} people at once`)
      }

      try {
        setStep('checking-recipient')
        const unique = [...new Set(recipients.map((r) => r.address))]
        const ready = await Promise.all(unique.map((address) => isRecipientReady(address, asset)))
        const notReady = unique.filter((_, i) => !ready[i])
        if (notReady.length > 0) {
          throw new Error(
            `${notReady.length === 1 ? 'One address' : `${notReady.length} addresses`} can't receive private ${getAsset(asset).symbol} yet`,
          )
        }

        const tierInfo = await fetchTierInfo(walletAddress)
        if (recipients.length > tierInfo.perks.maxBatchRecipients) {
          throw new Error(`your plan can send to ${tierInfo.perks.maxBatchRecipients} people at once`)
        }

        setStep('preparing-proofs')
        const { signedTransactions: proofSetup, continuationId } = await bridge.call('buildBatchTransferPlan', {
          rpcUrl: DEVNET_RPC_URL,
          mint: getAsset(asset).confidentialMint,
          owner: walletAddress,
          transfers: recipients.map((r) => ({ destinationOwner: r.address, amount: r.amount.toString() })),
          feePayer: tierInfo.relayerAddress,
          // One send fee per transfer, paid in a single SKR transfer.
          feeInstruction:
            tierInfo.tier === 'free'
              ? {
                  skrMint: tierInfo.skrMint,
                  amount: (BigInt(tierInfo.freeTierFeeAmount) * BigInt(recipients.length)).toString(),
                }
              : undefined,
        })
        const setupSignatures = proofSetup.length > 0 ? await relayTransactions(walletAddress, proofSetup) : []

        setStep('relaying')
        const transferSignatures = await retryOnExpiry(async () => {
          const { signedTransactions } = await bridge.call('signContinuation', {
            rpcUrl: DEVNET_RPC_URL,
            continuationId,
          })
          return relayTransactions(walletAddress, signedTransactions)
        })

        setStep('confirming')
        await refetchBalance()

        setStep('done')
        return [...setupSignatures, ...transferSignatures]
      } catch (err) {
        setStep('idle')
        throw err
      }
    },
    [bridge, walletAddress, isRecipientReady, refetchBalance],
  )

  return { sendBatch, step, isBusy: step !== 'idle' && step !== 'done' }
}
