// Phase 6: devnet init + wrap/unwrap round trip for envelope_vault/envelope_stake — the "done
// when" check from the build plan ("a devnet wrap and unwrap succeed from a script"). Idempotent:
// safe to re-run — `envelope_stake`'s Pool and `envelope_vault`'s Config are only initialized if
// they don't already exist on-chain.
import {
  findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstructionAsync as getCreateClassicAtaInstructionAsync,
  TOKEN_PROGRAM_ADDRESS,
} from '@solana-program/token'
import {
  AuthorityType,
  getApproveInstruction,
  getCreateAssociatedTokenIdempotentInstructionAsync,
  getSetAuthorityInstruction,
  TOKEN_2022_PROGRAM_ADDRESS,
} from '@solana-program/token-2022'
import { getTransferSolInstruction } from '@solana-program/system'
import { address, lamports, nonDivisibleSequentialInstructionPlan, singleInstructionPlan } from '@solana/kit'
import { envelopeStake, envelopeVault } from '../anchor/src/index.ts'
import { sendInstructionPlan } from './lib/executePlan.ts'
import { loadWalletSigner, readDevnetConfig } from './lib/keys.ts'
import { createDevnetClients } from './lib/rpc.ts'

// Devnet demo parameters — not mainnet values, just enough to exercise the full flow.
const MEMBER_THRESHOLD = 1_000_000_000n // 1,000 SKR @ 6 decimals
const BUSINESS_THRESHOLD = 5_000_000_000n // 5,000 SKR
const COOLDOWN_SECS = 3n

const FREE_LIMIT = 100_000_000n // 100 USDC/day
const MEMBER_LIMIT = 10_000_000_000n // 10,000 USDC/day
const BUSINESS_LIMIT = 18_446_744_073_709_551_615n // u64::MAX
const SECONDS_PER_DAY = 86_400n

const WRAP_AMOUNT = 5_000_000n // 5 USDC
const UNWRAP_AMOUNT = 2_000_000n // 2 USDC
const MIN_ALICE_SOL = lamports(50_000_000n) // 0.05 SOL, for alice's own fees/rent

async function main() {
  const clients = createDevnetClients()
  const { rpc } = clients

  const config = readDevnetConfig() as { mints?: { usdc: string; skr: string; cusdc: string } }
  if (!config.mints) {
    throw new Error('config/devnet.json has no `mints` — run `npm run devnet:mints` first')
  }
  const usdcMint = address(config.mints.usdc)
  const skrMint = address(config.mints.skr)
  const cusdcMint = address(config.mints.cusdc)

  const admin = await loadWalletSigner('admin')
  const alice = await loadWalletSigner('alice')

  // --- envelope_stake: ensure the Pool singleton exists ---
  const [poolAddress] = await envelopeStake.findPoolPda()
  const existingPool = await envelopeStake.fetchMaybePool(rpc, poolAddress)
  if (!existingPool.exists) {
    console.log('initializing envelope_stake Pool...')
    const instruction = await envelopeStake.getInitializeInstructionAsync({
      admin,
      skrMint,
      memberThreshold: MEMBER_THRESHOLD,
      businessThreshold: BUSINESS_THRESHOLD,
      cooldownSecs: COOLDOWN_SECS,
    })
    await sendInstructionPlan(singleInstructionPlan(instruction), admin, clients)
    console.log(`  Pool: ${poolAddress}`)
  } else {
    console.log(`envelope_stake Pool already initialized: ${poolAddress}`)
  }

  // --- envelope_vault: ensure Config exists, and hand cUSDC's mint authority to VaultAuth ---
  const [configAddress] = await envelopeVault.findConfigPda()
  const [vaultAuthority] = await envelopeVault.findVaultAuthorityPda()
  const existingConfig = await envelopeVault.fetchMaybeConfig(rpc, configAddress)
  if (!existingConfig.exists) {
    console.log('initializing envelope_vault Config...')
    const initInstruction = await envelopeVault.getInitializeInstructionAsync({
      admin,
      usdcMint,
      cusdcMint,
      limits: [FREE_LIMIT, MEMBER_LIMIT, BUSINESS_LIMIT],
      secondsPerDay: SECONDS_PER_DAY,
    })
    const setAuthorityInstruction = getSetAuthorityInstruction(
      { owned: cusdcMint, owner: admin, authorityType: AuthorityType.MintTokens, newAuthority: vaultAuthority },
      { programAddress: TOKEN_2022_PROGRAM_ADDRESS },
    )
    await sendInstructionPlan(
      nonDivisibleSequentialInstructionPlan([initInstruction, setAuthorityInstruction]),
      admin,
      clients,
    )
    console.log(`  Config: ${configAddress}`)
    console.log(`  cUSDC mint authority -> VaultAuth PDA (${vaultAuthority})`)
  } else {
    console.log(`envelope_vault Config already initialized: ${configAddress}`)
  }
  const vaultConfig = await envelopeVault.fetchConfig(rpc, configAddress)
  const vaultUsdc = vaultConfig.data.vaultUsdc

  // --- Make sure alice has enough SOL to sign her own wrap/unwrap (she's the fee payer/rent payer) ---
  const aliceBalance = await rpc.getBalance(alice.address).send()
  if (aliceBalance.value < MIN_ALICE_SOL) {
    console.log(`funding alice with SOL for fees/rent (${alice.address})...`)
    const transfer = getTransferSolInstruction({ source: admin, destination: alice.address, amount: MIN_ALICE_SOL })
    await sendInstructionPlan(singleInstructionPlan(transfer), admin, clients)
  }

  const [aliceUsdcAta] = await findAssociatedTokenPda({
    owner: alice.address,
    mint: usdcMint,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  })
  const [aliceCusdcAta] = await findAssociatedTokenPda({
    owner: alice.address,
    mint: cusdcMint,
    tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
  })

  // Alice needs devnet USDC to wrap. We don't control Circle's real devnet USDC mint, so this
  // can't be scripted — claim some at https://faucet.circle.com for alice's address first.
  const aliceUsdcAccount = await rpc
    .getTokenAccountBalance(aliceUsdcAta)
    .send()
    .catch(() => null)
  const aliceUsdcBalance = aliceUsdcAccount ? BigInt(aliceUsdcAccount.value.amount) : 0n
  if (aliceUsdcBalance < WRAP_AMOUNT) {
    throw new Error(
      `alice (${alice.address}) only has ${aliceUsdcBalance} devnet USDC, needs at least ${WRAP_AMOUNT}. ` +
        `Claim devnet USDC at https://faucet.circle.com for this address, then re-run.`,
    )
  }

  console.log('creating alice USDC/cUSDC ATAs if needed...')
  const createAtas = [
    await getCreateClassicAtaInstructionAsync({ payer: alice, owner: alice.address, mint: usdcMint }),
    await getCreateAssociatedTokenIdempotentInstructionAsync({ payer: alice, owner: alice.address, mint: cusdcMint }),
  ]
  await sendInstructionPlan(nonDivisibleSequentialInstructionPlan(createAtas), alice, clients)

  console.log(`wrapping ${WRAP_AMOUNT} USDC -> cUSDC for alice...`)
  const wrapInstruction = await envelopeVault.getWrapInstructionAsync({
    user: alice,
    userUsdc: aliceUsdcAta,
    vaultUsdc,
    cusdcMint,
    userCusdc: aliceCusdcAta,
    amount: WRAP_AMOUNT,
  })
  await sendInstructionPlan(singleInstructionPlan(wrapInstruction), alice, clients)
  const cusdcAfterWrap = await rpc.getTokenAccountBalance(aliceCusdcAta).send()
  console.log(`  alice cUSDC balance: ${cusdcAfterWrap.value.amount}`)

  console.log(`unwrapping ${UNWRAP_AMOUNT} cUSDC -> USDC for alice...`)
  const approveInstruction = getApproveInstruction(
    { source: aliceCusdcAta, delegate: vaultAuthority, owner: alice, amount: UNWRAP_AMOUNT },
    { programAddress: TOKEN_2022_PROGRAM_ADDRESS },
  )
  const unwrapInstruction = await envelopeVault.getUnwrapInstructionAsync({
    user: alice,
    cusdcMint,
    userCusdc: aliceCusdcAta,
    vaultUsdc,
    userUsdc: aliceUsdcAta,
    amount: UNWRAP_AMOUNT,
  })
  await sendInstructionPlan(
    nonDivisibleSequentialInstructionPlan([approveInstruction, unwrapInstruction]),
    alice,
    clients,
  )
  const usdcAfterUnwrap = await rpc.getTokenAccountBalance(aliceUsdcAta).send()
  const cusdcAfterUnwrap = await rpc.getTokenAccountBalance(aliceCusdcAta).send()
  console.log(`  alice USDC balance: ${usdcAfterUnwrap.value.amount}`)
  console.log(`  alice cUSDC balance: ${cusdcAfterUnwrap.value.amount}`)

  console.log('devnet wrap + unwrap round trip succeeded.')
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
