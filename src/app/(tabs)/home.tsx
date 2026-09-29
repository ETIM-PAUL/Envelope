import { Link } from 'expo-router'
import { Pressable, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { AppAddressLink } from '../../components/app-address-link'
import { useConfidentialKeys } from '../../features/keys/use-confidential-keys'
import { useAppStore } from '../../store/app-store'

export default function Home() {
  const insets = useSafeAreaInsets()
  const walletAddress = useAppStore((s) => s.walletAddress)
  const { keysUnlocked } = useConfidentialKeys()

  return (
    <View className="flex-1 bg-paper-50 px-6" style={{ paddingTop: insets.top + 24 }}>
      <View className="flex-row justify-between items-start mb-8">
        <Text className="text-ink-900 text-3xl font-extrabold">Envelope</Text>
        <Link href="/settings" asChild>
          <Pressable hitSlop={8}>
            <Text className="text-xl">⚙️</Text>
          </Pressable>
        </Link>
      </View>

      {walletAddress ? (
        <View className="mb-8">
          <AppAddressLink address={walletAddress} label="Wallet" />
        </View>
      ) : null}

      <View className="bg-paper-100 rounded-lg p-6 items-center">
        <Text className="text-ink-600 text-sm mb-1">Private balance</Text>
        <Text className="text-ink-900 text-4xl font-extrabold">— cUSDC</Text>
        <Text className="text-ink-600 text-xs mt-2">
          {keysUnlocked ? 'Decryption lands in Phase 11' : 'Enable a private balance to see it here'}
        </Text>
      </View>

      {keysUnlocked ? null : (
        <Link href="/onboarding" asChild>
          <Pressable className="bg-seal-600 rounded-lg py-4 items-center mt-6 active:bg-seal-700">
            <Text className="text-paper-50 font-bold text-base">Enable private balance</Text>
          </Pressable>
        </Link>
      )}

      <Link href="/withdraw" asChild>
        <Pressable className="mt-4 items-center">
          <Text className="text-ink-600 font-semibold text-sm">Withdraw to USDC</Text>
        </Pressable>
      </Link>
    </View>
  )
}
