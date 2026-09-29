import { useCBridge } from '@envelope/rn-confidential'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useConfidentialKeys } from '../features/keys/use-confidential-keys'
import { formatError } from '../utils/format-error'

// Phase 8: "Enable private balance" — one MWA signature derives the confidential ElGamal/AES
// keys in the bridge; the derivation signature (not the keys) is then persisted behind biometric
// auth so reopening the app doesn't need another MWA prompt (see useConfidentialKeys, secure-store.ts).
export default function Onboarding() {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const bridge = useCBridge()
  const { keysUnlocked, enablePrivateBalance } = useConfidentialKeys()
  const [isBusy, setIsBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleEnable() {
    if (isBusy) return
    setIsBusy(true)
    setError(null)
    try {
      await enablePrivateBalance()
      router.replace('/(tabs)/home')
    } catch (e) {
      setError(formatError(e))
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <View className="flex-1 bg-paper-50 items-center justify-center px-8" style={{ paddingTop: insets.top }}>
      <Text className="text-ink-900 text-2xl font-extrabold mb-3 text-center">Enable private balance</Text>
      <Text className="text-ink-600 text-base mb-10 text-center max-w-sm">
        One signature derives keys that only live on this device. Approve it in your wallet to continue.
      </Text>

      {keysUnlocked ? (
        <Text className="text-ink-600 text-base mb-6">Already enabled on this device.</Text>
      ) : (
        <Pressable
          disabled={isBusy || !bridge.ready}
          onPress={() => void handleEnable()}
          className={`bg-seal-600 px-8 py-4 rounded-xl active:bg-seal-700 ${isBusy || !bridge.ready ? 'opacity-50' : ''}`}
        >
          <Text className="text-paper-50 font-bold text-lg">
            {!bridge.ready ? 'Preparing…' : isBusy ? 'Waiting for signature…' : 'Enable private balance'}
          </Text>
        </Pressable>
      )}
      {error ? <Text className="text-seal-600 mt-4 text-center max-w-sm">{error}</Text> : null}
    </View>
  )
}
