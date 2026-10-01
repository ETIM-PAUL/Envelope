// Phase 16: "Vault limit applied in wrap; app shows 'You can add $X more today'" — reads
// envelope_vault's Config.limits[tier] and the caller's UserDaily counter directly (no bridge,
// plain account reads, same precedent as the stake screen). A user who's never wrapped has no
// UserDaily account yet, which just means 0 deposited today, not an error.
import { envelopeVault } from '@project/anchor'
import { useMobileWallet } from '@wallet-ui/react-native-kit'
import { address } from '@solana/kit'
import { useQuery } from '@tanstack/react-query'
import { useAppStore, type Tier } from '../../store/app-store'

const TIER_INDEX: Record<Tier, number> = { free: 0, member: 1, business: 2 }

export function useDailyLimit(tier: Tier) {
  const { client } = useMobileWallet()
  const walletAddress = useAppStore((s) => s.walletAddress)

  return useQuery({
    queryKey: ['daily-limit', walletAddress, tier],
    enabled: Boolean(walletAddress),
    queryFn: async () => {
      const owner = address(walletAddress!)
      const [configAddress] = await envelopeVault.findConfigPda()
      const [userDailyAddress] = await envelopeVault.findUserDailyPda({ user: owner })

      const [config, userDaily] = await Promise.all([
        envelopeVault.fetchConfig(client.rpc, configAddress),
        envelopeVault.fetchMaybeUserDaily(client.rpc, userDailyAddress),
      ])

      const limit = config.data.limits[TIER_INDEX[tier]]!
      const secondsPerDay = config.data.secondsPerDay
      const currentDayIndex = BigInt(Math.floor(Date.now() / 1000)) / secondsPerDay

      // UserDaily's own `dayIndex` rolls over on-chain the next time this wallet wraps — read
      // "today's" deposited amount as 0 if the stored day has already passed, mirroring
      // handle_wrap's own reset-on-new-day logic instead of showing yesterday's number.
      const depositedToday =
        userDaily.exists && userDaily.data.dayIndex === currentDayIndex ? userDaily.data.depositedToday : 0n

      const remaining = limit > depositedToday ? limit - depositedToday : 0n
      return { limit, depositedToday, remaining }
    },
  })
}
