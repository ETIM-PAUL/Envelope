import { useRouter } from 'expo-router'
import { useState } from 'react'
import { Text, TextInput, View } from 'react-native'
import { BackButton } from '../components/back-button'
import { Button } from '../components/button'
import { Screen } from '../components/screen'
import { colors, fontFamily } from '../design/tokens'
import { useAddToPrivateBalance } from '../features/account/use-add-to-private-balance'
import { usePrivateBalance } from '../features/account/use-private-balance'
import { formatError } from '../utils/format-error'
import { parseDollarsToBaseUnits } from '../utils/parse-amount'

export default function AddFunds() {
  const router = useRouter()
  const { addToPrivateBalance } = useAddToPrivateBalance()
  const { refetchBalance } = usePrivateBalance()
  const [amountText, setAmountText] = useState('')
  const [isBusy, setIsBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const amount = parseDollarsToBaseUnits(amountText)

  async function handleAdd() {
    if (isBusy || !amount) return
    setIsBusy(true)
    setError(null)
    try {
      await addToPrivateBalance(amount)
      await refetchBalance()
      router.replace('/(tabs)/home')
    } catch (e) {
      setError(formatError(e))
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
      <Text className="text-mute-500 text-base mb-10 text-center max-w-xs" style={{ fontFamily: fontFamily.ui }}>
        Moves USDC from your wallet into your sealed cUSDC balance.
      </Text>

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
          label={isBusy ? 'Adding…' : amountText ? `Add $${amountText}` : 'Add funds'}
          onPress={() => void handleAdd()}
          disabled={!amount}
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
