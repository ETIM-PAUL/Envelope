// Phase 15: "Create pot" end to end — derive the pot's identity, build + submit its own
// Token-2022 account setup and the on-chain create_pot instruction (one bridge call, host pays
// everything), then remember it locally (there's no on-chain index of a host's pots).
import { useCBridge } from '@envelope/rn-confidential'
import { useMobileWallet } from '@wallet-ui/react-native-kit'
import { address, type GetSignatureStatusesApi, type Rpc, type SendTransactionApi } from '@solana/kit'
import { useCallback } from 'react'
import { getAsset, type AssetId } from '../../config/assets'
import { DEVNET_RPC_URL } from '../../config/rpc'
import { sendSignedTransactions } from '../../utils/send-signed-transactions'
import { retryOnExpiry } from '../../utils/retry-on-expiry'
import { useAppStore } from '../../store/app-store'
import { addPotSummary, type PotSummary } from './pot-store'
import { findPotPda } from './pot-pda'
import { usePotKeys } from './use-pot-keys'
import { useGasTank } from '../wallet/use-gas-tank'
import { recordNotification } from '../notifications/notification-log'

export function useCreatePot() {
  const bridge = useCBridge()
  const { client } = useMobileWallet()
  const walletAddress = useAppStore((s) => s.walletAddress)
  const { ensurePotKeys } = usePotKeys()
  const { ensureGasTank } = useGasTank()

  const createPot = useCallback(
    async (name: string, closeTs: bigint, assets: AssetId[] = ['usdc']): Promise<PotSummary> => {
      if (!walletAddress) throw new Error('connect a wallet first')
      if (!bridge.ready) throw new Error('confidential bridge is not ready yet')
      if (assets.length === 0) throw new Error('choose at least one token for the pot')
      const [mainMint, ...extraMints] = assets.map((asset) => getAsset(asset).confidentialMint)

      const potId = BigInt(Date.now())
      const potOwnerAddress = await ensurePotKeys(potId.toString())
      const potPda = await findPotPda(address(walletAddress), potId)
      await ensureGasTank()

      await retryOnExpiry(async () => {
        const { signedTransactions } = await bridge.call('createPot', {
          rpcUrl: DEVNET_RPC_URL,
          mint: mainMint!,
          extraMints,
          host: walletAddress,
          potOwner: potOwnerAddress,
          potId: potId.toString(),
          name,
          closeTs: closeTs.toString(),
        })
        await sendSignedTransactions(
          client.rpc as unknown as Rpc<SendTransactionApi & GetSignatureStatusesApi>,
          signedTransactions,
        )
      })

      const summary: PotSummary = {
        potId: potId.toString(),
        potPda,
        potOwnerAddress,
        name,
        closeTs: closeTs.toString(),
        createdAt: Date.now(),
      }
      await addPotSummary(walletAddress, summary)
      await recordNotification(walletAddress, { id: `pot-created-${summary.potId}`, kind: 'pot-created', label: name })
      return summary
    },
    [bridge, walletAddress, client, ensurePotKeys, ensureGasTank],
  )

  return { createPot }
}
