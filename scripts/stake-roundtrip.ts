// Phase 16: verifies "Free user pays fee and hits limit; after staking 500 mock SKR, fee
// disappears and limit rises — live" on real devnet state, using the exact instruction shapes
// src/features/stake/use-stake-actions.ts builds (getStakeInstructionAsync etc.) — this script
// doesn't go through the RN app, but it's the same generated-client calls, just signed by a raw
// keypair instead of MWA. anchor/tests/envelope-stake.test.ts already covers the on-chain
// program logic itself against a local validator; this is the devnet-realism pass: real Pool,
// real Config, a tier transition visible through the relayer's own /tier endpoint.
import { address, lamports, nonDivisibleSequentialInstructionPlan, singleInstructionPlan } from '@solana/kit'
import {
  findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstructionAsync,
  getMintToInstruction,
  TOKEN_PROGRAM_ADDRESS,
} from '@solana-program/token'
import { getTransferSolInstruction } from '@solana-program/system'
import { envelopeStake } from '../anchor/src/index.ts'
import { sendInstructionPlan } from './lib/executePlan.ts'
import { loadWalletSigner, readDevnetConfig } from './lib/keys.ts'
import { createDevnetClients } from './lib/rpc.ts'

const STAKE_AMOUNT = 1_000_000_000n // 1,000 SKR — crosses devnet's MEMBER_THRESHOLD exactly

// Mirrors relayer/src/tier.ts's tierForStake exactly — used for the lifecycle assertions below so
// they're immediate and unaffected by the relayer's own ~30s /tier cache (checked separately,
// at the end, since that's a real behavior worth verifying in its own right, not something the
// stake/unstake correctness checks should have to wait out).
function tierForStake(
  stakedAmount: bigint,
  unlockRequestedAt: bigint,
  memberThreshold: bigint,
  businessThreshold: bigint,
): string {
  if (unlockRequestedAt !== 0n) return 'free'
  if (stakedAmount >= businessThreshold) return 'business'
  if (stakedAmount >= memberThreshold) return 'member'
  return 'free'
}

async function getTierOnChain(rpc: ReturnType<typeof createDevnetClients>['rpc'], wallet: ReturnType<typeof address>) {
  const [poolAddress] = await envelopeStake.findPoolPda()
  const [stakePositionAddress] = await envelopeStake.findStakePositionPda({ user: wallet })
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

async function getTierFromRelayer(wallet: string): Promise<string> {
  const response = await fetch(`http://localhost:8787/tier/${wallet}`)
  const body = (await response.json()) as { tier: string }
  return body.tier
}

async function main() {
  const clients = createDevnetClients()
  const { rpc } = clients
  const config = readDevnetConfig() as { mints?: { skr: string } }
  if (!config.mints?.skr) throw new Error('config/devnet.json has no `mints.skr`')
  const skrMint = address(config.mints.skr)

  const admin = await loadWalletSigner('admin')
  const bob = await loadWalletSigner('bob') // a wallet this script hasn't already staked with

  const bobBalance = await rpc.getBalance(bob.address).send()
  if (bobBalance.value < lamports(20_000_000n)) {
    console.log('funding bob with SOL for fees...')
    await sendInstructionPlan(
      singleInstructionPlan(
        getTransferSolInstruction({ source: admin, destination: bob.address, amount: lamports(50_000_000n) }),
      ),
      admin,
      clients,
    )
  }

  const [poolAddress] = await envelopeStake.findPoolPda()
  const pool = await envelopeStake.fetchPool(rpc, poolAddress)
  console.log(
    `pool: member >= ${pool.data.memberThreshold}, business >= ${pool.data.businessThreshold}, cooldown ${pool.data.cooldownSecs}s`,
  )

  const [stakePositionAddress] = await envelopeStake.findStakePositionPda({ user: bob.address })
  const existing = await envelopeStake.fetchMaybeStakePosition(rpc, stakePositionAddress)
  if (existing.exists && existing.data.unlockRequestedAt !== 0n) {
    throw new Error('bob already has an unstake in progress from a previous run — resolve that first')
  }

  console.log('tier before staking:', await getTierOnChain(rpc, bob.address))

  // Primes the relayer's cache with the pre-stake tier — the point of this call is to set up the
  // caching check right after staking below, not just to log a value.
  const tierFromRelayerBeforeStake = await getTierFromRelayer(bob.address)
  console.log('relayer tier before staking (caches this):', tierFromRelayerBeforeStake)

  const [bobSkr] = await findAssociatedTokenPda({
    owner: bob.address,
    mint: skrMint,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  })
  const bobSkrBalance = await rpc
    .getTokenAccountBalance(bobSkr)
    .send()
    .catch(() => null)
  const haveAmount = bobSkrBalance ? BigInt(bobSkrBalance.value.amount) : 0n
  if (haveAmount < STAKE_AMOUNT) {
    console.log(`creating bob's SKR ATA (if needed) and minting ${STAKE_AMOUNT - haveAmount} mock SKR...`)
    const createAtaInstruction = await getCreateAssociatedTokenIdempotentInstructionAsync({
      payer: admin,
      owner: bob.address,
      mint: skrMint,
    })
    const mintInstruction = getMintToInstruction(
      { mint: skrMint, token: bobSkr, mintAuthority: admin, amount: STAKE_AMOUNT - haveAmount },
      { programAddress: TOKEN_PROGRAM_ADDRESS },
    )
    await sendInstructionPlan(
      nonDivisibleSequentialInstructionPlan([createAtaInstruction, mintInstruction]),
      admin,
      clients,
    )
  }

  console.log(`staking ${STAKE_AMOUNT} SKR...`)
  const stakeInstruction = await envelopeStake.getStakeInstructionAsync({
    user: bob,
    userSkr: bobSkr,
    vaultSkr: pool.data.vaultSkr,
    amount: STAKE_AMOUNT,
  })
  await sendInstructionPlan(singleInstructionPlan(stakeInstruction), bob, clients)

  const tierAfterStake = await getTierOnChain(rpc, bob.address)
  console.log('tier after staking (on-chain, uncached):', tierAfterStake)
  if (tierAfterStake !== 'member') {
    throw new Error(`expected 'member' after staking ${STAKE_AMOUNT}, got '${tierAfterStake}'`)
  }

  console.log("checking the relayer's ~30s cache behavior...")
  const tierFromRelayerRightAfterStake = await getTierFromRelayer(bob.address)
  console.log('  relayer tier right after staking (should still be cached/stale):', tierFromRelayerRightAfterStake)
  if (tierFromRelayerRightAfterStake !== tierFromRelayerBeforeStake) {
    throw new Error(
      `expected the relayer's cache to still report '${tierFromRelayerBeforeStake}' this soon after staking, got '${tierFromRelayerRightAfterStake}' — caching isn't working as intended`,
    )
  }
  console.log('  waiting 31s for the cache to expire...')
  await new Promise((resolve) => setTimeout(resolve, 31_000))
  const tierFromRelayerAfterExpiry = await getTierFromRelayer(bob.address)
  console.log('  relayer tier after cache expiry:', tierFromRelayerAfterExpiry)
  if (tierFromRelayerAfterExpiry !== 'member') {
    throw new Error(
      `expected the relayer's cache to have refreshed to 'member' by now, got '${tierFromRelayerAfterExpiry}'`,
    )
  }

  console.log('requesting unstake...')
  const requestInstruction = await envelopeStake.getRequestUnstakeInstructionAsync({ user: bob })
  await sendInstructionPlan(singleInstructionPlan(requestInstruction), bob, clients)

  const tierAfterRequest = await getTierOnChain(rpc, bob.address)
  console.log('tier immediately after requesting unstake:', tierAfterRequest)
  if (tierAfterRequest !== 'free') {
    throw new Error(`expected 'free' immediately after request_unstake, got '${tierAfterRequest}'`)
  }

  const cooldownMs = Number(pool.data.cooldownSecs) * 1000 + 2000
  console.log(`waiting ${cooldownMs}ms for the cooldown to elapse...`)
  await new Promise((resolve) => setTimeout(resolve, cooldownMs))

  console.log('withdrawing unstaked SKR...')
  const withdrawInstruction = await envelopeStake.getWithdrawUnstakedInstructionAsync({
    user: bob,
    userSkr: bobSkr,
    vaultSkr: pool.data.vaultSkr,
  })
  await sendInstructionPlan(singleInstructionPlan(withdrawInstruction), bob, clients)

  const finalPosition = await envelopeStake.fetchStakePosition(rpc, stakePositionAddress)
  console.log(`final staked amount: ${finalPosition.data.amount} (expected 0)`)
  if (finalPosition.data.amount !== 0n) {
    throw new Error(`expected stake position to reset to 0, got ${finalPosition.data.amount}`)
  }

  const finalSkrBalance = await rpc.getTokenAccountBalance(bobSkr).send()
  console.log(`bob's SKR balance after withdrawal: ${finalSkrBalance.value.amount} (expected ${STAKE_AMOUNT})`)
  if (BigInt(finalSkrBalance.value.amount) !== STAKE_AMOUNT) {
    throw new Error(`expected bob's SKR back in full, got ${finalSkrBalance.value.amount}`)
  }

  console.log('done.')
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
