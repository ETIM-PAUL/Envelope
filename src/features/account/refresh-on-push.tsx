// When a push says a private payment arrived, refresh the balance so its pending amount shows on
// Home with "Add to balance". Adding it needs a wallet signature, so that waits for the user's tap:
// the app never opens the wallet on its own. Mounted once at the app root.
import { useQueryClient } from '@tanstack/react-query'
import * as Notifications from 'expo-notifications'
import { useEffect } from 'react'
import { useAppStore } from '../../store/app-store'
import { balanceQueryKey } from './use-private-balance'

export function RefreshBalanceOnPush() {
  const walletAddress = useAppStore((s) => s.walletAddress)
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!walletAddress) return
    const subscription = Notifications.addNotificationReceivedListener(() => {
      void queryClient.invalidateQueries({ queryKey: balanceQueryKey(walletAddress) })
    })
    return () => subscription.remove()
  }, [walletAddress, queryClient])

  return null
}
