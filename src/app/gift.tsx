// `envelope://gift?k=<secret>`: claiming a gift link (see features/gifts/use-gifts.ts). Shows what
// the gift holds before anything else (decrypted with the gift's own key — no wallet needed to
// look), then: connect, enable the private balance if this is someone's first time, and claim. The
// claimer's gas tank pays every fee, so a brand-new wallet with no SOL can claim.
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'
import { Text, View } from 'react-native'
import { Button } from '../components/button'
import { Screen } from '../components/screen'
import { SealMark } from '../components/seal-mark'
import { fontFamily } from '../design/tokens'
import { availableAssetIds, formatAssetAmount } from '../config/assets'
import { useConfidentialAccount } from '../features/account/use-confidential-account'
import { isGiftSecret } from '../features/gifts/gift-link'
import { useClaimGift, useOpenGift, type ClaimStep } from '../features/gifts/use-gifts'
import { useConfidentialKeys } from '../features/keys/use-confidential-keys'
import { useWalletSession } from '../features/wallet/use-wallet-session'
import { formatError } from '../utils/format-error'

const STEP_LABEL: Record<ClaimStep, string> = {
  idle: '',
  preparing: 'Getting your account ready…',
  unsealing: 'Opening the gift…',
  moving: 'Moving it to your private balance…',
  closing: 'Finishing up…',
  done: 'Done',
}

export default function ClaimGift() {
  const router = useRouter()
  const { k: secret } = useLocalSearchParams<{ k?: string }>()
  const { isConnected, isBusy: connecting, connect } = useWalletSession()
  const { keysUnlocked, unlockOnOpen, enablePrivateBalance } = useConfidentialKeys()
  const { ensureAccountReady } = useConfidentialAccount()
  const { data: gift, error: openError, isLoading } = useOpenGift(secret)
  const { claimGift, step, isBusy } = useClaimGift()
  const [enabling, setEnabling] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [claimed, setClaimed] = useState<string | null>(null)

  async function handleClaim() {
    if (!secret || isBusy || enabling) return
    setError(null)
    try {
      if (!keysUnlocked) {
        setEnabling(true)
        // Someone who has used Envelope on this phone unlocks with their fingerprint; someone new
        // signs once to create their private balance (both tokens, as onboarding does).
        if (!(await unlockOnOpen())) {
          await enablePrivateBalance()
          await ensureAccountReady(availableAssetIds())
        }
        setEnabling(false)
      }
      const { asset, amount } = await claimGift(secret)
      setClaimed(formatAssetAmount(amount, asset))
    } catch (e) {
      setEnabling(false)
      setError(formatError(e))
    }
  }

  if (!isGiftSecret(secret)) {
    return (
      <Message
        title="This gift link isn't complete"
        body="Ask the sender to share it again, then open the whole link."
      />
    )
  }

  if (claimed) {
    return (
      <Screen center>
        <SealMark size={56} />
        <Text className="text-paper-500 text-2xl mt-6 mb-2 text-center" style={{ fontFamily: fontFamily.display }}>
          {claimed} is yours
        </Text>
        <Text className="text-mute-500 text-base mb-10 text-center max-w-xs" style={{ fontFamily: fontFamily.ui }}>
          It&apos;s in your private balance. Only you can see it.
        </Text>
        <View className="w-full max-w-xs">
          <Button label="Go to my balance" onPress={() => router.replace('/(tabs)/home')} />
        </View>
      </Screen>
    )
  }

  if (openError) return <Message title="Couldn't open this gift" body={formatError(openError)} />
  if (isLoading || !gift) return <Message title="Opening your gift…" body="Unsealing it on this phone." />
  if ('claimed' in gift) {
    return (
      <Message
        title="This gift has already been claimed"
        body="Each gift link can be claimed once. If it was meant for you, ask the sender about it."
      />
    )
  }

  const shownAmount = formatAssetAmount(gift.amount, gift.asset)
  return (
    <Screen center>
      <SealMark size={56} />
      <Text className="text-mute-500 text-base mt-6 mb-1 text-center" style={{ fontFamily: fontFamily.ui }}>
        You&apos;ve been sent a private gift
      </Text>
      <Text className="text-paper-500 text-5xl mb-3 text-center" style={{ fontFamily: fontFamily.display }}>
        {shownAmount}
      </Text>
      <Text className="text-mute-500 text-base mb-10 text-center max-w-xs" style={{ fontFamily: fontFamily.ui }}>
        {isConnected
          ? 'Claim it into your private balance. Nobody else can see the amount, and you need no SOL to claim.'
          : 'Connect a Solana wallet to claim it. You need no SOL: Envelope covers the network fees.'}
      </Text>
      <View className="w-full max-w-xs">
        {isConnected ? (
          <Button
            label={enabling ? 'Approve in your wallet…' : isBusy ? STEP_LABEL[step] : `Claim ${shownAmount}`}
            onPress={() => void handleClaim()}
            busy={isBusy || enabling}
          />
        ) : (
          <Button
            label={connecting ? 'Connecting…' : 'Connect wallet'}
            onPress={() => void connect()}
            busy={connecting}
          />
        )}
      </View>
      {error ? (
        <Text className="text-seal-500 mt-4 text-center max-w-xs" style={{ fontFamily: fontFamily.ui }}>
          {error}
        </Text>
      ) : null}
    </Screen>
  )
}

function Message({ title, body }: { title: string; body: string }) {
  return (
    <Screen center>
      <SealMark size={56} />
      <Text className="text-paper-500 text-2xl mt-6 mb-2 text-center" style={{ fontFamily: fontFamily.display }}>
        {title}
      </Text>
      <Text className="text-mute-500 text-base text-center max-w-xs" style={{ fontFamily: fontFamily.ui }}>
        {body}
      </Text>
    </Screen>
  )
}
