// Phase 10: "Add to private balance" — USDC -> private cUSDC in one user action. Three
// instructions, one transaction, one MWA signature:
//   wrap(amount)          envelope_vault: USDC in, public cUSDC minted (Phase 4/6)
//   Deposit(amount)        Token-2022: public -> pending confidential
//   ApplyPendingBalance     pending -> available (needs the AES key — see prepareApplyPendingBalance)
// `wrap` and `Deposit` are plain, deterministic instructions with no secret material, so they're
// built right here; only the third instruction's `newDecryptableAvailableBalance` argument needs
// the bridge (see protocol.ts's `prepareApplyPendingBalance` doc comment for why it's not simpler
// to just have the bridge build that whole instruction).
import { useCBridge } from '@envelope/rn-confidential'
import { envelopeVault } from '@project/anchor'
import { findAssociatedTokenPda as findClassicAta, TOKEN_PROGRAM_ADDRESS } from '@solana-program/token'
import {
  findAssociatedTokenPda,
  getApplyConfidentialPendingBalanceInstruction,
  getConfidentialDepositInstruction,
  TOKEN_2022_PROGRAM_ADDRESS,
} from '@solana-program/token-2022'
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
import { toByteArray } from 'react-native-quick-base64'
import { useCallback } from 'react'
import { requireMints } from '../../config/devnet-config'
import { DEVNET_RPC_URL } from '../../config/rpc'
import { useAppStore } from '../../store/app-store'
import { waitForConfirmation } from '../../utils/wait-for-confirmation'

// cUSDC's decimals — matches Phase 1's mint setup (scripts/setup-mints.ts) and every other place
// this constant is duplicated (roundtrip.ts, envelope-vault.test.ts): no shared package to import
// it from without pulling in a Node-only script dependency.
const CUSDC_DECIMALS = 6

export function useAddToPrivateBalance() {
  const bridge = useCBridge()
  const { client, getTransactionSigner } = useMobileWallet()
  const walletAddress = useAppStore((s) => s.walletAddress)

  const addToPrivateBalance = useCallback(
    async (amount: bigint): Promise<void> => {
      if (!walletAddress) throw new Error('connect a wallet first')
      if (!bridge.ready) throw new Error('confidential bridge is not ready yet')

      const owner = address(walletAddress)
      const { usdc, cusdc } = requireMints()
      const usdcMint = address(usdc)
      const cusdcMint = address(cusdc)

      const [configAddress] = await envelopeVault.findConfigPda()
      const config = await envelopeVault.fetchConfig(client.rpc, configAddress)

      const [userUsdc] = await findClassicAta({ owner, mint: usdcMint, tokenProgram: TOKEN_PROGRAM_ADDRESS })
      const [userCusdc] = await findAssociatedTokenPda({
        owner,
        mint: cusdcMint,
        tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
      })

      // One signer, reused for every instruction *and* the fee payer, so the message ends up
      // needing exactly one MWA approval — see the module doc comment for why this matters more
      // here than it looks: wallet-ui's own `sendTransactions` convenience method creates its own
      // internal signer instance, and mixing that with a differently-instantiated signer for the
      // instructions themselves is the kind of identity mismatch that's easy to get subtly wrong.
      const {
        context: { slot: minContextSlot },
        value: latestBlockhash,
      } = await client.rpc.getLatestBlockhash().send()
      const signer = getTransactionSigner(owner, minContextSlot)

      const wrapInstruction = await envelopeVault.getWrapInstructionAsync({
        user: signer,
        userUsdc,
        vaultUsdc: config.data.vaultUsdc,
        cusdcMint,
        userCusdc,
        amount,
      })

      const depositInstruction = getConfidentialDepositInstruction({
        token: userCusdc,
        mint: cusdcMint,
        authority: signer,
        amount,
        decimals: CUSDC_DECIMALS,
      })

      const { newDecryptableAvailableBalanceBase64, expectedPendingBalanceCreditCounter } = await bridge.call(
        'prepareApplyPendingBalance',
        { rpcUrl: DEVNET_RPC_URL, mint: cusdc, owner: walletAddress, amount: amount.toString() },
      )
      const applyInstruction = getApplyConfidentialPendingBalanceInstruction({
        token: userCusdc,
        authority: signer,
        expectedPendingBalanceCreditCounter: BigInt(expectedPendingBalanceCreditCounter),
        newDecryptableAvailableBalance: toByteArray(newDecryptableAvailableBalanceBase64),
      })

      const message = pipe(
        createTransactionMessage({ version: 0 }),
        (m) => appendTransactionMessageInstructions([wrapInstruction, depositInstruction, applyInstruction], m),
        (m) => setTransactionMessageFeePayerSigner(signer, m),
        (m) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
      )
      const signatureBytes = await signAndSendTransactionMessageWithSigners(message)
      const signature = getBase58Decoder().decode(signatureBytes) as Signature
      await waitForConfirmation(client.rpc, signature)
    },
    [bridge, walletAddress, client, getTransactionSigner],
  )

  return { addToPrivateBalance }
}
