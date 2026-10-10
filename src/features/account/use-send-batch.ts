// Batch send: several private transfers of one token from one balance. Same shape as
// useSendPrivately — proof setup relayed first with no approval, then the transfers — but the
// bridge chains each transfer's proofs off the balance the previous one leaves and packs them two
// to a transaction (see BuildBatchTransferPlanParams). The wallet approves one transaction at a
// time, each after the one before has landed, so its preview always simulates cleanly: Member's
// 2 people are one approval, Business's 4 are two. If it stops partway, PartialBatchError says
// how many were paid.
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
export const MAX_BATCH_RECIPIENTS = 4

// A batch that stopped after paying the first `paid` recipients (in order). The rest weren't sent,
// so their money is still in the sender's balance.
export class PartialBatchError extends Error {
  constructor(
    readonly paid: number,
    readonly total: number,
    readonly signatures: string[],
    cause: unknown,
  ) {
    super(
      `Sent to ${paid} of ${total} people. The other ${total - paid} weren't sent, and that money is still in your balance.`,
      { cause },
    )
  }
}

export type BatchRecipient = { address: string; amount: bigint }

export function useSendBatch() {
  const bridge = useCBridge()
  const walletAddress = useAppStore((s) => s.walletAddress)
  const { isRecipientReady } = useConfidentialAccount()
  const { refetchBalance } = usePrivateBalance()
  const [step, setStep] = useState<SendStep>('idle')
  // Which wallet approval the batch is on, when it needs more than one.
  const [approval, setApproval] = useState<{ current: number; total: number } | null>(null)

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
        const {
          signedTransactions: proofSetup,
          continuationId,
          transfersPerTransaction,
        } = await bridge.call('buildBatchTransferPlan', {
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
        const transferSignatures: string[] = []
        let paid = 0
        for (let index = 0; index < transfersPerTransaction.length; index++) {
          setApproval({ current: index + 1, total: transfersPerTransaction.length })
          try {
            // Re-signing after an expiry is safe: the expired transaction never landed.
            transferSignatures.push(
              ...(await retryOnExpiry(async () => {
                const { signedTransactions } = await bridge.call('signContinuation', {
                  rpcUrl: DEVNET_RPC_URL,
                  continuationId,
                  from: index,
                  count: 1,
                })
                return relayTransactions(walletAddress, signedTransactions)
              })),
            )
            paid += transfersPerTransaction[index]!
          } catch (error) {
            if (paid === 0) throw error
            await refetchBalance()
            throw new PartialBatchError(paid, recipients.length, [...setupSignatures, ...transferSignatures], error)
          }
        }
        setApproval(null)

        setStep('confirming')
        await refetchBalance()

        setStep('done')
        return [...setupSignatures, ...transferSignatures]
      } catch (err) {
        setStep('idle')
        setApproval(null)
        throw err
      }
    },
    [bridge, walletAddress, isRecipientReady, refetchBalance],
  )

  return { sendBatch, step, approval, isBusy: step !== 'idle' && step !== 'done' }
}
