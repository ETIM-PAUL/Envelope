// Wallet address -> registered Expo push tokens. In-memory, same caveat as rate-limit.ts: a real
// deployment needs this to survive restarts and work across processes; this is enough for a
// single-process devnet relayer and keeps Phase 12 from needing a database it doesn't otherwise
// require.
const tokensByWallet = new Map<string, Set<string>>()

export function registerPushToken(wallet: string, expoPushToken: string): void {
  const existing = tokensByWallet.get(wallet) ?? new Set<string>()
  existing.add(expoPushToken)
  tokensByWallet.set(wallet, existing)
}

export function getPushTokens(wallet: string): string[] {
  return [...(tokensByWallet.get(wallet) ?? [])]
}
