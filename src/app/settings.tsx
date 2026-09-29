import { useRouter } from 'expo-router'
import { Pressable, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { AppAddressLink } from '../components/app-address-link'
import { useWalletSession } from '../features/wallet/use-wallet-session'

export default function Settings() {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { account, isBusy, error, disconnect } = useWalletSession()

  async function handleDisconnect() {
    await disconnect()
    router.replace('/')
  }

  return (
    <View className="flex-1 bg-paper-50 px-6" style={{ paddingTop: insets.top + 24 }}>
      <Text className="text-ink-900 text-2xl font-extrabold mb-8">Settings</Text>

      {account ? (
        <View className="mb-8">
          <AppAddressLink address={account.address.toString()} label="Wallet" />
        </View>
      ) : null}

      <Pressable
        disabled={isBusy}
        onPress={() => void handleDisconnect()}
        className={`bg-seal-600 rounded-lg py-4 items-center active:bg-seal-700 ${isBusy ? 'opacity-50' : ''}`}
      >
        <Text className="text-paper-50 font-bold text-base">{isBusy ? 'Working…' : 'Disconnect wallet'}</Text>
      </Pressable>
      {error ? <Text className="text-seal-600 mt-3 text-center">{error}</Text> : null}
    </View>
  )
}
