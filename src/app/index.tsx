import { Redirect } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { Text, View } from 'react-native'
import { Button } from '../components/button'
import { Screen } from '../components/screen'
import { SealMark } from '../components/seal-mark'
import { fontFamily } from '../design/tokens'
import { useWalletSession } from '../features/wallet/use-wallet-session'

// The app's entry gate. No wallet connected -> connect UI; connected -> straight into the tab
// navigator. Onboarding (the key-derivation flow) is reached from Home, not here — this screen's
// only job is the MWA connection itself.
export default function Gate() {
  const { isConnected, isBusy, error, connect } = useWalletSession()

  if (isConnected) {
    return <Redirect href="/(tabs)/home" />
  }

  return (
    <Screen center>
      <SealMark size={56} />

      <Text className="text-paper-500 text-4xl mt-6 mb-2 tracking-tight" style={{ fontFamily: fontFamily.display }}>
        Envelope
      </Text>
      <Text className="text-mute-500 text-base mb-12 text-center max-w-xs" style={{ fontFamily: fontFamily.ui }}>
        Private payments on Solana. Sealed until you open them.
      </Text>

      <View className="w-full max-w-xs">
        <Button label={isBusy ? 'Connecting…' : 'Connect wallet'} onPress={() => void connect()} busy={isBusy} />
      </View>
      {error ? (
        <Text className="text-seal-500 mt-4 text-center max-w-xs" style={{ fontFamily: fontFamily.ui }}>
          {error}
        </Text>
      ) : null}

      <StatusBar style="light" />
    </Screen>
  )
}
