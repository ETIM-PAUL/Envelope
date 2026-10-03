// Phase 17: "private cUSDC back to spendable USDC." Two steps, strictly in order:
//   1. buildWithdrawPlan (bridge) — confidential available balance -> public cUSDC, owner pays.
//      Submitted and confirmed before step 2, same landing-order reasoning as closePot's
//      apply-then-sweep split: step 2's Unwrap needs the public cUSDC this step mints to have
//      actually landed, not just be queued.
//   2. [Approve(vaultAuthority, amount), Unwrap(amount)] — plain instructions, no secret
//      material, built directly here (same precedent as `wrap` in use-add-to-private-balance.ts),
//      one MWA signature. Unwrap moves the now-public cUSDC into the vault and credits real USDC.
import { useCBridge } from '@envelope/rn-confidential'
import { envelopeVault } from '@project/anchor'
import { findAssociatedTokenPda as findClassicAta, TOKEN_PROGRAM_ADDRESS } from '@solana-program/token'
import { findAssociatedTokenPda, getApproveInstruction, TOKEN_2022_PROGRAM_ADDRESS } from '@solana-program/token-2022'
import { useMobileWallet } from '@wallet-ui/react-native-kit'
import {
  address,
  appendTransactionMessageInstructions,
  createTransactionMessage,
  getBase58Decoder,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signAndSendTransactionMessageWithSigners,
  type GetSignatureStatusesApi,
  type Rpc,
  type SendTransactionApi,
  type Signature,
} from '@solana/kit'
import { useCallback } from 'react'
import { requireMints } from '../../config/devnet-config'
import { DEVNET_RPC_URL } from '../../config/rpc'
import { sendSignedTransactions } from '../../utils/send-signed-transactions'
import { retryOnExpiry } from '../../utils/retry-on-expiry'
import { waitForConfirmation } from '../../utils/wait-for-confirmation'
import { useAppStore } from '../../store/app-store'
import { usePrivateBalance } from './use-private-balance'

export type WithdrawStep = 'unsealing' | 'unwrapping'

export function useWithdraw() {
  const bridge = useCBridge()
  const { client, getTransactionSigner } = useMobileWallet()
  const walletAddress = useAppStore((s) => s.walletAddress)
  const { refetchBalance } = usePrivateBalance()

  const withdraw = useCallback(
    async (amount: bigint, onStep?: (step: WithdrawStep) => void): Promise<void> => {
      if (!walletAddress) throw new Error('connect a wallet first')
      if (!bridge.ready) throw new Error('confidential bridge is not ready yet')
      const { usdc, cusdc } = requireMints()
      const owner = address(walletAddress)

      onStep?.('unsealing')
      await retryOnExpiry(async () => {
        const { signedTransactions } = await bridge.call('buildWithdrawPlan', {
          rpcUrl: DEVNET_RPC_URL,
          mint: cusdc,
          owner: walletAddress,
          amount: amount.toString(),
        })
        await sendSignedTransactions(
          client.rpc as unknown as Rpc<SendTransactionApi & GetSignatureStatusesApi>,
          signedTransactions,
        )
      })

      onStep?.('unwrapping')
      const [configAddress] = await envelopeVault.findConfigPda()
      const [vaultAuthority] = await envelopeVault.findVaultAuthorityPda()
      const vaultConfig = await envelopeVault.fetchConfig(client.rpc, configAddress)
      const [userUsdc] = await findClassicAta({ owner, mint: address(usdc), tokenProgram: TOKEN_PROGRAM_ADDRESS })
      const [userCusdc] = await findAssociatedTokenPda({
        owner,
        mint: address(cusdc),
        tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
      })

      await retryOnExpiry(async () => {
        const {
          context: { slot: minContextSlot },
          value: latestBlockhash,
        } = await client.rpc.getLatestBlockhash().send()
        const signer = getTransactionSigner(owner, minContextSlot)

        const approveInstruction = getApproveInstruction(
          { source: userCusdc, delegate: vaultAuthority, owner: signer, amount },
          { programAddress: TOKEN_2022_PROGRAM_ADDRESS },
        )
        const unwrapInstruction = await envelopeVault.getUnwrapInstructionAsync({
          user: signer,
          cusdcMint: address(cusdc),
          userCusdc,
          vaultUsdc: vaultConfig.data.vaultUsdc,
          userUsdc,
          amount,
        })

        const message = pipe(
          createTransactionMessage({ version: 0 }),
          (m) => appendTransactionMessageInstructions([approveInstruction, unwrapInstruction], m),
          (m) => setTransactionMessageFeePayerSigner(signer, m),
          (m) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
        )
        const signatureBytes = await signAndSendTransactionMessageWithSigners(message)
        await waitForConfirmation(client.rpc, getBase58Decoder().decode(signatureBytes) as Signature)
      })

      await refetchBalance()
    },
    [bridge, walletAddress, client, getTransactionSigner, refetchBalance],
  )

  return { withdraw }
}
