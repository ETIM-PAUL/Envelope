// Phase 14: registers this device's push token once per connected wallet — mirrors
// AutoUnlockOnOpen's "attempt once" guard. Mounted at the app root.
import { useEffect, useRef } from 'react'
import { useAppStore } from '../../store/app-store'
import { useRegisterPushToken } from './use-register-push-token'

export function RegisterPushOnOpen() {
  const walletAddress = useAppStore((s) => s.walletAddress)
  const registerPushToken = useRegisterPushToken()
  const attempted = useRef(false)

  useEffect(() => {
    if (!walletAddress) {
      attempted.current = false
      return
    }
    if (attempted.current) return
    attempted.current = true
    void registerPushToken(walletAddress).catch((err) => {
      console.warn('push token registration failed:', err)
    })
  }, [walletAddress, registerPushToken])

  return null
}
