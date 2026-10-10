// Gift links: private funds behind a link (see packages/cbridge/src/protocol.ts's CreateGiftParams).
// Sending: the bridge sets up a one-off gift wallet (the sender's gas tank pays its rent), then the
// funds go in as an ordinary private send through the relayer. Claiming: the gift wallet's own key
// (derived from the link's secret) moves everything to the claimer's private balance, paid by the
// claimer's gas tank, then closes the gift's account so the link is spent. Taking a gift back is
// the same claim, made by the sender.
import { useCBridge } from '@envelope/rn-confidential'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMobileWallet } from '@wallet-ui/react-native-kit'
import {
  getSignatureFromTransaction,
  getTransactionDecoder,
  type GetSignatureStatusesApi,
  type Rpc,
  type SendTransactionApi,
} from '@solana/kit'
import { useCallback, useState } from 'react'
import { assetForConfidentialMint, availableAssetIds, getAsset, type AssetId } from '../../config/assets'
import { DEVNET_RPC_URL } from '../../config/rpc'
import { giftLink } from '../../config/site'
import { useAppStore } from '../../store/app-store'
import { retryOnExpiry } from '../../utils/retry-on-expiry'
import { sendSignedTransactions } from '../../utils/send-signed-transactions'
import { useApplyPendingBalance } from '../account/use-apply-pending-balance'
import { useConfidentialAccount } from '../account/use-confidential-account'
import { usePrivateBalance } from '../account/use-private-balance'
import { useSendPrivately, type SendStep } from '../account/use-send-privately'
import { recordNotification } from '../notifications/notification-log'
import { useGasTank } from '../wallet/use-gas-tank'
import { isGiftSecret } from './gift-link'
import { listGifts, markGiftTakenBack, saveGift, type GiftRecord } from './gift-store'

const signatureOf = (wireBase64: string) =>
  getSignatureFromTransaction(getTransactionDecoder().decode(Buffer.from(wireBase64, 'base64')))

export type CreateGiftStep = 'idle' | 'creating' | SendStep

export function useCreateGift() {
  const bridge = useCBridge()
  const { client } = useMobileWallet()
  const walletAddress = useAppStore((s) => s.walletAddress)
  const { ensureGasTank } = useGasTank()
  const { sendPrivately, step: sendStep } = useSendPrivately()
  const queryClient = useQueryClient()
  const [creating, setCreating] = useState(false)

  const createGift = useCallback(
    async (asset: AssetId, amount: bigint): Promise<{ link: string; giftOwner: string }> => {
      if (!walletAddress) throw new Error('connect a wallet first')
      if (!bridge.ready) throw new Error('confidential bridge is not ready yet')
      setCreating(true)
      let secret: string
      let giftOwner: string
      try {
        await ensureGasTank()
        const created = await bridge.call('createGift', {
          rpcUrl: DEVNET_RPC_URL,
          mint: getAsset(asset).confidentialMint,
          sender: walletAddress,
        })
        secret = created.secret
        giftOwner = created.giftOwnerAddress
        await sendSignedTransactions(
          client.rpc as unknown as Rpc<SendTransactionApi & GetSignatureStatusesApi>,
          created.signedTransactions,
        )
        // Kept before any funds move, so the sender can always take the gift back.
        await saveGift(walletAddress, { giftOwner, asset, amount: amount.toString(), createdAt: Date.now() }, secret)
      } finally {
        setCreating(false)
      }

      const signatures = await sendPrivately(giftOwner, amount, asset)
      await recordNotification(walletAddress, {
        id: `gift-sent-${giftOwner}`,
        kind: 'gift-sent',
        amount: amount.toString(),
        asset,
        covers: signatures,
      })
      await queryClient.invalidateQueries({ queryKey: ['sent-gifts', walletAddress] })
      return { link: giftLink(secret), giftOwner }
    },
    [bridge, client, walletAddress, ensureGasTank, sendPrivately, queryClient],
  )

  const step: CreateGiftStep = creating ? 'creating' : sendStep
  return { createGift, step, isBusy: step !== 'idle' && step !== 'done' }
}

export type OpenedGift = { giftOwner: string; asset: AssetId; amount: bigint } | { giftOwner: string; claimed: true }

// What a gift link holds, decrypted with the gift's own key — no wallet needed to look.
export async function openGift(bridge: ReturnType<typeof useCBridge>, secret: string): Promise<OpenedGift> {
  const { giftOwnerAddress, balances } = await bridge.call('openGift', {
    rpcUrl: DEVNET_RPC_URL,
    mints: availableAssetIds().map((id) => getAsset(id).confidentialMint),
    secret,
  })
  for (const balance of balances) {
    const amount = BigInt(balance.available) + BigInt(balance.pending)
    const asset = assetForConfidentialMint(balance.mint)
    if (balance.exists && amount > 0n && asset) return { giftOwner: giftOwnerAddress, asset, amount }
  }
  return { giftOwner: giftOwnerAddress, claimed: true }
}

export function useOpenGift(secret: string | undefined) {
  const bridge = useCBridge()
  return useQuery({
    queryKey: ['gift', secret],
    enabled: bridge.ready && isGiftSecret(secret),
    queryFn: () => openGift(bridge, secret!),
  })
}

export type ClaimStep = 'idle' | 'preparing' | 'unsealing' | 'moving' | 'closing' | 'adding' | 'done'

// Moves a gift's whole balance into this wallet's private balance — the recipient claiming, or the
// sender taking an unclaimed gift back. The wallet's private balance must be enabled (keys derived).
export function useClaimGift() {
  const bridge = useCBridge()
  const { client } = useMobileWallet()
  const walletAddress = useAppStore((s) => s.walletAddress)
  const { ensureGasTank } = useGasTank()
  const { ensureAccountReady } = useConfidentialAccount()
  const { refetchBalance } = usePrivateBalance()
  const { applyPendingBalance } = useApplyPendingBalance()
  const queryClient = useQueryClient()
  const [step, setStep] = useState<ClaimStep>('idle')

  const claimGift = useCallback(
    async (
      secret: string,
      { takingBack = false } = {},
    ): Promise<{ asset: AssetId; amount: bigint; added: boolean }> => {
      if (!walletAddress) throw new Error('connect a wallet first')
      if (!bridge.ready) throw new Error('confidential bridge is not ready yet')
      const rpc = client.rpc as unknown as Rpc<SendTransactionApi & GetSignatureStatusesApi>
      try {
        setStep('preparing')
        const opened = await openGift(bridge, secret)
        if ('claimed' in opened) throw new Error('This gift has already been claimed.')
        const { giftOwner, asset, amount } = opened
        const mint = getAsset(asset).confidentialMint
        await ensureAccountReady(asset)
        await ensureGasTank()

        // Three steps that must land in order (as when closing a pot): apply the gift's pending
        // funds, move its available balance, then close its account.
        setStep('unsealing')
        await retryOnExpiry(async () => {
          const { signedTransactions } = await bridge.call('applyPendingBalance', {
            rpcUrl: DEVNET_RPC_URL,
            mint,
            owner: giftOwner,
            payer: walletAddress,
          })
          if (signedTransactions.length > 0) await sendSignedTransactions(rpc, signedTransactions)
        })
        setStep('moving')
        const claimSignatures = await retryOnExpiry(async () => {
          const { signedTransactions } = await bridge.call('claimGift', {
            rpcUrl: DEVNET_RPC_URL,
            mint,
            giftOwner,
            claimer: walletAddress,
          })
          await sendSignedTransactions(rpc, signedTransactions)
          return signedTransactions.map(signatureOf)
        })
        setStep('closing')
        await retryOnExpiry(async () => {
          const { signedTransactions } = await bridge.call('closeGift', {
            rpcUrl: DEVNET_RPC_URL,
            mint,
            giftOwner,
            claimer: walletAddress,
          })
          await sendSignedTransactions(rpc, signedTransactions)
        })

        if (takingBack) await markGiftTakenBack(walletAddress, giftOwner)

        // The gift is now this wallet's, waiting as pending. One signature (the gas tank pays)
        // makes it spendable; if the user declines, Home offers "Add to balance" later.
        setStep('adding')
        const added = await applyPendingBalance(asset).then(
          () => true,
          () => false,
        )
        await recordNotification(walletAddress, {
          id: `gift-${takingBack ? 'returned' : 'received'}-${giftOwner}`,
          kind: takingBack ? 'gift-returned' : 'gift-received',
          amount: amount.toString(),
          asset,
          covers: claimSignatures,
        })
        await Promise.all([
          refetchBalance(),
          queryClient.invalidateQueries({ queryKey: ['gift', secret] }),
          queryClient.invalidateQueries({ queryKey: ['sent-gifts', walletAddress] }),
        ])
        setStep('done')
        return { asset, amount, added }
      } catch (error) {
        setStep('idle')
        throw error
      }
    },
    [
      bridge,
      client,
      walletAddress,
      ensureGasTank,
      ensureAccountReady,
      refetchBalance,
      applyPendingBalance,
      queryClient,
    ],
  )

  return { claimGift, step, isBusy: step !== 'idle' && step !== 'done' }
}

export type SentGift = GiftRecord & { status: 'waiting' | 'claimed' | 'taken-back' }

// This device's sent gifts with their status: a gift whose account is gone has been claimed
// (or taken back, which is recorded locally); one whose account still exists is waiting.
export function useSentGifts() {
  const bridge = useCBridge()
  const walletAddress = useAppStore((s) => s.walletAddress)
  return useQuery({
    queryKey: ['sent-gifts', walletAddress],
    enabled: Boolean(walletAddress) && bridge.ready,
    queryFn: async (): Promise<SentGift[]> => {
      const gifts = await listGifts(walletAddress!)
      return Promise.all(
        gifts.map(async (gift) => {
          if (gift.takenBack) return { ...gift, status: 'taken-back' as const }
          const { ready } = await bridge.call('isAccountReady', {
            rpcUrl: DEVNET_RPC_URL,
            mint: getAsset(gift.asset).confidentialMint,
            owner: gift.giftOwner,
          })
          return { ...gift, status: ready ? ('waiting' as const) : ('claimed' as const) }
        }),
      )
    },
  })
}
