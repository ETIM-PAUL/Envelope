// Phase 7: MWA session handling. `useMobileWallet` (from @wallet-ui/react-native-kit) already
// owns the actual authorization token — persisted and silently reauthorized across app restarts
// by its `AuthorizationStore` — so this hook doesn't reimplement that; it wraps `connect`/
// `disconnect` with the same busy/error handling every screen needs, and mirrors the connected
// address into `useAppStore` so screens that only need the address don't have to import MWA
// types.
import { useMobileWallet } from '@wallet-ui/react-native-kit'
import { useEffect, useState } from 'react'
import { clearDerivationSignature } from '../keys/secure-store'
import { useAppStore } from '../../store/app-store'
import { formatError } from '../../utils/format-error'

export function useWalletSession() {
  const { account, connect, disconnect } = useMobileWallet()
  const setWalletAddress = useAppStore((s) => s.setWalletAddress)
  const resetStore = useAppStore((s) => s.reset)
  const [error, setError] = useState<string | null>(null)
  const [isBusy, setIsBusy] = useState(false)

  useEffect(() => {
    setWalletAddress(account ? account.address.toString() : null)
  }, [account, setWalletAddress])

  async function run(action: () => Promise<unknown>) {
    if (isBusy) return
    setIsBusy(true)
    setError(null)
    try {
      await action()
    } catch (e) {
      setError(formatError(e))
    } finally {
      setIsBusy(false)
    }
  }

  return {
    account,
    isConnected: Boolean(account),
    isBusy,
    error,
    connect: () => run(connect),
    disconnect: () =>
      run(async () => {
        // Disconnecting means "done with this wallet on this device" — drop the biometric-gated
        // derivation signature along with it, not just the in-memory store. "Lock" (Phase 8's
        // key-management screen) is the softer action that keeps this around.
        if (account) {
          await clearDerivationSignature(account.address.toString())
        }
        await disconnect()
        resetStore()
      }),
  }
}
