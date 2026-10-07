// Membership: the SKR pass (envelope_stake `buy_pass`) that sets a wallet's tier — spent, not
// staked. Prices and the period come from the on-chain PassConfig; the current tier, pass expiry
// and every tier's perks from the relayer's /tier (the same source the relayer enforces). Buying
// takes one wallet approval for the SKR; the gas tank pays the pass account's rent and the fee.
import { useCBridge } from '@envelope/rn-confidential'
import { envelopeStake, envelopeVault } from '@project/anchor'
import { findAssociatedTokenPda, TOKEN_PROGRAM_ADDRESS } from '@solana-program/token'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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
import { requireMints } from '../../config/devnet-config'
import { useAppStore, type Tier } from '../../store/app-store'
import { retryOnExpiry } from '../../utils/retry-on-expiry'
import { sendSignedTransactions } from '../../utils/send-signed-transactions'
import { fetchTierInfo } from '../account/use-tier'
import { recordNotification } from '../notifications/notification-log'
import { useGasTank } from '../wallet/use-gas-tank'
import { PLACEHOLDER_LIFETIME, useWalletSigning } from '../wallet/use-wallet-signing'

export type PaidTier = 'member' | 'business'
const TIER_NUMBER: Record<PaidTier, number> = { member: 1, business: 2 }

export function useMembership() {
  const bridge = useCBridge()
  const { client } = useMobileWallet()
  const { signTransactions } = useWalletSigning()
  const { ensureGasTank } = useGasTank()
  const walletAddress = useAppStore((s) => s.walletAddress)
  const setTier = useAppStore((s) => s.setTier)
  const queryClient = useQueryClient()

  const plans = useQuery({
    queryKey: ['membership-plans'],
    queryFn: async () => {
      const [passConfigAddress] = await envelopeStake.findPassConfigPda()
      const [configAddress] = await envelopeVault.findConfigPda()
      const [passConfig, vaultConfig] = await Promise.all([
        envelopeStake.fetchPassConfig(client.rpc, passConfigAddress),
        envelopeVault.fetchConfig(client.rpc, configAddress),
      ])
      const [free, member, business] = vaultConfig.data.limits
      return {
        prices: { member: passConfig.data.memberPrice, business: passConfig.data.businessPrice },
        periodDays: Number(passConfig.data.periodSecs) / 86_400,
        treasury: passConfig.data.treasury,
        dailyLimits: { free: free!, member: member!, business: business! } as Record<Tier, bigint>,
      }
    },
    staleTime: 5 * 60_000,
  })

  const status = useQuery({
    queryKey: ['membership', walletAddress],
    enabled: Boolean(walletAddress),
    queryFn: () => fetchTierInfo(walletAddress!),
  })

  const buy = useMutation({
    mutationFn: async ({ tier, periods = 1 }: { tier: PaidTier; periods?: number }) => {
      if (!walletAddress || !plans.data) throw new Error('connect a wallet first')
      await ensureGasTank()
      const { address: tankAddress } = await bridge.call('gasTankAddress', { owner: walletAddress })
      const owner = address(walletAddress)
      const [userSkr] = await findAssociatedTokenPda({
        owner,
        mint: address(requireMints().skr),
        tokenProgram: TOKEN_PROGRAM_ADDRESS,
      })
      const user = createNoopSigner(owner)
      const gasTank = createNoopSigner(address(tankAddress))

      await retryOnExpiry(async () => {
        const instruction = await envelopeStake.getBuyPassInstructionAsync({
          user,
          payer: gasTank,
          userSkr,
          treasury: plans.data.treasury,
          tier: TIER_NUMBER[tier],
          periods,
        })
        const transaction = compileTransaction(
          pipe(
            createTransactionMessage({ version: 0 }),
            (m) => appendTransactionMessageInstructions([instruction], m),
            (m) => setTransactionMessageFeePayerSigner(gasTank, m),
            (m) => setTransactionMessageLifetimeUsingBlockhash(PLACEHOLDER_LIFETIME, m),
          ),
        )
        const [signed] = await signTransactions([transaction])
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
        id: `pass-${Date.now()}`,
        kind: 'pass',
        label: tier === 'business' ? 'Business' : 'Member',
        amount: (plans.data.prices[tier] * BigInt(periods)).toString(),
      })
    },
    onSuccess: async () => {
      const info = await queryClient.fetchQuery({
        queryKey: ['membership', walletAddress],
        queryFn: () => fetchTierInfo(walletAddress!),
      })
      setTier(info.tier)
      await queryClient.invalidateQueries({ queryKey: ['tier', walletAddress] })
      await queryClient.invalidateQueries({ queryKey: ['stake-info'] })
    },
  })

  return { plans: plans.data, status: status.data, isLoading: plans.isLoading || status.isLoading, buy }
}
