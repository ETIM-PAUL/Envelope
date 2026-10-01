// Phase 13: amount entry, fee line, fingerprint confirm, and the progress UI for the send the
// plan calls for (*Preparing proofs → Verifying & sending → Confirming → Done*). Reached from
// (tabs)/send.tsx with `recipient` already readiness-checked once; useSendPrivately re-checks it
// (cheap, and guards the race where the recipient's account changes between screens).
import * as LocalAuthentication from 'expo-local-authentication'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'
import { openURL } from 'expo-linking'
import { Pressable, Text, TextInput, View } from 'react-native'
import { BackButton } from '../components/back-button'
import { Button } from '../components/button'
import { Screen } from '../components/screen'
import { colors, fontFamily } from '../design/tokens'
import { useAppStore } from '../store/app-store'
import { usePrivateBalance } from '../features/account/use-private-balance'
import { useSendPrivately, type SendStep } from '../features/account/use-send-privately'
import { useTier } from '../features/account/use-tier'
import { useNetwork } from '../features/network/use-network'
import { ellipsify } from '../utils/ellipsify'
import { formatError } from '../utils/format-error'
import { formatBaseUnits } from '../utils/format-amount'
import { CUSDC_DECIMALS, parseDollarsToBaseUnits } from '../utils/parse-amount'

const STEP_LABEL: Record<SendStep, string> = {
  idle: '',
  'checking-recipient': 'Checking recipient…',
  'preparing-proofs': 'Preparing proofs…',
  relaying: 'Verifying & sending…',
  confirming: 'Confirming…',
  done: 'Done',
}

const QUICK_AMOUNTS = ['2', '5', '10']

export default function SendConfirm() {
  const router = useRouter()
  const { recipient, quickAmounts } = useLocalSearchParams<{ recipient: string; quickAmounts?: string }>()
  const { getExplorerUrl } = useNetwork()
  const walletAddress = useAppStore((s) => s.walletAddress)
  const { availableBalance } = usePrivateBalance()
  const { data: tierInfo } = useTier(walletAddress)
  const { sendPrivately, step, isBusy } = useSendPrivately()

  const [amountText, setAmountText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [signatures, setSignatures] = useState<string[] | null>(null)

  const amount = parseDollarsToBaseUnits(amountText)
  const overBalance = amount !== null && availableBalance !== null && amount > availableBalance
  const feeAmount = tierInfo?.tier === 'free' && tierInfo.freeTierFeeAmount ? BigInt(tierInfo.freeTierFeeAmount) : 0n

  async function handleConfirm() {
    if (isBusy || !amount || overBalance || !recipient) return
    setError(null)

    const biometricResult = await LocalAuthentication.authenticateAsync({
      promptMessage: `Confirm sending $${amountText}`,
      cancelLabel: 'Cancel',
    })
    if (!biometricResult.success) {
      if (biometricResult.error !== 'user_cancel') {
        setError("Couldn't confirm — try again.")
      }
      return
    }

    try {
      const result = await sendPrivately(recipient, amount)
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
          ${amountText} sent to {ellipsify(recipient ?? '')}. Only you and the recipient know the amount.
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
      <Text className="text-mute-500 text-base mb-10 text-center max-w-xs" style={{ fontFamily: fontFamily.ui }}>
        {availableBalance !== null
          ? `Available: $${formatBaseUnits(availableBalance, CUSDC_DECIMALS)}`
          : 'Loading balance…'}
      </Text>

      <View className="flex-row items-center gap-2 mb-2">
        <Text className="text-paper-500 text-4xl" style={{ fontFamily: fontFamily.display }}>
          $
        </Text>
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
                ${value}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <Text className="text-mute-600 text-xs mb-10" style={{ fontFamily: fontFamily.ui }}>
        {feeAmount > 0n
          ? `Network fee: ${formatBaseUnits(feeAmount, CUSDC_DECIMALS)} SKR · relayer pays your SOL fees`
          : 'No fee — your tier covers relayed sends'}
      </Text>

      <View className="w-full max-w-xs">
        <Button
          label={
            isBusy ? STEP_LABEL[step] : overBalance ? 'Not enough balance' : amountText ? `Send $${amountText}` : 'Send'
          }
          onPress={() => void handleConfirm()}
          disabled={!amount || overBalance}
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
