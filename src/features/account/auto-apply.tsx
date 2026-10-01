// Phase 14: "on app open and on push, if pending credits > 0 -> ApplyPendingBalance." Mounted
// once at the app root (inside <CBridgeHost>, since it needs useCBridge()) — mirrors
// AutoUnlockOnOpen's "attempt once per connected wallet" guard. Also re-runs whenever a push
// notification arrives while the app is foregrounded, since that's exactly the signal that
// something just became pending.
import { useCBridge } from '@envelope/rn-confidential'
import * as Notifications from 'expo-notifications'
import { useEffect, useRef } from 'react'
import { useAppStore } from '../../store/app-store'
import { useConfidentialKeys } from '../keys/use-confidential-keys'
import { useApplyPendingBalance } from './use-apply-pending-balance'

export function AutoApplyOnOpen() {
  const walletAddress = useAppStore((s) => s.walletAddress)
  const bridge = useCBridge()
  const { keysUnlocked } = useConfidentialKeys()
  const { applyPendingBalance } = useApplyPendingBalance()
  const attempted = useRef(false)

  useEffect(() => {
    if (!walletAddress) {
      attempted.current = false
      return
    }
    if (attempted.current || !keysUnlocked || !bridge.ready) return
    attempted.current = true
    void applyPendingBalance()
  }, [walletAddress, bridge.ready, keysUnlocked, applyPendingBalance])

  useEffect(() => {
    if (!keysUnlocked) return
    const subscription = Notifications.addNotificationReceivedListener(() => {
      void applyPendingBalance()
    })
    return () => subscription.remove()
  }, [keysUnlocked, applyPendingBalance])

  return null
}
