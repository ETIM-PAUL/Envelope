// Phase 9: gets a wallet's cUSDC account ready to send and receive privately, in one guided step
// (from Home/Onboarding), plus the read-only "can I send to this address?" check Send needs.
import { useCBridge } from '@envelope/rn-confidential'
import { useMobileWallet } from '@wallet-ui/react-native-kit'
import type { GetSignatureStatusesApi, Rpc, SendTransactionApi } from '@solana/kit'
import { useCallback } from 'react'
import { requireMints } from '../../config/devnet-config'
import { DEVNET_RPC_URL } from '../../config/rpc'
import { sendSignedTransactions } from '../../utils/send-signed-transactions'
import { retryOnExpiry } from '../../utils/retry-on-expiry'
import { useAppStore } from '../../store/app-store'

export function useConfidentialAccount() {
  const bridge = useCBridge()
  const { client } = useMobileWallet()
  const walletAddress = useAppStore((s) => s.walletAddress)

  // Idempotent: safe to call every time "Enable private balance" runs, or speculatively before
  // Send — an already-ready account costs one read-only bridge call and nothing to sign or send.
  const ensureAccountReady = useCallback(async (): Promise<void> => {
    if (!walletAddress) throw new Error('connect a wallet first')
    if (!bridge.ready) throw new Error('confidential bridge is not ready yet')
    const { cusdc } = requireMints()

    await retryOnExpiry(async () => {
      const { signedTransactions } = await bridge.call('ensureAccountReady', {
        rpcUrl: DEVNET_RPC_URL,
        mint: cusdc,
        owner: walletAddress,
      })
      if (signedTransactions.length > 0) {
        await sendSignedTransactions(
          client.rpc as unknown as Rpc<SendTransactionApi & GetSignatureStatusesApi>,
          signedTransactions,
        )
      }
    })
  }, [bridge, walletAddress, client])

  // Used by Send before building a transfer — no session keys or signature needed, it's someone
  // else's account, just on-chain state.
  const isRecipientReady = useCallback(
    async (recipientAddress: string): Promise<boolean> => {
      if (!bridge.ready) throw new Error('confidential bridge is not ready yet')
      const { cusdc } = requireMints()
      const { ready } = await bridge.call('isAccountReady', {
        rpcUrl: DEVNET_RPC_URL,
        mint: cusdc,
        owner: recipientAddress,
      })
      return ready
    },
    [bridge],
  )

  return { ensureAccountReady, isRecipientReady }
}
