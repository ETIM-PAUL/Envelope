// Phase 13: amount entry, fee line, fingerprint confirm, and the progress UI for the send the
// plan calls for (*Preparing proofs → Verifying & sending → Confirming → Done*). Reached from
// (tabs)/send.tsx with `recipient` already readiness-checked once; useSendPrivately re-checks it
// (cheap, and guards the race where the recipient's account changes between screens).
import * as LocalAuthentication from 'expo-local-authentication'
import { useQuery } from '@tanstack/react-query'
import { Link, useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'
import { openURL } from 'expo-linking'
import { Pressable, Text, TextInput, View } from 'react-native'
import { AssetToggle } from '../components/asset-picker'
import { BackButton } from '../components/back-button'
import { Button } from '../components/button'
import { Screen } from '../components/screen'
import { colors, fontFamily } from '../design/tokens'
import {
  ASSET_DECIMALS,
  assetLabel,
  availableAssetIds,
  formatAssetAmount,
  getAsset,
  parseAssetList,
  type AssetId,
} from '../config/assets'
import { useAppStore } from '../store/app-store'
import { useConfidentialAccount } from '../features/account/use-confidential-account'
import { usePrivateBalance } from '../features/account/use-private-balance'
import { useSendPrivately, type SendStep } from '../features/account/use-send-privately'
import { useTier } from '../features/account/use-tier'
import { useNetwork } from '../features/network/use-network'
import { useStakeInfo } from '../features/stake/use-stake-info'
import { ellipsify } from '../utils/ellipsify'
import { formatError } from '../utils/format-error'
import { formatExactBaseUnits } from '../utils/format-amount'
import { parseDollarsToBaseUnits } from '../utils/parse-amount'

const STEP_LABEL: Record<SendStep, string> = {
  idle: '',
  'checking-recipient': 'Checking recipient…',
  'preparing-proofs': 'Preparing proofs…',
  relaying: 'Verifying & sending…',
  confirming: 'Confirming…',
  done: 'Done',
}

const QUICK_AMOUNTS = ['2', '5', '10']
const SKR_DECIMALS = 6

export default function SendConfirm() {
  const router = useRouter()
  // `assets`: the tokens the recipient asked for (their QR code's `?assets=`), if they said.
  const { recipient, quickAmounts, assets } = useLocalSearchParams<{
    recipient: string
    quickAmounts?: string
    assets?: string
  }>()
  const { getExplorerUrl } = useNetwork()
  const walletAddress = useAppStore((s) => s.walletAddress)
  const preferredAsset = useAppStore((s) => s.selectedAsset)
  const { isRecipientReady } = useConfidentialAccount()

  // What can actually be sent: the tokens asked for that the recipient (a wallet or a pot) has a
  // confidential account for. A pot's accounts are exactly the tokens its host chose.
  const requested = (parseAssetList(assets) ?? availableAssetIds()).filter((id) => availableAssetIds().includes(id))
  const { data: offered } = useQuery({
    queryKey: ['recipient-assets', recipient, requested.join(',')],
    enabled: Boolean(recipient),
    queryFn: async () => {
      const ready = await Promise.all(requested.map((id) => isRecipientReady(recipient!, id)))
      return requested.filter((_, i) => ready[i])
    },
  })
  const [chosenAsset, setChosenAsset] = useState<AssetId | null>(null)
  // Start on the token Home is showing (when the recipient asked for it), never switch on the
  // user's behalf: if the recipient can't receive the chosen token, say so and let them pick.
  const asset: AssetId = chosenAsset ?? (requested.includes(preferredAsset) ? preferredAsset : (requested[0] ?? 'usdc'))
  const recipientCanReceive = offered?.includes(asset)
  const otherOffered = offered?.find((id) => id !== asset)
  const isDollars = asset === 'usdc'
  const { availableBalance } = usePrivateBalance(asset)
  const { data: tierInfo } = useTier(walletAddress)
  const { sendPrivately, step, isBusy } = useSendPrivately()
  const { data: stakeInfo } = useStakeInfo()

  const [amountText, setAmountText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [signatures, setSignatures] = useState<string[] | null>(null)

  const amount = parseDollarsToBaseUnits(amountText, ASSET_DECIMALS)
  const shownAmount = isDollars ? `$${amountText}` : `${amountText} SKR`
  const overBalance = amount !== null && availableBalance !== null && amount > availableBalance
  const feeAmount = tierInfo?.tier === 'free' && tierInfo.freeTierFeeAmount ? BigInt(tierInfo.freeTierFeeAmount) : 0n
  // A free-tier send pays its fee in SKR from the wallet; without enough, the fee transfer can't
  // run and the wallet's own simulation fails the whole send — so catch it here, before the wallet.
  const notEnoughSkrForFee = feeAmount > 0n && stakeInfo !== undefined && stakeInfo.skrBalance < feeAmount

  async function handleConfirm() {
    if (isBusy || !amount || overBalance || notEnoughSkrForFee || !recipient || !recipientCanReceive) return
    setError(null)

    const biometricResult = await LocalAuthentication.authenticateAsync({
      promptMessage: `Confirm sending ${shownAmount}`,
      cancelLabel: 'Cancel',
    })
    if (!biometricResult.success) {
      if (biometricResult.error !== 'user_cancel') {
        setError("Couldn't confirm — try again.")
      }
      return
    }

    try {
      const result = await sendPrivately(recipient, amount, asset)
      setSignatures(result)
    } catch (e) {
      setError(formatError(e))
    }
  }

  if (signatures) {
    return (
      <Screen center>
        <View className="w-16 h-16 rounded-full bg-ink-900 border border-ink-800 items-center justify-center mb-5">
          <Text style={{ fontSize: 28 }}>✓</Text>
        </View>
        <Text className="text-paper-500 text-2xl mb-2 text-center" style={{ fontFamily: fontFamily.display }}>
          Sent
        </Text>
        <Text className="text-mute-500 text-base mb-8 text-center max-w-xs" style={{ fontFamily: fontFamily.ui }}>
          {shownAmount} sent to {ellipsify(recipient ?? '')}. Only you and the recipient know the amount.
        </Text>
        <Pressable
          onPress={() => void openURL(getExplorerUrl(`tx/${signatures[signatures.length - 1]}`))}
          className="mb-6"
        >
          <Text className="text-mute-500 text-sm" style={{ fontFamily: fontFamily.uiSemibold }}>
            View on explorer
          </Text>
        </Pressable>
        <View className="w-full max-w-xs">
          <Button label="Done" onPress={() => router.replace('/(tabs)/home')} />
        </View>
      </Screen>
    )
  }

  return (
    <Screen center>
      <BackButton />
      <Text className="text-paper-500 text-2xl mb-2 text-center" style={{ fontFamily: fontFamily.display }}>
        Send to {ellipsify(recipient ?? '')}
      </Text>
      {requested.length > 1 && !isBusy ? (
        <View className="mb-4">
          <AssetToggle value={asset} onChange={setChosenAsset} options={requested} />
        </View>
      ) : null}
      <Text className="text-mute-500 text-base mb-10 text-center max-w-xs" style={{ fontFamily: fontFamily.ui }}>
        {offered === undefined
          ? 'Checking…'
          : !recipientCanReceive
            ? `This address can't receive private ${getAsset(asset).symbol} yet.${
                otherOffered
                  ? ` Switch to ${assetLabel(otherOffered)}, or ask them to turn on ${getAsset(asset).symbol} in Receive.`
                  : ''
              }`
            : availableBalance !== null
              ? `Available: ${formatAssetAmount(availableBalance, asset)}`
              : 'Loading…'}
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
          autoFocus
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

      {quickAmounts ? (
        <View className="flex-row gap-2 mb-6">
          {QUICK_AMOUNTS.map((value) => (
            <Pressable
              key={value}
              onPress={() => {
                setAmountText(value)
                setError(null)
              }}
              disabled={isBusy}
              className={`rounded-full px-5 py-2.5 border ${amountText === value ? 'bg-seal-500 border-seal-500' : 'bg-ink-900 border-ink-800'}`}
            >
              <Text
                style={{
                  fontFamily: fontFamily.uiSemibold,
                  color: amountText === value ? colors.paper[500] : colors.mute[500],
                  fontSize: 14,
                }}
              >
                {isDollars ? `$${value}` : `${value} SKR`}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <Text
        className={`text-mute-600 text-xs ${notEnoughSkrForFee ? 'mb-2' : 'mb-10'}`}
        style={{ fontFamily: fontFamily.ui }}
      >
        {feeAmount > 0n
          ? `Send fee: ${formatExactBaseUnits(feeAmount, SKR_DECIMALS)} SKR · the relayer pays the SOL network fee`
          : 'No fee — your tier covers relayed sends'}
      </Text>
      {notEnoughSkrForFee ? (
        <Text className="text-paper-400 text-xs mb-10 text-center max-w-xs" style={{ fontFamily: fontFamily.ui }}>
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
              : offered && !recipientCanReceive
                ? `Can't receive ${getAsset(asset).symbol}`
                : overBalance
                  ? 'Not enough balance'
                  : notEnoughSkrForFee
                    ? 'Not enough SKR for the fee'
                    : amountText
                      ? `Send ${shownAmount}`
                      : 'Send'
          }
          onPress={() => void handleConfirm()}
          disabled={!amount || overBalance || notEnoughSkrForFee || !recipientCanReceive}
          busy={isBusy}
        />
      </View>
      {error ? (
        <Text className="text-seal-500 mt-4 text-center max-w-xs" style={{ fontFamily: fontFamily.ui }}>
          {error}
        </Text>
      ) : null}
    </Screen>
  )
}
