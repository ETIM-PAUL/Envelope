// Send as a gift link: private funds behind a link anyone can claim by opening it in Envelope —
// for someone who doesn't use Envelope yet (the link's page offers the app). The amount is hidden
// on-chain like any private send. Below the form: this device's gift links, with a way to take
// back any that haven't been claimed. See features/gifts/use-gifts.ts.
import Feather from '@expo/vector-icons/Feather'
import * as Clipboard from 'expo-clipboard'
import * as LocalAuthentication from 'expo-local-authentication'
import { Link, useRouter } from 'expo-router'
import { useState } from 'react'
import { Pressable, Share, Text, TextInput, View } from 'react-native'
import QRCode from 'react-native-qrcode-svg'
import { AssetToggle } from '../components/asset-picker'
import { BackButton } from '../components/back-button'
import { Button } from '../components/button'
import { Screen } from '../components/screen'
import { colors, fontFamily } from '../design/tokens'
import { ASSET_DECIMALS, formatAssetAmount, getAsset, type AssetId } from '../config/assets'
import { usePrivateBalance } from '../features/account/use-private-balance'
import { useTier } from '../features/account/use-tier'
import { readGiftSecret } from '../features/gifts/gift-store'
import {
  useClaimGift,
  useCreateGift,
  useSentGifts,
  type CreateGiftStep,
  type SentGift,
} from '../features/gifts/use-gifts'
import { useStakeInfo } from '../features/stake/use-stake-info'
import { useAppStore } from '../store/app-store'
import { formatError } from '../utils/format-error'
import { formatExactBaseUnits } from '../utils/format-amount'
import { parseDollarsToBaseUnits } from '../utils/parse-amount'

const STEP_LABEL: Record<CreateGiftStep, string> = {
  idle: '',
  creating: 'Creating the gift…',
  'checking-recipient': 'Creating the gift…',
  'preparing-proofs': 'Preparing proofs…',
  relaying: 'Sealing it in…',
  confirming: 'Confirming…',
  done: 'Done',
}

const SKR_DECIMALS = 6

export default function SendGift() {
  const router = useRouter()
  const walletAddress = useAppStore((s) => s.walletAddress)
  const preferredAsset = useAppStore((s) => s.selectedAsset)
  const [asset, setAsset] = useState<AssetId>(preferredAsset)
  const isDollars = asset === 'usdc'
  const { availableBalance } = usePrivateBalance(asset)
  const { data: tierInfo } = useTier(walletAddress)
  const { data: stakeInfo } = useStakeInfo()
  const { createGift, step, isBusy } = useCreateGift()

  const [amountText, setAmountText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<{ link: string; shownAmount: string } | null>(null)
  const [copied, setCopied] = useState(false)

  const amount = parseDollarsToBaseUnits(amountText, ASSET_DECIMALS)
  const shownAmount = isDollars ? `$${amountText}` : `${amountText} SKR`
  const overBalance = amount !== null && availableBalance !== null && amount > availableBalance
  const feeAmount = tierInfo?.tier === 'free' && tierInfo.freeTierFeeAmount ? BigInt(tierInfo.freeTierFeeAmount) : 0n
  const notEnoughSkrForFee = feeAmount > 0n && stakeInfo !== undefined && stakeInfo.skrBalance < feeAmount

  async function handleCreate() {
    if (isBusy || !amount || overBalance || notEnoughSkrForFee) return
    setError(null)
    const biometric = await LocalAuthentication.authenticateAsync({
      promptMessage: `Confirm a ${shownAmount} gift`,
      cancelLabel: 'Cancel',
    })
    if (!biometric.success) {
      if (biometric.error !== 'user_cancel') setError("Couldn't confirm — try again.")
      return
    }
    try {
      const { link } = await createGift(asset, amount)
      setCreated({ link, shownAmount })
    } catch (e) {
      setError(formatError(e))
    }
  }

  if (created) {
    return (
      <Screen scroll>
        <View className="items-center">
          <Text className="text-paper-500 text-2xl mb-2 text-center" style={{ fontFamily: fontFamily.display }}>
            Your {created.shownAmount} gift is ready
          </Text>
          <Text className="text-mute-500 text-base mb-6 text-center max-w-xs" style={{ fontFamily: fontFamily.ui }}>
            Send this link to the person it&apos;s for. They open it, install Envelope, and the gift lands in their
            private balance.
          </Text>
          <View className="bg-paper-500 p-4 rounded-3xl mb-6">
            <QRCode value={created.link} size={180} color={colors.ink[950]} backgroundColor={colors.paper[500]} />
          </View>
          <View className="w-full max-w-xs gap-3">
            <Button
              label="Share gift link"
              onPress={() =>
                void Share.share({
                  message: `I sent you a private gift on Envelope. Open this to claim it: ${created.link}`,
                  url: created.link,
                })
              }
            />
            <Button
              label={copied ? 'Copied' : 'Copy link'}
              variant="secondary"
              onPress={() => {
                void Clipboard.setStringAsync(created.link)
                setCopied(true)
              }}
            />
          </View>
          <Text className="text-paper-400 text-sm mt-6 text-center max-w-xs" style={{ fontFamily: fontFamily.ui }}>
            Anyone with this link can claim the gift, so share it only with them. Until it&apos;s claimed, you can take
            it back from Send → Send as a gift link.
          </Text>
          <View className="w-full max-w-xs mt-8">
            <Button label="Done" variant="secondary" onPress={() => router.replace('/(tabs)/home')} />
          </View>
        </View>
      </Screen>
    )
  }

  return (
    <Screen scroll>
      <BackButton />
      <View className="items-center">
        <Text className="text-paper-500 text-2xl mb-2 text-center" style={{ fontFamily: fontFamily.display }}>
          Send as a gift link
        </Text>
        <Text className="text-mute-500 text-base mb-6 text-center max-w-xs" style={{ fontFamily: fontFamily.ui }}>
          For someone who isn&apos;t on Envelope yet: they claim it by opening the link in the app.
        </Text>
        {!isBusy ? (
          <View className="mb-4">
            <AssetToggle value={asset} onChange={setAsset} />
          </View>
        ) : null}
        <Text className="text-mute-500 text-base mb-8 text-center" style={{ fontFamily: fontFamily.ui }}>
          {availableBalance !== null ? `Available: ${formatAssetAmount(availableBalance, asset)}` : 'Loading…'}
        </Text>

        <View className="flex-row items-center gap-2 mb-2">
          {isDollars ? (
            <Text className="text-paper-500 text-4xl" style={{ fontFamily: fontFamily.display }}>
              $
            </Text>
          ) : null}
          <TextInput
            value={amountText}
            onChangeText={(text) => {
              setAmountText(text)
              setError(null)
            }}
            placeholder="0.00"
            placeholderTextColor={colors.mute[600]}
            keyboardType="decimal-pad"
            editable={!isBusy}
            className="text-paper-500 text-4xl min-w-24"
            style={{ fontFamily: fontFamily.display }}
          />
          {isDollars ? null : (
            <Text className="text-mute-500 text-2xl" style={{ fontFamily: fontFamily.display }}>
              SKR
            </Text>
          )}
        </View>

        <Text
          className={`text-mute-600 text-xs text-center ${notEnoughSkrForFee ? 'mb-2' : 'mb-8'}`}
          style={{ fontFamily: fontFamily.ui }}
        >
          {feeAmount > 0n
            ? `Send fee: ${formatExactBaseUnits(feeAmount, SKR_DECIMALS)} SKR · claiming is free for them`
            : 'No fee · claiming is free for them'}
        </Text>
        {notEnoughSkrForFee ? (
          <Text className="text-paper-400 text-xs mb-8 text-center max-w-xs" style={{ fontFamily: fontFamily.ui }}>
            You need {formatExactBaseUnits(feeAmount, SKR_DECIMALS)} SKR in your wallet for this fee.{' '}
            <Link href="/(tabs)/stake" className="text-seal-400" style={{ fontFamily: fontFamily.uiSemibold }}>
              Get test SKR
            </Link>
          </Text>
        ) : null}

        <View className="w-full max-w-xs">
          <Button
            label={
              isBusy
                ? STEP_LABEL[step]
                : overBalance
                  ? 'Not enough balance'
                  : notEnoughSkrForFee
                    ? 'Not enough SKR for the fee'
                    : amountText
                      ? `Create ${shownAmount} gift link`
                      : 'Create gift link'
            }
            onPress={() => void handleCreate()}
            disabled={!amount || overBalance || notEnoughSkrForFee}
            busy={isBusy}
          />
        </View>
        {error ? (
          <Text className="text-seal-500 mt-4 text-center max-w-xs" style={{ fontFamily: fontFamily.ui }}>
            {error}
          </Text>
        ) : null}
      </View>

      <SentGifts disabled={isBusy} />
    </Screen>
  )
}

const STATUS_LABEL: Record<SentGift['status'], string> = {
  waiting: 'Not claimed yet',
  claimed: 'Claimed',
  'taken-back': 'Taken back',
}

function SentGifts({ disabled }: { disabled: boolean }) {
  const { data: gifts } = useSentGifts()
  const { claimGift, isBusy } = useClaimGift()
  const [takingBack, setTakingBack] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (!gifts || gifts.length === 0) return null

  async function takeBack(gift: SentGift) {
    setError(null)
    setTakingBack(gift.giftOwner)
    try {
      const secret = await readGiftSecret(gift.giftOwner)
      if (!secret) throw new Error("This gift's link isn't stored on this phone.")
      await claimGift(secret, { takingBack: true })
    } catch (e) {
      setError(formatError(e))
    } finally {
      setTakingBack(null)
    }
  }

  return (
    <View className="mt-12">
      <Text className="text-paper-500 text-lg mb-3" style={{ fontFamily: fontFamily.displayMedium }}>
        Your gift links
      </Text>
      <View className="gap-2">
        {gifts.map((gift) => (
          <View
            key={gift.giftOwner}
            className="bg-ink-900 border border-ink-800 rounded-2xl px-4 py-3 flex-row items-center"
          >
            <Feather name="gift" size={16} color={colors.mute[500]} />
            <View className="flex-1 ml-3">
              <Text className="text-paper-500" style={{ fontFamily: fontFamily.uiSemibold }}>
                {formatAssetAmount(BigInt(gift.amount), gift.asset)}
              </Text>
              <Text className="text-mute-500 text-xs" style={{ fontFamily: fontFamily.ui }}>
                {STATUS_LABEL[gift.status]} · {new Date(gift.createdAt).toLocaleDateString()}
              </Text>
            </View>
            {gift.status === 'waiting' ? (
              <Pressable
                onPress={() => void takeBack(gift)}
                disabled={disabled || isBusy}
                accessibilityLabel={`Take back the ${getAsset(gift.asset).symbol} gift`}
              >
                <Text className="text-seal-400 text-sm" style={{ fontFamily: fontFamily.uiSemibold }}>
                  {takingBack === gift.giftOwner ? 'Taking back…' : 'Take back'}
                </Text>
              </Pressable>
            ) : null}
          </View>
        ))}
      </View>
      {error ? (
        <Text className="text-seal-500 mt-3 text-sm" style={{ fontFamily: fontFamily.ui }}>
          {error}
        </Text>
      ) : null}
    </View>
  )
}
