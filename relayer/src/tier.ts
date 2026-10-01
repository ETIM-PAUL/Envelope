// TS mirror of anchor/programs/envelope_stake/src/tier.rs's `tier_for_stake` — the plan calls for
// exactly this: "Tier helper (Rust fn + TS mirror): shared by vault program (via account read)
// and relayer (TS mirror)." Keep this in sync with the Rust version by hand; there's no shared
// crate between an Anchor program and a Node service to enforce it automatically.
import type { Address, Rpc } from '@solana/kit'
import type { GetAccountInfoApi, GetMultipleAccountsApi } from '@solana/kit'
import { envelopeStake } from '../../anchor/src/index.ts'

export type Tier = 'free' | 'member' | 'business'

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

// Phase 16: "relayer reads StakePosition (cache ~30s) -> waives fee" — every /relay and
// /tier/:wallet call was hitting the RPC fresh, on top of everything else this relayer already
// does per request. A wallet's tier only ever changes via stake/request_unstake/
// withdraw_unstaked, so a short TTL is purely a request-volume optimization, not a staleness risk
// anyone would notice (worst case: the fee waiver from a stake made seconds ago takes up to 30s
// to apply, same direction of error as the plan's own "visibly changes the product" demo, which
// waits for the on-chain transaction to confirm first anyway).
const TIER_CACHE_TTL_MS = 30_000
const tierCache = new Map<string, { tier: Tier; expiresAt: number }>()

// Reads the wallet's on-chain StakePosition + the Pool singleton's thresholds and computes its
// current tier. A wallet that has never staked (no StakePosition account yet) is Free.
export async function getTierForWallet(
  rpc: Rpc<GetAccountInfoApi & GetMultipleAccountsApi>,
  owner: Address,
): Promise<Tier> {
  const cached = tierCache.get(owner)
  if (cached && cached.expiresAt > Date.now()) return cached.tier

  const [poolAddress] = await envelopeStake.findPoolPda()
  const [stakePositionAddress] = await envelopeStake.findStakePositionPda({ user: owner })

  const [pool, stakePosition] = await Promise.all([
    envelopeStake.fetchPool(rpc, poolAddress),
    envelopeStake.fetchMaybeStakePosition(rpc, stakePositionAddress),
  ])

  const tier = stakePosition.exists
    ? tierForStake(
        stakePosition.data.amount,
        stakePosition.data.unlockRequestedAt,
        pool.data.memberThreshold,
        pool.data.businessThreshold,
      )
    : 'free'

  tierCache.set(owner, { tier, expiresAt: Date.now() + TIER_CACHE_TTL_MS })
  return tier
}
