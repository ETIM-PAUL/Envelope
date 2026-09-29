import '../global.css'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Slot } from 'expo-router'
import { AppIdentity, createSolanaDevnet, MobileWalletProvider } from '@wallet-ui/react-native-kit'
import { CBridgeHost } from '@envelope/rn-confidential'
import { DevnetBadge } from '../components/devnet-badge'
import { DEVNET_RPC_URL } from '../config/rpc'
import { AutoUnlockOnOpen } from '../features/keys/auto-unlock'
import { NetworkProvider } from '../features/network/network-provider'
import { useBridgeSigners } from '../features/wallet/bridge-signers'
import { useWalletSession } from '../features/wallet/use-wallet-session'

// Devnet-only for this build (see <DevnetBadge>, src/config/rpc.ts) — Helius's URL if configured
// (.env.example), else the public devnet RPC.
const networks = [createSolanaDevnet({ url: DEVNET_RPC_URL })]
const identity: AppIdentity = { name: 'Envelope' }
const queryClient = new QueryClient()

export default function Layout() {
  return (
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
  )
}

// Split out of Layout because it needs to be inside <MobileWalletProvider> — useWalletSession
// and useBridgeSigners both read useMobileWallet(), which only works below that provider.
function AppShell() {
  useWalletSession() // mirrors the connected account into useAppStore for every screen
  const { onSignMessage, onSignTransaction } = useBridgeSigners()

  return (
    <CBridgeHost onSignMessage={onSignMessage} onSignTransaction={onSignTransaction}>
      <AutoUnlockOnOpen />
      <Slot />
      <DevnetBadge />
    </CBridgeHost>
  )
}
