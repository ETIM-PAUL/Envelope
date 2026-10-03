// Phase 16: stake / request-unstake / withdraw-unstaked — plain envelope_stake instructions, no
// secret material, so built here, one wallet approval each. Signed through the same path as every
// other wallet transaction (useWalletSigning: blockhash fetched as late as possible) and sent by
// the app, re-asking the wallet if an approval outlasts the blockhash.
import { envelopeStake } from '@project/anchor'
import { findAssociatedTokenPda, TOKEN_PROGRAM_ADDRESS } from '@solana-program/token'
import { useMobileWallet } from '@wallet-ui/react-native-kit'
import {
  address,
  appendTransactionMessageInstructions,
  compileTransaction,
  createNoopSigner,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  type Address,
  type GetSignatureStatusesApi,
  type Instruction,
  type NoopSigner,
  type Rpc,
  type SendTransactionApi,
} from '@solana/kit'
import { useCallback } from 'react'
import { requireMints } from '../../config/devnet-config'
import { useAppStore } from '../../store/app-store'
import { retryOnExpiry } from '../../utils/retry-on-expiry'
import { sendSignedTransactions } from '../../utils/send-signed-transactions'
import { PLACEHOLDER_LIFETIME, useWalletSigning } from '../wallet/use-wallet-signing'

export function useStakeActions() {
  const { client } = useMobileWallet()
  const { signTransactions } = useWalletSigning()
  const walletAddress = useAppStore((s) => s.walletAddress)

  // One instruction, the wallet as its signer and the fee payer. `build` gets a stand-in signer
  // (only its address matters while building — the wallet signs the compiled transaction).
  const sendWithWallet = useCallback(
    async (build: (authority: NoopSigner<Address>) => Promise<Instruction>): Promise<void> => {
      if (!walletAddress) throw new Error('connect a wallet first')
      const authority = createNoopSigner(address(walletAddress))
      const instruction = await build(authority)
      await retryOnExpiry(async () => {
        const transaction = compileTransaction(
          pipe(
            createTransactionMessage({ version: 0 }),
            (m) => appendTransactionMessageInstructions([instruction], m),
            (m) => setTransactionMessageFeePayerSigner(authority, m),
            (m) => setTransactionMessageLifetimeUsingBlockhash(PLACEHOLDER_LIFETIME, m),
          ),
        )
        const [signed] = await signTransactions([transaction])
        await sendSignedTransactions(client.rpc as unknown as Rpc<SendTransactionApi & GetSignatureStatusesApi>, [
          getBase64EncodedWireTransaction(signed!),
        ])
      })
    },
    [walletAddress, client, signTransactions],
  )

  const stake = useCallback(
    async (amount: bigint): Promise<void> => {
      if (!walletAddress) throw new Error('connect a wallet first')
      const { skr } = requireMints()
      const [userSkr] = await findAssociatedTokenPda({
        owner: address(walletAddress),
        mint: address(skr),
        tokenProgram: TOKEN_PROGRAM_ADDRESS,
      })
      const [poolAddress] = await envelopeStake.findPoolPda()
      const pool = await envelopeStake.fetchPool(client.rpc, poolAddress)
      await sendWithWallet((user) =>
        envelopeStake.getStakeInstructionAsync({ user, userSkr, vaultSkr: pool.data.vaultSkr, amount }),
      )
    },
    [walletAddress, client, sendWithWallet],
  )

  const requestUnstake = useCallback(async (): Promise<void> => {
    await sendWithWallet((user) => envelopeStake.getRequestUnstakeInstructionAsync({ user }))
  }, [sendWithWallet])

  const withdrawUnstaked = useCallback(async (): Promise<void> => {
    if (!walletAddress) throw new Error('connect a wallet first')
    const { skr } = requireMints()
    const [userSkr] = await findAssociatedTokenPda({
      owner: address(walletAddress),
      mint: address(skr),
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    })
    const [poolAddress] = await envelopeStake.findPoolPda()
    const pool = await envelopeStake.fetchPool(client.rpc, poolAddress)
    await sendWithWallet((user) =>
      envelopeStake.getWithdrawUnstakedInstructionAsync({ user, userSkr, vaultSkr: pool.data.vaultSkr }),
    )
  }, [walletAddress, client, sendWithWallet])

  return { stake, requestUnstake, withdrawUnstaked }
}
