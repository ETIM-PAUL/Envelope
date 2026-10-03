// The wallet's gas tank (packages/cbridge/src/bridge.ts's gasTanks) pays for and signs every
// transaction that doesn't need the wallet's own authority — withdraw proofs, a pot's account
// setup and sweep — so those need no approval. Call this before any such flow: when the tank is
// low it asks the wallet to approve one small SOL top-up, otherwise it does nothing.
import { useCBridge } from '@envelope/rn-confidential'
import { useMobileWallet } from '@wallet-ui/react-native-kit'
import type { GetSignatureStatusesApi, Rpc, SendTransactionApi } from '@solana/kit'
import { useCallback } from 'react'
import { DEVNET_RPC_URL } from '../../config/rpc'
import { useAppStore } from '../../store/app-store'
import { retryOnExpiry } from '../../utils/retry-on-expiry'
import { sendSignedTransactions } from '../../utils/send-signed-transactions'

export function useGasTank() {
  const bridge = useCBridge()
  const { client } = useMobileWallet()
  const walletAddress = useAppStore((s) => s.walletAddress)

  const ensureGasTank = useCallback(async (): Promise<void> => {
    if (!walletAddress) throw new Error('connect a wallet first')
    await retryOnExpiry(async () => {
      const { signedTransactions } = await bridge.call('ensureGasTank', {
        rpcUrl: DEVNET_RPC_URL,
        owner: walletAddress,
      })
      await sendSignedTransactions(
        client.rpc as unknown as Rpc<SendTransactionApi & GetSignatureStatusesApi>,
        signedTransactions,
      )
    })
  }, [bridge, client, walletAddress])

  return { ensureGasTank }
}
