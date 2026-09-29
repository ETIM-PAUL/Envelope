// Phase 7: lightweight cross-screen state — wallet address, the keys-unlocked flag (set by
// Phase 8's key-management flow), balances, and SKR tier. Deliberately not a wallet/keys store of
// its own: the wallet address here just mirrors `useMobileWallet()`'s `account` (see
// `useWalletSession`) so screens that only need the address don't have to consume the whole MWA
// hook, and `keysUnlocked` is a plain flag — the actual confidential keys live in the WebView
// bridge's memory (`CBridgeHost`), never here.
import { create } from 'zustand'

export type Tier = 'free' | 'member' | 'business'

export type Balances = {
  usdc: bigint | null
  cusdc: bigint | null
}

export type AppState = {
  walletAddress: string | null
  keysUnlocked: boolean
  balances: Balances
  tier: Tier
  setWalletAddress: (address: string | null) => void
  setKeysUnlocked: (unlocked: boolean) => void
  setBalances: (balances: Partial<Balances>) => void
  setTier: (tier: Tier) => void
  reset: () => void
}

const initialState = {
  walletAddress: null,
  keysUnlocked: false,
  balances: { usdc: null, cusdc: null },
  tier: 'free' as Tier,
}

export const useAppStore = create<AppState>((set) => ({
  ...initialState,
  setWalletAddress: (walletAddress) => set({ walletAddress }),
  setKeysUnlocked: (keysUnlocked) => set({ keysUnlocked }),
  setBalances: (balances) => set((state) => ({ balances: { ...state.balances, ...balances } })),
  setTier: (tier) => set({ tier }),
  reset: () => set(initialState),
}))
