// Phase 13: the headline flow. Builds a confidential transfer with the relayer as fee payer
// (buildTransferPlan), asks the relayer's own /tier endpoint whether a free-tier fee instruction
// is needed, relays the result, and reports progress as it goes — this is the first real caller
// of buildTransferPlan anywhere in the app; scripts/test-relayer-confidential-transfer.ts is the
// Node-side reference this mirrors, but signs through MWA instead of a raw keypair.
import { useCBridge } from '@envelope/rn-confidential'
import { useCallback, useState } from 'react'
import { requireMints } from '../../config/devnet-config'
import { DEVNET_RPC_URL } from '../../config/rpc'
import { relayTransactions } from '../../utils/relay-transactions'
import { retryOnExpiry } from '../../utils/retry-on-expiry'
import { useAppStore } from '../../store/app-store'
import { usePrivateBalance } from './use-private-balance'
import { useConfidentialAccount } from './use-confidential-account'
import { fetchTierInfo } from './use-tier'

export type SendStep = 'idle' | 'checking-recipient' | 'preparing-proofs' | 'relaying' | 'confirming' | 'done'

export function useSendPrivately() {
  const bridge = useCBridge()
  const walletAddress = useAppStore((s) => s.walletAddress)
  const { isRecipientReady } = useConfidentialAccount()
  const { refetchBalance } = usePrivateBalance()
  const [step, setStep] = useState<SendStep>('idle')

  const sendPrivately = useCallback(
    async (destinationOwner: string, amount: bigint): Promise<string[]> => {
      if (!walletAddress) throw new Error('connect a wallet first')
      if (!bridge.ready) throw new Error('confidential bridge is not ready yet')
      const { cusdc } = requireMints()

      try {
        setStep('checking-recipient')
        const recipientReady = await isRecipientReady(destinationOwner)
        if (!recipientReady) {
          throw new Error("this address hasn't set up private transfers yet")
        }

        const tierInfo = await fetchTierInfo(walletAddress)

        const signatures = await retryOnExpiry(async () => {
          setStep('preparing-proofs')
          const { signedTransactions } = await bridge.call('buildTransferPlan', {
            rpcUrl: DEVNET_RPC_URL,
            mint: cusdc,
            owner: walletAddress,
            destinationOwner,
            amount: amount.toString(),
            feePayer: tierInfo.relayerAddress,
            feeInstruction:
              tierInfo.tier === 'free' ? { skrMint: tierInfo.skrMint, amount: tierInfo.freeTierFeeAmount } : undefined,
          })

          setStep('relaying')
          return relayTransactions(walletAddress, signedTransactions)
        })

        setStep('confirming')
        await refetchBalance()

        setStep('done')
        return signatures
      } catch (err) {
        setStep('idle')
        throw err
      }
    },
    [bridge, walletAddress, isRecipientReady, refetchBalance],
  )

  return { sendPrivately, step, isBusy: step !== 'idle' && step !== 'done' }
}
