import { Redirect } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { Pressable, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useWalletSession } from '../features/wallet/use-wallet-session'

// Phase 7: the app's entry gate. No wallet connected -> connect UI; connected -> straight into
// the tab navigator. Onboarding (Phase 8's key-derivation flow) is reached from Home, not here —
// this screen's only job is the MWA connection itself.
export default function Gate() {
  const insets = useSafeAreaInsets()
  const { isConnected, isBusy, error, connect } = useWalletSession()

  if (isConnected) {
    return <Redirect href="/(tabs)/home" />
  }

  return (
    <View
      className="flex-1 bg-paper-50 items-center justify-center px-8"
      style={{ paddingBottom: insets.bottom, paddingTop: insets.top }}
    >
      <Text className="text-ink-900 text-4xl font-extrabold mb-3 tracking-tight">Envelope</Text>
      <Text className="text-ink-600 text-base mb-10 text-center max-w-sm">Private payments on Solana.</Text>

      <Pressable
        disabled={isBusy}
        onPress={() => void connect()}
        className={`bg-seal-600 px-8 py-4 rounded-xl active:bg-seal-700 ${isBusy ? 'opacity-50' : ''}`}
      >
        <Text className="text-paper-50 font-bold text-lg">{isBusy ? 'Connecting…' : 'Connect wallet'}</Text>
      </Pressable>
      {error ? <Text className="text-seal-600 mt-4 text-center max-w-sm">{error}</Text> : null}

      <StatusBar style="auto" />
    </View>
  )
}
