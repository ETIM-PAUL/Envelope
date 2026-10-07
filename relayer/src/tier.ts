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

// TS mirror of tier.rs's `tier_for_pass`: a pass grants its tier until `expiresAt`.
export function tierForPass(tier: number, expiresAt: bigint, nowSecs: bigint): Tier {
  if (nowSecs >= expiresAt) return 'free'
  return tier === 2 ? 'business' : tier === 1 ? 'member' : 'free'
}

const TIER_RANK: Record<Tier, number> = { free: 0, member: 1, business: 2 }
export function higherTier(a: Tier, b: Tier): Tier {
  return TIER_RANK[a] >= TIER_RANK[b] ? a : b
}

export type Membership = {
  tier: Tier
  pass: { tier: Tier; expiresAt: number } | null // expiresAt: unix seconds; null if never bought
}

// Reads the wallet's on-chain StakePosition, membership Pass, and the Pool singleton's thresholds:
// the tier is whichever of the two is higher — the same rule envelope_vault's `wrap` applies. A
// wallet with neither is Free.
export async function getMembership(
  rpc: Rpc<GetAccountInfoApi & GetMultipleAccountsApi>,
  owner: Address,
): Promise<Membership> {
  const [poolAddress] = await envelopeStake.findPoolPda()
  const [stakePositionAddress] = await envelopeStake.findStakePositionPda({ user: owner })
  const [passAddress] = await envelopeStake.findPassPda({ user: owner })

  const [pool, stakePosition, pass] = await Promise.all([
    envelopeStake.fetchPool(rpc, poolAddress),
    envelopeStake.fetchMaybeStakePosition(rpc, stakePositionAddress),
    envelopeStake.fetchMaybePass(rpc, passAddress),
  ])

  const stakeTier = stakePosition.exists
    ? tierForStake(
        stakePosition.data.amount,
        stakePosition.data.unlockRequestedAt,
        pool.data.memberThreshold,
        pool.data.businessThreshold,
      )
    : 'free'
  const nowSecs = BigInt(Math.floor(Date.now() / 1000))
  const passTier = pass.exists ? tierForPass(pass.data.tier, pass.data.expiresAt, nowSecs) : 'free'

  return {
    tier: higherTier(stakeTier, passTier),
    pass: pass.exists
      ? {
          tier: pass.data.tier === 2 ? 'business' : 'member',
          expiresAt: Number(pass.data.expiresAt),
        }
      : null,
  }
}

export async function getTierForWallet(
  rpc: Rpc<GetAccountInfoApi & GetMultipleAccountsApi>,
  owner: Address,
): Promise<Tier> {
  const cached = tierCache.get(owner)
  if (cached && cached.expiresAt > Date.now()) return cached.tier
  const { tier } = await getMembership(rpc, owner)
  tierCache.set(owner, { tier, expiresAt: Date.now() + TIER_CACHE_TTL_MS })
  return tier
}

// A purchase changes the tier right away; drop the cached one so the next request sees it.
export function forgetCachedTier(owner: string): void {
  tierCache.delete(owner)
}
