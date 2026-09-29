import { useRouter } from 'expo-router'
import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { AppAddressLink } from '../components/app-address-link'
import { useConfidentialKeys } from '../features/keys/use-confidential-keys'
import { useWalletSession } from '../features/wallet/use-wallet-session'
import { formatError } from '../utils/format-error'

export default function Settings() {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { account, isBusy, error, disconnect } = useWalletSession()
  const { keysUnlocked, lock } = useConfidentialKeys()
  const [lockBusy, setLockBusy] = useState(false)
  const [lockError, setLockError] = useState<string | null>(null)

  async function handleDisconnect() {
    await disconnect()
    router.replace('/')
  }

  async function handleLock() {
    if (lockBusy) return
    setLockBusy(true)
    setLockError(null)
    try {
      await lock()
    } catch (e) {
      setLockError(formatError(e))
    } finally {
      setLockBusy(false)
    }
  }

  return (
    <View className="flex-1 bg-paper-50 px-6" style={{ paddingTop: insets.top + 24 }}>
      <Text className="text-ink-900 text-2xl font-extrabold mb-8">Settings</Text>

      {account ? (
        <View className="mb-8">
          <AppAddressLink address={account.address.toString()} label="Wallet" />
        </View>
      ) : null}

      {keysUnlocked ? (
        <>
          <Pressable
            disabled={lockBusy}
            onPress={() => void handleLock()}
            className={`bg-paper-200 rounded-lg py-4 items-center active:bg-paper-200 mb-4 ${lockBusy ? 'opacity-50' : ''}`}
          >
            <Text className="text-ink-900 font-bold text-base">{lockBusy ? 'Locking…' : 'Lock private balance'}</Text>
          </Pressable>
          {lockError ? <Text className="text-seal-600 mb-4 text-center">{lockError}</Text> : null}
        </>
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
