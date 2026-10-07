// Phase 16: reads everything the Stake screen needs directly on-chain — current tier, staked
// amount, cooldown state, SKR balance, and the Pool's thresholds/cooldown for the perks table.
// No bridge involved: none of this touches confidential balances or secret material, same as
// envelope_vault's wrap (see use-add-to-private-balance.ts) — just plain account reads, same
// `@project/anchor` generated-client import that flow already uses successfully in this bundle.
import { envelopeStake } from '@project/anchor'
import { findAssociatedTokenPda, TOKEN_PROGRAM_ADDRESS } from '@solana-program/token'
import { useMobileWallet } from '@wallet-ui/react-native-kit'
import { address } from '@solana/kit'
import { useQuery } from '@tanstack/react-query'
import { requireMints } from '../../config/devnet-config'
import { useAppStore, type Tier } from '../../store/app-store'

export type StakeInfo = {
  tier: Tier
  stakedAmount: bigint
  unlockRequestedAt: bigint // 0 if no unstake requested
  cooldownSecs: bigint
  memberThreshold: bigint
  businessThreshold: bigint
  skrBalance: bigint
}

export function tierForStake(
  stakedAmount: bigint,
  unlockRequestedAt: bigint,
  memberThreshold: bigint,
  businessThreshold: bigint,
): Tier {
  if (unlockRequestedAt !== 0n) return 'free'
  if (stakedAmount >= businessThreshold) return 'business'
  if (stakedAmount >= memberThreshold) return 'member'
  return 'free'
}

export function useStakeInfo() {
  const { client } = useMobileWallet()
  const walletAddress = useAppStore((s) => s.walletAddress)

  const query = useQuery({
    queryKey: ['stake-info', walletAddress],
    enabled: Boolean(walletAddress),
    refetchInterval: 30_000, // matches the relayer's own tier cache TTL — no point polling faster
    queryFn: async (): Promise<StakeInfo> => {
      const owner = address(walletAddress!)
      const { skr } = requireMints()

      const [poolAddress] = await envelopeStake.findPoolPda()
      const [stakePositionAddress] = await envelopeStake.findStakePositionPda({ user: owner })
      const [skrAta] = await findAssociatedTokenPda({ owner, mint: address(skr), tokenProgram: TOKEN_PROGRAM_ADDRESS })

      const [pool, stakePosition, skrAccount] = await Promise.all([
        envelopeStake.fetchPool(client.rpc, poolAddress),
        envelopeStake.fetchMaybeStakePosition(client.rpc, stakePositionAddress),
        client.rpc
          .getTokenAccountBalance(skrAta)
          .send()
          .catch(() => null),
      ])

      const stakedAmount = stakePosition.exists ? stakePosition.data.amount : 0n
      const unlockRequestedAt = stakePosition.exists ? stakePosition.data.unlockRequestedAt : 0n
      const tier = tierForStake(stakedAmount, unlockRequestedAt, pool.data.memberThreshold, pool.data.businessThreshold)

      return {
        tier,
        stakedAmount,
        unlockRequestedAt,
        cooldownSecs: pool.data.cooldownSecs,
        memberThreshold: pool.data.memberThreshold,
        businessThreshold: pool.data.businessThreshold,
        skrBalance: skrAccount ? BigInt(skrAccount.value.amount) : 0n,
      }
    },
  })

  // Not the app's tier: that comes from the relayer (useTier), which counts membership passes
  // as well as stakes — this `tier` is the stake's alone.
  return query
}
