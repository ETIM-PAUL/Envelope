// Phase 9: gets a wallet's confidential account for a token (cUSDC by default, or cSKR) ready to
// send and receive privately, plus the read-only "can I send this token to this address?" check.
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

export function useConfidentialAccount() {
  const bridge = useCBridge()
  const { client } = useMobileWallet()
  const walletAddress = useAppStore((s) => s.walletAddress)
  const { ensureGasTank } = useGasTank()

  // Idempotent: safe to call every time "Enable private balance" runs, or speculatively before
  // Send — an already-ready account costs one read-only bridge call and nothing to sign or send.
  const ensureAccountReady = useCallback(
    // One token, or several (onboarding sets up dollars and SKR together) — one approval either way.
    async (assets: AssetId | AssetId[] = 'usdc'): Promise<void> => {
      if (!walletAddress) throw new Error('connect a wallet first')
      if (!bridge.ready) throw new Error('confidential bridge is not ready yet')
      const [mint, ...extraMints] = (Array.isArray(assets) ? assets : [assets]).map(
        (asset) => getAsset(asset).confidentialMint,
      )
      const { ready: alreadyReady } = await bridge.call('isAccountReady', {
        rpcUrl: DEVNET_RPC_URL,
        mint: mint!,
        owner: walletAddress,
      })
      const extraReady = await Promise.all(
        extraMints.map((extra) =>
          bridge.call('isAccountReady', { rpcUrl: DEVNET_RPC_URL, mint: extra, owner: walletAddress }),
        ),
      )
      if (alreadyReady && extraReady.every((r) => r.ready)) return
      // The gas tank pays the accounts' rent and fees (SKR fuel), so the wallet needs no SOL.
      await ensureGasTank()

      await retryOnExpiry(async () => {
        const { signedTransactions } = await bridge.call('ensureAccountReady', {
          rpcUrl: DEVNET_RPC_URL,
          mint: mint!,
          extraMints,
          owner: walletAddress,
          payWithGasTank: true,
        })
        if (signedTransactions.length > 0) {
          await sendSignedTransactions(
            client.rpc as unknown as Rpc<SendTransactionApi & GetSignatureStatusesApi>,
            signedTransactions,
          )
        }
      })
    },
    [bridge, walletAddress, client, ensureGasTank],
  )

  // Used by Send before building a transfer — no session keys or signature needed, it's someone
  // else's account, just on-chain state.
  const isRecipientReady = useCallback(
    async (recipientAddress: string, asset: AssetId = 'usdc'): Promise<boolean> => {
      if (!bridge.ready) throw new Error('confidential bridge is not ready yet')
      const { ready } = await bridge.call('isAccountReady', {
        rpcUrl: DEVNET_RPC_URL,
        mint: getAsset(asset).confidentialMint,
        owner: recipientAddress,
      })
      return ready
    },
    [bridge],
  )

  return { ensureAccountReady, isRecipientReady }
}
