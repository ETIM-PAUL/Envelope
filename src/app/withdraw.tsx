// Phase 17: amount entry against the real decrypted available balance, then useWithdraw's two
// strictly-ordered steps (confidential -> public cUSDC, then Approve+Unwrap -> real USDC),
// reporting progress the same way send-confirm.tsx does.
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { Text, TextInput, View } from 'react-native'
import { BackButton } from '../components/back-button'
import { Button } from '../components/button'
import { Screen } from '../components/screen'
import { colors, fontFamily } from '../design/tokens'
import { useWithdraw, type WithdrawStep } from '../features/account/use-withdraw'
import { usePrivateBalance } from '../features/account/use-private-balance'
import { formatBaseUnits } from '../utils/format-amount'
import { formatError } from '../utils/format-error'
import { CUSDC_DECIMALS, parseDollarsToBaseUnits } from '../utils/parse-amount'

type Step = 'idle' | WithdrawStep

const STEP_LABEL: Record<Step, string> = {
  idle: 'Withdraw',
  unsealing: 'Unsealing…',
  unwrapping: 'Sending to your wallet…',
}

export default function Withdraw() {
  const router = useRouter()
  const { withdraw } = useWithdraw()
  const { availableBalance } = usePrivateBalance()
  const [amountText, setAmountText] = useState('')
  const [step, setStep] = useState<Step>('idle')
  const [error, setError] = useState<string | null>(null)
  const isBusy = step !== 'idle'

  const amount = parseDollarsToBaseUnits(amountText)
  const overBalance = amount !== null && availableBalance !== null && amount > availableBalance

  async function handleWithdraw() {
    if (isBusy || !amount || overBalance) return
    setError(null)
    try {
      await withdraw(amount, setStep)
      setStep('idle')
      router.replace('/(tabs)/home')
    } catch (e) {
      setError(formatError(e))
      setStep('idle')
    }
  }

  return (
    <Screen center>
      <BackButton />
      <Text className="text-paper-500 text-2xl mb-2 text-center" style={{ fontFamily: fontFamily.display }}>
        Withdraw to USDC
      </Text>
      <Text className="text-mute-500 text-base mb-10 text-center max-w-xs" style={{ fontFamily: fontFamily.ui }}>
        {availableBalance !== null
          ? `Available: $${formatBaseUnits(availableBalance, CUSDC_DECIMALS)}`
          : 'Loading balance…'}
      </Text>

      <View className="flex-row items-center gap-2 mb-10">
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

      <View className="w-full max-w-xs">
        <Button
          label={isBusy ? STEP_LABEL[step] : overBalance ? 'Not enough balance' : 'Withdraw'}
          onPress={() => void handleWithdraw()}
          disabled={!amount || overBalance}
          busy={isBusy}
        />
      </View>
      {error ? (
        <Text className="text-seal-500 mt-4 text-center max-w-xs" style={{ fontFamily: fontFamily.ui }}>
          {error}
        </Text>
      ) : null}
      <Text className="text-mute-600 text-xs mt-6 text-center max-w-xs" style={{ fontFamily: fontFamily.ui }}>
        Lands as regular USDC in your connected wallet — no longer private.
      </Text>
    </Screen>
  )
}
