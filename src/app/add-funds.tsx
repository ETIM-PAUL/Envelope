import { useRouter } from 'expo-router'
import { useState } from 'react'
import { Text, TextInput, View } from 'react-native'
import { BackButton } from '../components/back-button'
import { Button } from '../components/button'
import { Screen } from '../components/screen'
import { colors, fontFamily } from '../design/tokens'
import { useAddToPrivateBalance } from '../features/account/use-add-to-private-balance'
import { usePrivateBalance } from '../features/account/use-private-balance'
import { useDailyLimit } from '../features/vault/use-daily-limit'
import { useAppStore } from '../store/app-store'
import { formatError } from '../utils/format-error'
import { formatBaseUnits } from '../utils/format-amount'
import { CUSDC_DECIMALS, parseDollarsToBaseUnits } from '../utils/parse-amount'

// envelope_vault's ErrorCode::DailyLimitExceeded is Anchor custom error index 1 -> code 6001
// (0x1771) — Anchor errors don't come back with their #[msg(...)] text over the RPC, just this
// number, so matching it is the only way to show the friendly message instead of a raw hex code.
const DAILY_LIMIT_EXCEEDED_CODE = '0x1771'

export default function AddFunds() {
  const router = useRouter()
  const tier = useAppStore((s) => s.tier)
  const { addToPrivateBalance } = useAddToPrivateBalance()
  const { refetchBalance } = usePrivateBalance()
  const { data: dailyLimit, refetch: refetchDailyLimit } = useDailyLimit(tier)
  const [amountText, setAmountText] = useState('')
  const [isBusy, setIsBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const amount = parseDollarsToBaseUnits(amountText)
  const overLimit = amount !== null && dailyLimit !== undefined && amount > dailyLimit.remaining

  async function handleAdd() {
    if (isBusy || !amount || overLimit) return
    setIsBusy(true)
    setError(null)
    try {
      await addToPrivateBalance(amount)
      await refetchBalance()
      router.replace('/(tabs)/home')
    } catch (e) {
      const message = formatError(e)
      setError(
        message.includes(DAILY_LIMIT_EXCEEDED_CODE)
          ? "You've hit today's limit for your tier — stake SKR to raise it."
          : message,
      )
      await refetchDailyLimit()
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <Screen center>
      <BackButton />
      <Text className="text-paper-500 text-2xl mb-2 text-center" style={{ fontFamily: fontFamily.display }}>
        Add to private balance
      </Text>
      <Text className="text-mute-500 text-base mb-2 text-center max-w-xs" style={{ fontFamily: fontFamily.ui }}>
        Moves USDC from your wallet into your sealed cUSDC balance.
      </Text>
      {dailyLimit ? (
        <Text className="text-mute-600 text-sm mb-10 text-center" style={{ fontFamily: fontFamily.ui }}>
          You can add ${formatBaseUnits(dailyLimit.remaining, CUSDC_DECIMALS)} more today
        </Text>
      ) : (
        <View className="mb-10" />
      )}

      <View className="flex-row items-center gap-2 mb-10">
        <Text className="text-paper-500 text-4xl" style={{ fontFamily: fontFamily.display }}>
          $
        </Text>
        <TextInput
          value={amountText}
          onChangeText={setAmountText}
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
          label={
            isBusy ? 'Adding…' : overLimit ? "Over today's limit" : amountText ? `Add $${amountText}` : 'Add funds'
          }
          onPress={() => void handleAdd()}
          disabled={!amount || overLimit}
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
