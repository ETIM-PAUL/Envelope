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
  compileTransaction,
  createNoopSigner,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  type GetSignatureStatusesApi,
  type Rpc,
  type SendTransactionApi,
} from '@solana/kit'
import { toByteArray } from 'react-native-quick-base64'
import { useCallback } from 'react'
import { requireMints } from '../../config/devnet-config'
import { DEVNET_RPC_URL } from '../../config/rpc'
import { useAppStore } from '../../store/app-store'
import { retryOnExpiry } from '../../utils/retry-on-expiry'
import { sendSignedTransactions } from '../../utils/send-signed-transactions'
import { PLACEHOLDER_LIFETIME, useWalletSigning } from '../wallet/use-wallet-signing'
import { useConfidentialAccount } from './use-confidential-account'
import { recordNotification } from '../notifications/notification-log'

// cUSDC's decimals — matches Phase 1's mint setup (scripts/setup-mints.ts) and every other place
// this constant is duplicated (roundtrip.ts, envelope-vault.test.ts): no shared package to import
// it from without pulling in a Node-only script dependency.
const CUSDC_DECIMALS = 6

export function useAddToPrivateBalance() {
  const bridge = useCBridge()
  const { client } = useMobileWallet()
  const { signTransactions } = useWalletSigning()
  const walletAddress = useAppStore((s) => s.walletAddress)
  const { ensureAccountReady } = useConfidentialAccount()

  const addToPrivateBalance = useCallback(
    async (amount: bigint): Promise<void> => {
      if (!walletAddress) throw new Error('connect a wallet first')
      if (!bridge.ready) throw new Error('confidential bridge is not ready yet')

      // Idempotent (see useConfidentialAccount's doc comment) — covers wallets whose onboarding
      // derived keys but never finished creating/configuring the on-chain confidential account
      // (e.g. an earlier attempt failed partway through), which otherwise fails Deposit's
      // simulation with no indication why: Deposit requires the account to already have the
      // ConfidentialTransferAccount extension configured.
      await ensureAccountReady()

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

      // Rebuilt from scratch on each attempt: if the approval outlasts the blockhash, the wallet
      // is asked again (see retry-on-expiry.ts). The blockhash compiled in here is only a
      // placeholder — useWalletSigning replaces it with one fetched just before the wallet opens.
      await retryOnExpiry(async () => {
        const { newDecryptableAvailableBalanceBase64, expectedPendingBalanceCreditCounter } = await bridge.call(
          'prepareApplyPendingBalance',
          { rpcUrl: DEVNET_RPC_URL, mint: cusdc, owner: walletAddress, amount: amount.toString() },
        )

        // Only the address matters while building: the wallet itself signs the compiled
        // transaction below, as the authority on every instruction and the fee payer.
        const authority = createNoopSigner(owner)

        const wrapInstruction = await envelopeVault.getWrapInstructionAsync({
          user: authority,
          userUsdc,
          vaultUsdc: config.data.vaultUsdc,
          cusdcMint,
          userCusdc,
          amount,
        })

        const depositInstruction = getConfidentialDepositInstruction({
          token: userCusdc,
          mint: cusdcMint,
          authority,
          amount,
          decimals: CUSDC_DECIMALS,
        })

        const applyInstruction = getApplyConfidentialPendingBalanceInstruction({
          token: userCusdc,
          authority,
          expectedPendingBalanceCreditCounter: BigInt(expectedPendingBalanceCreditCounter),
          newDecryptableAvailableBalance: toByteArray(newDecryptableAvailableBalanceBase64),
        })

        const transaction = compileTransaction(
          pipe(
            createTransactionMessage({ version: 0 }),
            (m) => appendTransactionMessageInstructions([wrapInstruction, depositInstruction, applyInstruction], m),
            (m) => setTransactionMessageFeePayerSigner(authority, m),
            (m) => setTransactionMessageLifetimeUsingBlockhash(PLACEHOLDER_LIFETIME, m),
          ),
        )
        const [signed] = await signTransactions([transaction])
        await sendSignedTransactions(client.rpc as unknown as Rpc<SendTransactionApi & GetSignatureStatusesApi>, [
          getBase64EncodedWireTransaction(signed!),
        ])
      })

      await recordNotification(walletAddress, {
        id: `deposit-${Date.now()}`,
        kind: 'deposit',
        amount: amount.toString(),
      })
    },
    [bridge, walletAddress, client, signTransactions, ensureAccountReady],
  )

  return { addToPrivateBalance }
}
