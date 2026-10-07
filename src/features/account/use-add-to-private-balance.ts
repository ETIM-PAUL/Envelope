// Phase 10: "Add to private balance" — USDC -> private cUSDC (or SKR -> private cSKR) in one user
// action. Three instructions, one transaction, one MWA signature:
//   wrap(amount)          envelope_vault: USDC in, public cUSDC minted (Phase 4/6) — or
//                         wrap_asset(amount) for SKR (no tier limit)
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
import { getAsset, type AssetId } from '../../config/assets'
import { DEVNET_RPC_URL } from '../../config/rpc'
import { useAppStore } from '../../store/app-store'
import { retryOnExpiry } from '../../utils/retry-on-expiry'
import { sendSignedTransactions } from '../../utils/send-signed-transactions'
import { PLACEHOLDER_LIFETIME, useWalletSigning } from '../wallet/use-wallet-signing'
import { useConfidentialAccount } from './use-confidential-account'
import { useGasTank } from '../wallet/use-gas-tank'
import { recordNotification } from '../notifications/notification-log'

export function useAddToPrivateBalance() {
  const bridge = useCBridge()
  const { client } = useMobileWallet()
  const { signTransactions } = useWalletSigning()
  const walletAddress = useAppStore((s) => s.walletAddress)
  const { ensureAccountReady } = useConfidentialAccount()
  const { ensureGasTank } = useGasTank()

  const addToPrivateBalance = useCallback(
    async (amount: bigint, assetId: AssetId = 'usdc'): Promise<void> => {
      if (!walletAddress) throw new Error('connect a wallet first')
      if (!bridge.ready) throw new Error('confidential bridge is not ready yet')

      // Idempotent (see useConfidentialAccount's doc comment) — covers wallets whose onboarding
      // derived keys but never finished creating/configuring the on-chain confidential account
      // (e.g. an earlier attempt failed partway through), which otherwise fails Deposit's
      // simulation with no indication why: Deposit requires the account to already have the
      // ConfidentialTransferAccount extension configured.
      await ensureAccountReady(assetId)
      // The gas tank pays this transaction's fee and, the first time, the daily-limit record's rent
      // (SKR fuel) — the wallet only authorizes.
      await ensureGasTank()
      const { address: tankAddress } = await bridge.call('gasTankAddress', { owner: walletAddress })

      const owner = address(walletAddress)
      const asset = getAsset(assetId)
      const underlyingMint = address(asset.underlyingMint)
      const confidentialMint = address(asset.confidentialMint)

      // USDC's vault account lives in Config; any other token's in its AssetVault.
      const vaultTokenAccount =
        assetId === 'usdc'
          ? (await envelopeVault.fetchConfig(client.rpc, (await envelopeVault.findConfigPda())[0])).data.vaultUsdc
          : (
              await envelopeVault.fetchAssetVault(
                client.rpc,
                (await envelopeVault.findAssetVaultPda({ underlyingMint }))[0],
              )
            ).data.vaultTokenAccount

      const [userUnderlying] = await findClassicAta({
        owner,
        mint: underlyingMint,
        tokenProgram: TOKEN_PROGRAM_ADDRESS,
      })
      const [userConfidential] = await findAssociatedTokenPda({
        owner,
        mint: confidentialMint,
        tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
      })

      // Rebuilt from scratch on each attempt: if the approval outlasts the blockhash, the wallet
      // is asked again (see retry-on-expiry.ts). The blockhash compiled in here is only a
      // placeholder — useWalletSigning replaces it with one fetched just before the wallet opens.
      await retryOnExpiry(async () => {
        const { newDecryptableAvailableBalanceBase64, expectedPendingBalanceCreditCounter } = await bridge.call(
          'prepareApplyPendingBalance',
          { rpcUrl: DEVNET_RPC_URL, mint: asset.confidentialMint, owner: walletAddress, amount: amount.toString() },
        )

        // Only the address matters while building: the wallet itself signs the compiled
        // transaction below, as the authority on every instruction and the fee payer.
        const authority = createNoopSigner(owner)
        const gasTank = createNoopSigner(address(tankAddress))

        const wrapInstruction =
          assetId === 'usdc'
            ? await envelopeVault.getWrapInstructionAsync({
                user: authority,
                payer: gasTank,
                userUsdc: userUnderlying,
                vaultUsdc: vaultTokenAccount,
                cusdcMint: confidentialMint,
                userCusdc: userConfidential,
                amount,
              })
            : await envelopeVault.getWrapAssetInstructionAsync({
                user: authority,
                underlyingMint,
                userUnderlying,
                vaultTokenAccount,
                confidentialMint,
                userConfidential,
                amount,
              })

        const depositInstruction = getConfidentialDepositInstruction({
          token: userConfidential,
          mint: confidentialMint,
          authority,
          amount,
          decimals: asset.decimals,
        })

        const applyInstruction = getApplyConfidentialPendingBalanceInstruction({
          token: userConfidential,
          authority,
          expectedPendingBalanceCreditCounter: BigInt(expectedPendingBalanceCreditCounter),
          newDecryptableAvailableBalance: toByteArray(newDecryptableAvailableBalanceBase64),
        })

        const transaction = compileTransaction(
          pipe(
            createTransactionMessage({ version: 0 }),
            (m) => appendTransactionMessageInstructions([wrapInstruction, depositInstruction, applyInstruction], m),
            (m) => setTransactionMessageFeePayerSigner(gasTank, m),
            (m) => setTransactionMessageLifetimeUsingBlockhash(PLACEHOLDER_LIFETIME, m),
          ),
        )
        const [signed] = await signTransactions([transaction])
        // The tank signs after the wallet: the wallet may have rewritten the message it signed.
        const {
          transactionsBase64: [cosigned],
        } = await bridge.call('cosignWithGasTank', {
          owner: walletAddress,
          transactionsBase64: [getBase64EncodedWireTransaction(signed!)],
        })
        await sendSignedTransactions(client.rpc as unknown as Rpc<SendTransactionApi & GetSignatureStatusesApi>, [
          cosigned!,
        ])
      })

      await recordNotification(walletAddress, {
        id: `deposit-${Date.now()}`,
        kind: 'deposit',
        amount: amount.toString(),
        asset: assetId,
      })
    },
    [bridge, walletAddress, client, signTransactions, ensureAccountReady, ensureGasTank],
  )

  return { addToPrivateBalance }
}
