// Phase 15: "Create pot" end to end — derive the pot's identity, build + submit its own
// Token-2022 account setup and the on-chain create_pot instruction (one bridge call, host pays
// everything), then remember it locally (there's no on-chain index of a host's pots).
import { useCBridge } from '@envelope/rn-confidential'
import { useMobileWallet } from '@wallet-ui/react-native-kit'
import { address, type GetSignatureStatusesApi, type Rpc, type SendTransactionApi } from '@solana/kit'
import { useCallback } from 'react'
import { requireMints } from '../../config/devnet-config'
import { DEVNET_RPC_URL } from '../../config/rpc'
import { sendSignedTransactions } from '../../utils/send-signed-transactions'
import { retryOnExpiry } from '../../utils/retry-on-expiry'
import { useAppStore } from '../../store/app-store'
import { addPotSummary, type PotSummary } from './pot-store'
import { findPotPda } from './pot-pda'
import { usePotKeys } from './use-pot-keys'

export function useCreatePot() {
  const bridge = useCBridge()
  const { client } = useMobileWallet()
  const walletAddress = useAppStore((s) => s.walletAddress)
  const { ensurePotKeys } = usePotKeys()

  const createPot = useCallback(
    async (name: string, closeTs: bigint): Promise<PotSummary> => {
      if (!walletAddress) throw new Error('connect a wallet first')
      if (!bridge.ready) throw new Error('confidential bridge is not ready yet')
      const { cusdc } = requireMints()

      const potId = BigInt(Date.now())
      const potOwnerAddress = await ensurePotKeys(potId.toString())
      const potPda = await findPotPda(address(walletAddress), potId)

      await retryOnExpiry(async () => {
        const { signedTransactions } = await bridge.call('createPot', {
          rpcUrl: DEVNET_RPC_URL,
          mint: cusdc,
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
      return summary
    },
    [bridge, walletAddress, client, ensurePotKeys],
  )

  return { createPot }
}
