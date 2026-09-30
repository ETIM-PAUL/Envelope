import { useCBridge } from '@envelope/rn-confidential'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { Text, View } from 'react-native'
import { BackButton } from '../components/back-button'
import { Button } from '../components/button'
import { Screen } from '../components/screen'
import { SealMark } from '../components/seal-mark'
import { fontFamily } from '../design/tokens'
import { useConfidentialKeys } from '../features/keys/use-confidential-keys'
import { formatError } from '../utils/format-error'

// "Enable private balance" — one MWA signature derives the confidential ElGamal/AES keys in the
// bridge; the derivation signature (not the keys) is then persisted behind biometric auth so
// reopening the app doesn't need another MWA prompt (see useConfidentialKeys, secure-store.ts).
export default function Onboarding() {
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
    <Screen center>
      <BackButton />
      <SealMark size={56} />

      <Text className="text-paper-500 text-2xl mt-6 mb-3 text-center" style={{ fontFamily: fontFamily.display }}>
        Enable private balance
      </Text>
      <Text className="text-mute-500 text-base mb-10 text-center max-w-xs" style={{ fontFamily: fontFamily.ui }}>
        One signature derives keys that only ever live on this device. Approve it in your wallet to continue.
      </Text>

      {keysUnlocked ? (
        <Text className="text-mute-500 text-base mb-6" style={{ fontFamily: fontFamily.ui }}>
          Already enabled on this device.
        </Text>
      ) : (
        <View className="w-full max-w-xs">
          <Button
            label={!bridge.ready ? 'Preparing…' : isBusy ? 'Waiting for signature…' : 'Enable private balance'}
            onPress={() => void handleEnable()}
            disabled={!bridge.ready}
            busy={isBusy}
          />
        </View>
      )}
      {error ? (
        <Text className="text-seal-500 mt-4 text-center max-w-xs" style={{ fontFamily: fontFamily.ui }}>
          {error}
        </Text>
      ) : null}
    </Screen>
  )
}
