import { useRouter } from 'expo-router'
import { useState } from 'react'
import { Text, TextInput, View } from 'react-native'
import { AssetToggle } from '../components/asset-picker'
import { BackButton } from '../components/back-button'
import { Button } from '../components/button'
import { Screen } from '../components/screen'
import { colors, fontFamily } from '../design/tokens'
import { useAddToPrivateBalance } from '../features/account/use-add-to-private-balance'
import { usePrivateBalance } from '../features/account/use-private-balance'
import { useDailyLimit } from '../features/vault/use-daily-limit'
import { ASSET_DECIMALS, getAsset } from '../config/assets'
import { useAppStore } from '../store/app-store'
import { formatError } from '../utils/format-error'
import { formatBaseUnits } from '../utils/format-amount'
import { parseDollarsToBaseUnits } from '../utils/parse-amount'

export default function AddFunds() {
  const router = useRouter()
  const tier = useAppStore((s) => s.tier)
  const asset = useAppStore((s) => s.selectedAsset)
  const setAsset = useAppStore((s) => s.setSelectedAsset)
  const { symbol, privateSymbol } = getAsset(asset)
  const isDollars = asset === 'usdc'
  const { addToPrivateBalance } = useAddToPrivateBalance()
  const { refetchBalance } = usePrivateBalance()
  const { data: dailyLimit, refetch: refetchDailyLimit } = useDailyLimit(tier)
  const [amountText, setAmountText] = useState('')
  const [isBusy, setIsBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const amount = parseDollarsToBaseUnits(amountText, ASSET_DECIMALS)
  // Tier limits are on dollars only (see envelope_vault's AssetVault).
  const overLimit = isDollars && amount !== null && dailyLimit !== undefined && amount > dailyLimit.remaining
  const amountLabel = isDollars ? `$${amountText}` : `${amountText} SKR`

  async function handleAdd() {
    if (isBusy || !amount || overLimit) return
    setIsBusy(true)
    setError(null)
    try {
      await addToPrivateBalance(amount, asset)
      await refetchBalance()
      router.replace('/(tabs)/home')
    } catch (e) {
      setError(formatError(e))
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
      <View className="mb-4">
        <AssetToggle value={asset} onChange={setAsset} />
      </View>
      <Text className="text-mute-500 text-base mb-2 text-center max-w-xs" style={{ fontFamily: fontFamily.ui }}>
        Moves {symbol} from your wallet into your sealed {privateSymbol} balance.
      </Text>
      {!isDollars ? (
        <Text className="text-mute-600 text-sm mb-10 text-center" style={{ fontFamily: fontFamily.ui }}>
          No daily limit for SKR
        </Text>
      ) : dailyLimit ? (
        <Text className="text-mute-600 text-sm mb-10 text-center" style={{ fontFamily: fontFamily.ui }}>
          You can add ${formatBaseUnits(dailyLimit.remaining, ASSET_DECIMALS)} more today
        </Text>
      ) : (
        <View className="mb-10" />
      )}

      <View className="flex-row items-center gap-2 mb-10">
        {isDollars ? (
          <Text className="text-paper-500 text-4xl" style={{ fontFamily: fontFamily.display }}>
            $
          </Text>
        ) : null}
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
        {isDollars ? null : (
          <Text className="text-mute-500 text-2xl" style={{ fontFamily: fontFamily.display }}>
            SKR
          </Text>
        )}
      </View>

      <View className="w-full max-w-xs">
        <Button
          label={
            isBusy ? 'Adding…' : overLimit ? "Over today's limit" : amountText ? `Add ${amountLabel}` : 'Add funds'
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
