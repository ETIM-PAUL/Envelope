import '../global.css'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Slot } from 'expo-router'
import { AppIdentity, createSolanaDevnet, MobileWalletProvider } from '@wallet-ui/react-native-kit'
import { CBridgeHost } from '@envelope/rn-confidential'
import { Fraunces_500Medium, Fraunces_600SemiBold } from '@expo-google-fonts/fraunces'
import {
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  useFonts,
} from '@expo-google-fonts/manrope'
import * as Notifications from 'expo-notifications'
import * as SplashScreen from 'expo-splash-screen'
import { useEffect } from 'react'
import { View } from 'react-native'
import { DevnetBadge } from '../components/devnet-badge'
import { DEVNET_RPC_URL } from '../config/rpc'
import { RefreshBalanceOnPush } from '../features/account/refresh-on-push'
import { RegisterPushOnOpen } from '../features/account/register-push'
import { AutoUnlockOnOpen } from '../features/keys/auto-unlock'
import { NetworkProvider } from '../features/network/network-provider'
import { useBridgeSigners } from '../features/wallet/bridge-signers'
import { useWalletSession } from '../features/wallet/use-wallet-session'

SplashScreen.preventAutoHideAsync()

// The webhook push only ever says "you received a private payment", never an amount — the banner
// can show in full even while the app is foregrounded, since it's not revealing anything the lock
// screen notification itself doesn't already show.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
})

// Devnet-only for this build (see <DevnetBadge>, src/config/rpc.ts) — Helius's URL if configured
// (.env.example), else the public devnet RPC.
const networks = [createSolanaDevnet({ url: DEVNET_RPC_URL })]
const identity: AppIdentity = { name: 'Envelope' }
const queryClient = new QueryClient()

export default function Layout() {
  const [fontsLoaded] = useFonts({
    Fraunces_500Medium,
    Fraunces_600SemiBold,
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
  })

  useEffect(() => {
    if (fontsLoaded) void SplashScreen.hideAsync()
  }, [fontsLoaded])

  // The splash screen stays up (native side) until this flips true, so rendering nothing here in
  // the meantime is invisible to the user — never a blank flash of unstyled text underneath.
  if (!fontsLoaded) return null

  return (
    <View className="flex-1 bg-ink-950">
      <QueryClientProvider client={queryClient}>
        <NetworkProvider
          networks={networks}
          render={({ selectedNetwork }) => (
            <MobileWalletProvider cluster={selectedNetwork} identity={identity}>
              <AppShell />
            </MobileWalletProvider>
          )}
        />
      </QueryClientProvider>
    </View>
  )
}

// Split out of Layout because it needs to be inside <MobileWalletProvider> — useWalletSession
// and useBridgeSigners both read useMobileWallet(), which only works below that provider.
function AppShell() {
  useWalletSession() // mirrors the connected account into useAppStore for every screen
  const { onSignMessage, onSignTransactions } = useBridgeSigners()

  return (
    <CBridgeHost onSignMessage={onSignMessage} onSignTransactions={onSignTransactions}>
      <AutoUnlockOnOpen />
      <RefreshBalanceOnPush />
      <RegisterPushOnOpen />
      <Slot />
      <DevnetBadge />
    </CBridgeHost>
  )
}
