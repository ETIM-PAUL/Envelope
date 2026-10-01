// Phase 17: verifies "withdraw $X -> wallet USDC +$X; private balance -$X; supply invariant
// intact" on real devnet state, using the same two-step sequence src/features/account/
// use-withdraw.ts drives (buildWithdrawPlan via the bridge, then a plain
// [Approve(vaultAuthority), Unwrap] — this script builds that second step directly, same as
// vault-roundtrip.ts's unwrap already does, since it's not bridge/WASM logic).
import { address, nonDivisibleSequentialInstructionPlan, singleInstructionPlan } from '@solana/kit'
import { findAssociatedTokenPda, TOKEN_PROGRAM_ADDRESS } from '@solana-program/token'
import {
  fetchToken,
  findAssociatedTokenPda as findAta2022,
  getApproveInstruction,
  TOKEN_2022_PROGRAM_ADDRESS,
} from '@solana-program/token-2022'
import {
  fetchConfidentialTransferBalance,
  getApplyConfidentialPendingBalanceInstructionFromToken,
  getConfidentialWithdrawInstructionPlan,
} from '@solana-program/token-2022/confidential'
import { envelopeVault } from '../anchor/src/index.ts'
import { deriveWalletConfidentialKeys } from './lib/confidentialKeys.ts'
import { sendInstructionPlan } from './lib/executePlan.ts'
import { loadWalletSigner, readDevnetConfig } from './lib/keys.ts'
import { createDevnetClients } from './lib/rpc.ts'

const DECIMALS = 6

async function unwrapAll(
  clients: ReturnType<typeof createDevnetClients>,
  alice: Awaited<ReturnType<typeof loadWalletSigner>>,
  cusdcMint: ReturnType<typeof address>,
  aliceUsdcAta: ReturnType<typeof address>,
  aliceCusdcAta: ReturnType<typeof address>,
  vaultUsdc: ReturnType<typeof address>,
  vaultAuthority: ReturnType<typeof address>,
  amount: bigint,
) {
  if (amount === 0n) return
  const approveInstruction = getApproveInstruction(
    { source: aliceCusdcAta, delegate: vaultAuthority, owner: alice, amount },
    { programAddress: TOKEN_2022_PROGRAM_ADDRESS },
  )
  const unwrapInstruction = await envelopeVault.getUnwrapInstructionAsync({
    user: alice,
    cusdcMint,
    userCusdc: aliceCusdcAta,
    vaultUsdc,
    userUsdc: aliceUsdcAta,
    amount,
  })
  await sendInstructionPlan(
    nonDivisibleSequentialInstructionPlan([approveInstruction, unwrapInstruction]),
    alice,
    clients,
  )
}

async function main() {
  const clients = createDevnetClients()
  const { rpc } = clients
  const config = readDevnetConfig() as { mints?: { usdc: string; cusdc: string } }
  if (!config.mints?.usdc || !config.mints?.cusdc) throw new Error('config/devnet.json is missing mints')
  const usdcMint = address(config.mints.usdc)
  const cusdcMint = address(config.mints.cusdc)

  const alice = await loadWalletSigner('alice')
  const aliceKeys = await deriveWalletConfidentialKeys(alice)

  const [aliceUsdcAta] = await findAssociatedTokenPda({
    owner: alice.address,
    mint: usdcMint,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  })
  const [aliceCusdcAta] = await findAta2022({
    owner: alice.address,
    mint: cusdcMint,
    tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
  })
  const [configAddress] = await envelopeVault.findConfigPda()
  const [vaultAuthority] = await envelopeVault.findVaultAuthorityPda()
  const vaultConfig = await envelopeVault.fetchConfig(rpc, configAddress)

  // Clean slate: a prior, unrelated test (Phase 16's daily-limit check) left some public cUSDC
  // sitting in alice's account (wrapped, never unwrapped) — clear it first so "public cUSDC back
  // to 0" below is a real zero, not a coincidence of leftover state from a different phase.
  const strayPublicBalance = await rpc.getTokenAccountBalance(aliceCusdcAta).send()
  const strayAmount = BigInt(strayPublicBalance.value.amount)
  if (strayAmount > 0n) {
    console.log(`clearing ${strayAmount} stray public cUSDC left over from an earlier phase's test...`)
    await unwrapAll(
      clients,
      alice,
      cusdcMint,
      aliceUsdcAta,
      aliceCusdcAta,
      vaultConfig.data.vaultUsdc,
      vaultAuthority,
      strayAmount,
    )
  }

  // Make sure there's a real, meaningful confidential balance to withdraw from, applying any
  // pending first (withdraw's proofs need the *available* balance, not pending).
  const aliceAccount = await fetchToken(rpc, aliceCusdcAta)
  const balanceBeforeApply = await fetchConfidentialTransferBalance({
    token: aliceCusdcAta,
    rpc,
    elgamalSecretKey: aliceKeys.elgamalKeypair.secret(),
    aesKey: aliceKeys.aesKey,
  })
  if (balanceBeforeApply.pendingBalance > 0n) {
    console.log(`applying ${balanceBeforeApply.pendingBalance} pending cUSDC...`)
    const applyInstruction = getApplyConfidentialPendingBalanceInstructionFromToken({
      token: aliceCusdcAta,
      tokenAccount: aliceAccount.data,
      authority: alice,
      elgamalSecretKey: aliceKeys.elgamalKeypair.secret(),
      aesKey: aliceKeys.aesKey,
    })
    await sendInstructionPlan(singleInstructionPlan(applyInstruction), alice, clients)
  }

  const balanceBeforeWithdraw = await fetchConfidentialTransferBalance({
    token: aliceCusdcAta,
    rpc,
    elgamalSecretKey: aliceKeys.elgamalKeypair.secret(),
    aesKey: aliceKeys.aesKey,
  })
  console.log('confidential available before withdraw:', balanceBeforeWithdraw.availableBalance)
  if (balanceBeforeWithdraw.availableBalance === 0n) {
    throw new Error('alice has nothing available to withdraw — fund her confidential balance first')
  }

  const WITHDRAW_AMOUNT = balanceBeforeWithdraw.availableBalance
  const usdcBeforeWithdraw = await rpc.getTokenAccountBalance(aliceUsdcAta).send()

  console.log(`step 1: confidential withdraw (${WITHDRAW_AMOUNT} -> public cUSDC)...`)
  const aliceAccountForWithdraw = await fetchToken(rpc, aliceCusdcAta)
  const withdrawPlan = await getConfidentialWithdrawInstructionPlan({
    token: aliceCusdcAta,
    mint: cusdcMint,
    tokenAccount: aliceAccountForWithdraw.data,
    authority: alice,
    amount: WITHDRAW_AMOUNT,
    decimals: DECIMALS,
    elgamalKeypair: aliceKeys.elgamalKeypair,
    aesKey: aliceKeys.aesKey,
    payer: alice,
    rpc,
  })
  await sendInstructionPlan(withdrawPlan, alice, clients)

  const publicAfterWithdraw = await rpc.getTokenAccountBalance(aliceCusdcAta).send()
  console.log(
    `  public cUSDC after confidential withdraw: ${publicAfterWithdraw.value.amount} (expected ${WITHDRAW_AMOUNT})`,
  )
  if (BigInt(publicAfterWithdraw.value.amount) !== WITHDRAW_AMOUNT) {
    throw new Error(`expected public cUSDC to be exactly ${WITHDRAW_AMOUNT}, got ${publicAfterWithdraw.value.amount}`)
  }

  console.log(`step 2: [Approve, Unwrap] (${WITHDRAW_AMOUNT} public cUSDC -> real USDC)...`)
  const approveInstruction = getApproveInstruction(
    { source: aliceCusdcAta, delegate: vaultAuthority, owner: alice, amount: WITHDRAW_AMOUNT },
    { programAddress: TOKEN_2022_PROGRAM_ADDRESS },
  )
  const unwrapInstruction = await envelopeVault.getUnwrapInstructionAsync({
    user: alice,
    cusdcMint,
    userCusdc: aliceCusdcAta,
    vaultUsdc: vaultConfig.data.vaultUsdc,
    userUsdc: aliceUsdcAta,
    amount: WITHDRAW_AMOUNT,
  })
  await sendInstructionPlan(
    nonDivisibleSequentialInstructionPlan([approveInstruction, unwrapInstruction]),
    alice,
    clients,
  )

  const usdcAfterUnwrap = await rpc.getTokenAccountBalance(aliceUsdcAta).send()
  const publicAfterUnwrap = await rpc.getTokenAccountBalance(aliceCusdcAta).send()
  const balanceAfterWithdraw = await fetchConfidentialTransferBalance({
    token: aliceCusdcAta,
    rpc,
    elgamalSecretKey: aliceKeys.elgamalKeypair.secret(),
    aesKey: aliceKeys.aesKey,
  })

  const usdcDelta = BigInt(usdcAfterUnwrap.value.amount) - BigInt(usdcBeforeWithdraw.value.amount)
  const confidentialDelta = balanceBeforeWithdraw.availableBalance - balanceAfterWithdraw.availableBalance

  console.log(`  USDC delta: +${usdcDelta} (expected +${WITHDRAW_AMOUNT})`)
  console.log(`  confidential available delta: -${confidentialDelta} (expected -${WITHDRAW_AMOUNT})`)
  console.log(`  public cUSDC after unwrap: ${publicAfterUnwrap.value.amount} (expected 0)`)

  if (usdcDelta !== WITHDRAW_AMOUNT)
    throw new Error(`USDC delta mismatch: got +${usdcDelta}, expected +${WITHDRAW_AMOUNT}`)
  if (confidentialDelta !== WITHDRAW_AMOUNT) {
    throw new Error(`confidential balance delta mismatch: got -${confidentialDelta}, expected -${WITHDRAW_AMOUNT}`)
  }
  if (publicAfterUnwrap.value.amount !== '0') {
    throw new Error(`expected public cUSDC to return to 0, got ${publicAfterUnwrap.value.amount}`)
  }

  console.log('supply invariant intact: USDC gained == confidential balance lost == public cUSDC settled back to 0.')
  console.log('done.')
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
