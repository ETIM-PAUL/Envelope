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

// Reads the wallet's on-chain StakePosition + the Pool singleton's thresholds and computes its
// current tier. A wallet that has never staked (no StakePosition account yet) is Free.
export async function getTierForWallet(
  rpc: Rpc<GetAccountInfoApi & GetMultipleAccountsApi>,
  owner: Address,
): Promise<Tier> {
  const [poolAddress] = await envelopeStake.findPoolPda()
  const [stakePositionAddress] = await envelopeStake.findStakePositionPda({ user: owner })

  const [pool, stakePosition] = await Promise.all([
    envelopeStake.fetchPool(rpc, poolAddress),
    envelopeStake.fetchMaybeStakePosition(rpc, stakePositionAddress),
  ])

  if (!stakePosition.exists) return 'free'

  return tierForStake(
    stakePosition.data.amount,
    stakePosition.data.unlockRequestedAt,
    pool.data.memberThreshold,
    pool.data.businessThreshold,
  )
}
