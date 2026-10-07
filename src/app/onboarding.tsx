import { useCBridge } from '@envelope/rn-confidential'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { Text, View } from 'react-native'
import { BackButton } from '../components/back-button'
import { Button } from '../components/button'
import { Screen } from '../components/screen'
import { SealMark } from '../components/seal-mark'
import { fontFamily } from '../design/tokens'
import { availableAssetIds } from '../config/assets'
import { useConfidentialAccount } from '../features/account/use-confidential-account'
import { useConfidentialKeys } from '../features/keys/use-confidential-keys'
import { formatError } from '../utils/format-error'

type Step = 'idle' | 'deriving' | 'configuring'

// "Enable private balance": one MWA signature derives the confidential ElGamal/AES keys in the
// bridge (the derivation signature, not the keys, is then persisted behind biometric auth so
// reopening the app doesn't need another MWA prompt — see useConfidentialKeys, secure-store.ts),
// then the account itself is created/configured on-chain so it's ready to send and receive
// (useConfidentialAccount) — a fresh wallet goes from nothing to ready in this one guided step.
export default function Onboarding() {
  const router = useRouter()
  const bridge = useCBridge()
  const { keysUnlocked, enablePrivateBalance } = useConfidentialKeys()
  const { ensureAccountReady } = useConfidentialAccount()
  const [step, setStep] = useState<Step>('idle')
  const [error, setError] = useState<string | null>(null)
  const isBusy = step !== 'idle'

  async function handleEnable() {
    if (isBusy) return
    setError(null)
    try {
      setStep('deriving')
      await enablePrivateBalance()
      setStep('configuring')
      // Private dollars and SKR from the start, in one approval: otherwise nobody can send this
      // wallet SKR until it turns SKR on separately.
      await ensureAccountReady(availableAssetIds())
      router.replace('/(tabs)/home')
    } catch (e) {
      setError(formatError(e))
    } finally {
      setStep('idle')
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
        Derives keys that only ever live on this device, then sets up your account to send and receive privately.
        Approve the prompts in your wallet to continue.
      </Text>

      {keysUnlocked ? (
        <Text className="text-mute-500 text-base mb-6" style={{ fontFamily: fontFamily.ui }}>
          Already enabled on this device.
        </Text>
      ) : (
        <View className="w-full max-w-xs">
          <Button
            label={
              !bridge.ready
                ? 'Preparing…'
                : step === 'deriving'
                  ? 'Waiting for signature…'
                  : step === 'configuring'
                    ? 'Setting up your account…'
                    : 'Enable private balance'
            }
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
      {!bridge.ready && bridge.error ? (
        <Text className="text-seal-500 mt-4 text-center max-w-xs" style={{ fontFamily: fontFamily.ui }}>
          {`Envelope's privacy engine couldn't start on this phone. Updating its WebView may fix it.\n\n${bridge.error}`}
        </Text>
      ) : null}
    </Screen>
  )
}
