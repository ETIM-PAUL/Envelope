// Phase 2: CLI confidential round trip — the reference implementation the on-device WebView
// bridge (Phase 3) copies. Exercises every confidential-transfer operation end to end: configure
// alice + bob's confidential accounts, mint public cUSDC to alice, deposit + apply for alice,
// confidential transfer alice -> bob, apply + decrypt for bob, and a partial withdraw back to
// public for bob. Per-step transaction count, compute units, bytes, and wall time are written to
// docs/benchmarks.md.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { address, singleInstructionPlan } from '@solana/kit'
import {
  fetchToken,
  findAssociatedTokenPda,
  getConfidentialDepositInstruction,
  getMintToATAInstructionPlanAsync,
  TOKEN_2022_PROGRAM_ADDRESS,
} from '@solana-program/token-2022'
import {
  fetchConfidentialTransferBalance,
  getApplyConfidentialPendingBalanceInstructionFromToken,
  getConfidentialTransferInstructionPlan,
  getConfidentialWithdrawInstructionPlan,
  getCreateConfidentialTransferAccountInstructionPlan,
} from '@solana-program/token-2022/confidential'
import { deriveWalletConfidentialKeys } from './lib/confidentialKeys.ts'
import { sendInstructionPlan, type TransactionStats } from './lib/executePlan.ts'
import { loadWalletSigner, readDevnetConfig } from './lib/keys.ts'
import { createDevnetClients } from './lib/rpc.ts'

const DECIMALS = 6
const MINT_AMOUNT = 100_000_000n // 100 cUSDC, public mint to alice
const TRANSFER_AMOUNT = 30_000_000n // 30 cUSDC, alice -> bob confidentially
const WITHDRAW_AMOUNT = 10_000_000n // 10 cUSDC, bob withdraws back to public
const MAX_PENDING_BALANCE_CREDIT_COUNTER = 65_536n

type StepResult = { step: string; stats: TransactionStats[]; wallMs: number }

async function timeStep(step: string, fn: () => Promise<TransactionStats[]>): Promise<StepResult> {
  const start = performance.now()
  const stats = await fn()
  const wallMs = performance.now() - start
  console.log(`  ${step}: ${stats.length} tx, ${wallMs.toFixed(0)}ms`)
  return { step, stats, wallMs }
}

async function main() {
  const clients = createDevnetClients()
  const config = readDevnetConfig() as { mints?: { cusdc: string } }
  if (!config.mints?.cusdc) {
    throw new Error('config/devnet.json has no `mints.cusdc` — run `npm run devnet:mints` first')
  }
  const cusdcMint = address(config.mints.cusdc)

  const admin = await loadWalletSigner('admin')
  const alice = await loadWalletSigner('alice')
  const bob = await loadWalletSigner('bob')

  console.log('deriving confidential keys (alice, bob)...')
  const aliceKeys = await deriveWalletConfidentialKeys(alice)
  const bobKeys = await deriveWalletConfidentialKeys(bob)

  const [aliceAta] = await findAssociatedTokenPda({
    owner: alice.address,
    mint: cusdcMint,
    tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
  })
  const [bobAta] = await findAssociatedTokenPda({
    owner: bob.address,
    mint: cusdcMint,
    tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
  })

  const results: StepResult[] = []

  results.push(
    await timeStep('configure alice + bob confidential accounts', async () => {
      const alicePlan = await getCreateConfidentialTransferAccountInstructionPlan({
        payer: admin,
        owner: alice,
        mint: cusdcMint,
        rpc: clients.rpc,
        elgamalKeypair: aliceKeys.elgamalKeypair,
        aesKey: aliceKeys.aesKey,
        maximumPendingBalanceCreditCounter: MAX_PENDING_BALANCE_CREDIT_COUNTER,
      })
      const bobPlan = await getCreateConfidentialTransferAccountInstructionPlan({
        payer: admin,
        owner: bob,
        mint: cusdcMint,
        rpc: clients.rpc,
        elgamalKeypair: bobKeys.elgamalKeypair,
        aesKey: bobKeys.aesKey,
        maximumPendingBalanceCreditCounter: MAX_PENDING_BALANCE_CREDIT_COUNTER,
      })
      const aliceStats = await sendInstructionPlan(alicePlan, admin, clients)
      const bobStats = await sendInstructionPlan(bobPlan, admin, clients)
      return [...aliceStats, ...bobStats]
    }),
  )

  results.push(
    await timeStep('mint public cUSDC to alice', async () => {
      const plan = await getMintToATAInstructionPlanAsync({
        payer: admin,
        owner: alice.address,
        mint: cusdcMint,
        mintAuthority: admin,
        amount: MINT_AMOUNT,
        decimals: DECIMALS,
      })
      return sendInstructionPlan(plan, admin, clients)
    }),
  )

  results.push(
    await timeStep('alice: deposit public -> pending', async () => {
      const instruction = getConfidentialDepositInstruction({
        token: aliceAta,
        mint: cusdcMint,
        authority: alice,
        amount: MINT_AMOUNT,
        decimals: DECIMALS,
      })
      return sendInstructionPlan(singleInstructionPlan(instruction), admin, clients)
    }),
  )

  results.push(
    await timeStep('alice: apply pending -> available', async () => {
      const aliceAccount = await fetchToken(clients.rpc, aliceAta)
      const instruction = getApplyConfidentialPendingBalanceInstructionFromToken({
        token: aliceAta,
        tokenAccount: aliceAccount.data,
        authority: alice,
        elgamalSecretKey: aliceKeys.elgamalKeypair.secret(),
        aesKey: aliceKeys.aesKey,
      })
      return sendInstructionPlan(singleInstructionPlan(instruction), admin, clients)
    }),
  )

  results.push(
    await timeStep(`alice -> bob: confidential transfer (${TRANSFER_AMOUNT})`, async () => {
      const [aliceAccount, bobAccount] = await Promise.all([
        fetchToken(clients.rpc, aliceAta),
        fetchToken(clients.rpc, bobAta),
      ])
      const plan = await getConfidentialTransferInstructionPlan({
        sourceToken: aliceAta,
        destinationToken: bobAta,
        mint: cusdcMint,
        sourceTokenAccount: aliceAccount.data,
        destinationTokenAccount: bobAccount.data,
        authority: alice,
        amount: TRANSFER_AMOUNT,
        sourceElgamalKeypair: aliceKeys.elgamalKeypair,
        aesKey: aliceKeys.aesKey,
        payer: admin,
        rpc: clients.rpc,
      })
      return sendInstructionPlan(plan, admin, clients)
    }),
  )

  results.push(
    await timeStep('bob: apply pending -> available', async () => {
      const bobAccount = await fetchToken(clients.rpc, bobAta)
      const instruction = getApplyConfidentialPendingBalanceInstructionFromToken({
        token: bobAta,
        tokenAccount: bobAccount.data,
        authority: bob,
        elgamalSecretKey: bobKeys.elgamalKeypair.secret(),
        aesKey: bobKeys.aesKey,
      })
      return sendInstructionPlan(singleInstructionPlan(instruction), admin, clients)
    }),
  )

  console.log('bob: decrypting available balance...')
  const bobBalance = await fetchConfidentialTransferBalance({
    token: bobAta,
    rpc: clients.rpc,
    elgamalSecretKey: bobKeys.elgamalKeypair.secret(),
    aesKey: bobKeys.aesKey,
  })
  console.log(`  bob available balance: ${bobBalance.availableBalance} (raw units, ${DECIMALS} decimals)`)
  if (bobBalance.availableBalance !== TRANSFER_AMOUNT) {
    throw new Error(`expected bob's available balance to be ${TRANSFER_AMOUNT}, got ${bobBalance.availableBalance}`)
  }

  results.push(
    await timeStep(`bob: withdraw available -> public (${WITHDRAW_AMOUNT})`, async () => {
      const bobAccount = await fetchToken(clients.rpc, bobAta)
      const plan = await getConfidentialWithdrawInstructionPlan({
        token: bobAta,
        mint: cusdcMint,
        tokenAccount: bobAccount.data,
        authority: bob,
        amount: WITHDRAW_AMOUNT,
        decimals: DECIMALS,
        elgamalKeypair: bobKeys.elgamalKeypair,
        aesKey: bobKeys.aesKey,
        payer: admin,
        rpc: clients.rpc,
      })
      return sendInstructionPlan(plan, admin, clients)
    }),
  )

  writeBenchmarks(results)
}

function writeBenchmarks(results: StepResult[]) {
  const rows = results.map((r) => {
    const totalBytes = r.stats.reduce((sum, s) => sum + s.bytes, 0)
    const totalCu = r.stats.reduce((sum, s) => sum + (s.computeUnitsConsumed ?? 0), 0)
    return `| ${r.step} | ${r.stats.length} | ${totalCu.toLocaleString()} | ${totalBytes.toLocaleString()} | ${r.wallMs.toFixed(0)} |`
  })
  const totalTx = results.reduce((sum, r) => sum + r.stats.length, 0)
  const totalWallMs = results.reduce((sum, r) => sum + r.wallMs, 0)

  const doc = `# Phase 2 — CLI confidential round trip: benchmarks

Generated by \`npm run devnet:roundtrip\` (${new Date().toISOString()}).

| Step | Transactions | Compute units | Bytes | Wall time (ms) |
| --- | ---: | ---: | ---: | ---: |
${rows.join('\n')}

**Total:** ${totalTx} transactions, ${totalWallMs.toFixed(0)}ms wall time.
`

  const docsDir = join(import.meta.dirname, '..', 'docs')
  mkdirSync(docsDir, { recursive: true })
  const path = join(docsDir, 'benchmarks.md')
  writeFileSync(path, doc)
  console.log(`wrote ${path}`)
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
