import { useRouter } from 'expo-router'
import { useState } from 'react'
import { Text, View } from 'react-native'
import { AppAddressLink } from '../components/app-address-link'
import { BackButton } from '../components/back-button'
import { Button } from '../components/button'
import { Screen } from '../components/screen'
import { fontFamily } from '../design/tokens'
import { useConfidentialKeys } from '../features/keys/use-confidential-keys'
import { useWalletSession } from '../features/wallet/use-wallet-session'
import { formatError } from '../utils/format-error'

export default function Settings() {
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
    <Screen>
      <BackButton />
      <Text className="text-paper-500 text-2xl mb-8 mt-10" style={{ fontFamily: fontFamily.display }}>
        Settings
      </Text>

      {account ? (
        <View className="mb-8">
          <AppAddressLink address={account.address.toString()} label="Wallet" />
        </View>
      ) : null}

      {keysUnlocked ? (
        <>
          <Button label="Lock private balance" onPress={() => void handleLock()} busy={lockBusy} variant="secondary" />
          {lockError ? (
            <Text className="text-seal-500 mt-3 text-center" style={{ fontFamily: fontFamily.ui }}>
              {lockError}
            </Text>
          ) : null}
          <View className="h-4" />
        </>
      ) : null}

      <Button label="Disconnect wallet" onPress={() => void handleDisconnect()} busy={isBusy} />
      {error ? (
        <Text className="text-seal-500 mt-3 text-center" style={{ fontFamily: fontFamily.ui }}>
          {error}
        </Text>
      ) : null}
    </Screen>
  )
}
