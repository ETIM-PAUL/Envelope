// Phase 16: stake / request-unstake / withdraw-unstaked — plain envelope_stake instructions, no
// secret material, so built and sent directly here (same pattern as envelope_vault's wrap in
// use-add-to-private-balance.ts), one MWA signature each.
import { envelopeStake } from '@project/anchor'
import { findAssociatedTokenPda, TOKEN_PROGRAM_ADDRESS } from '@solana-program/token'
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
  type Signature,
} from '@solana/kit'
import { useCallback } from 'react'
import { requireMints } from '../../config/devnet-config'
import { useAppStore } from '../../store/app-store'
import { waitForConfirmation } from '../../utils/wait-for-confirmation'

export function useStakeActions() {
  const { client, getTransactionSigner } = useMobileWallet()
  const walletAddress = useAppStore((s) => s.walletAddress)

  const stake = useCallback(
    async (amount: bigint): Promise<void> => {
      if (!walletAddress) throw new Error('connect a wallet first')
      const owner = address(walletAddress)
      const { skr } = requireMints()
      const [userSkr] = await findAssociatedTokenPda({ owner, mint: address(skr), tokenProgram: TOKEN_PROGRAM_ADDRESS })
      const [poolAddress] = await envelopeStake.findPoolPda()
      const pool = await envelopeStake.fetchPool(client.rpc, poolAddress)

      const {
        context: { slot: minContextSlot },
        value: latestBlockhash,
      } = await client.rpc.getLatestBlockhash().send()
      const signer = getTransactionSigner(owner, minContextSlot)

      const instruction = await envelopeStake.getStakeInstructionAsync({
        user: signer,
        userSkr,
        vaultSkr: pool.data.vaultSkr,
        amount,
      })
      const message = pipe(
        createTransactionMessage({ version: 0 }),
        (m) => appendTransactionMessageInstructions([instruction], m),
        (m) => setTransactionMessageFeePayerSigner(signer, m),
        (m) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
      )
      const signatureBytes = await signAndSendTransactionMessageWithSigners(message)
      await waitForConfirmation(client.rpc, getBase58Decoder().decode(signatureBytes) as Signature)
    },
    [walletAddress, client, getTransactionSigner],
  )

  const requestUnstake = useCallback(async (): Promise<void> => {
    if (!walletAddress) throw new Error('connect a wallet first')
    const owner = address(walletAddress)

    const {
      context: { slot: minContextSlot },
      value: latestBlockhash,
    } = await client.rpc.getLatestBlockhash().send()
    const signer = getTransactionSigner(owner, minContextSlot)

    const instruction = await envelopeStake.getRequestUnstakeInstructionAsync({ user: signer })
    const message = pipe(
      createTransactionMessage({ version: 0 }),
      (m) => appendTransactionMessageInstructions([instruction], m),
      (m) => setTransactionMessageFeePayerSigner(signer, m),
      (m) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
    )
    const signatureBytes = await signAndSendTransactionMessageWithSigners(message)
    await waitForConfirmation(client.rpc, getBase58Decoder().decode(signatureBytes) as Signature)
  }, [walletAddress, client, getTransactionSigner])

  const withdrawUnstaked = useCallback(async (): Promise<void> => {
    if (!walletAddress) throw new Error('connect a wallet first')
    const owner = address(walletAddress)
    const { skr } = requireMints()
    const [userSkr] = await findAssociatedTokenPda({ owner, mint: address(skr), tokenProgram: TOKEN_PROGRAM_ADDRESS })
    const [poolAddress] = await envelopeStake.findPoolPda()
    const pool = await envelopeStake.fetchPool(client.rpc, poolAddress)

    const {
      context: { slot: minContextSlot },
      value: latestBlockhash,
    } = await client.rpc.getLatestBlockhash().send()
    const signer = getTransactionSigner(owner, minContextSlot)

    const instruction = await envelopeStake.getWithdrawUnstakedInstructionAsync({
      user: signer,
      userSkr,
      vaultSkr: pool.data.vaultSkr,
    })
    const message = pipe(
      createTransactionMessage({ version: 0 }),
      (m) => appendTransactionMessageInstructions([instruction], m),
      (m) => setTransactionMessageFeePayerSigner(signer, m),
      (m) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
    )
    const signatureBytes = await signAndSendTransactionMessageWithSigners(message)
    await waitForConfirmation(client.rpc, getBase58Decoder().decode(signatureBytes) as Signature)
  }, [walletAddress, client, getTransactionSigner])

  return { stake, requestUnstake, withdrawUnstaked }
}
