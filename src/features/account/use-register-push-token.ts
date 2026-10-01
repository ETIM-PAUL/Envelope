// Phase 14: requests notification permission, gets an Expo push token, and registers it against
// the relayer (POST /push/register) so its Helius-webhook handler can notify this wallet on
// incoming activity. Getting a real token requires an EAS project id (Constants.expoConfig.extra
// .eas.projectId) — this build doesn't have one configured yet (no `eas init` has been run), so
// this no-ops with a console warning rather than throwing until that one-time setup happens; it's
// an account/dashboard step outside what code in this repo can do, same as registering the Helius
// webhook itself (see README's Phase 14 section).
import Constants from 'expo-constants'
import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'
import { useCallback } from 'react'
import { RELAYER_URL } from '../../config/relayer'

export function useRegisterPushToken() {
  return useCallback(async (wallet: string): Promise<void> => {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId
    if (!projectId) {
      console.warn('push notifications: no EAS project id configured — run `eas init` to enable them')
      return
    }

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.DEFAULT,
      })
    }

    const { status } = await Notifications.requestPermissionsAsync()
    if (status !== 'granted') return

    const { data: expoPushToken } = await Notifications.getExpoPushTokenAsync({ projectId })

    await fetch(`${RELAYER_URL}/push/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ wallet, expoPushToken }),
    })
  }, [])
}
