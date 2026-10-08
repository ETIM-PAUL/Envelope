// Verifies Phase 13's core redesign end to end: buildTransferPlan's confidential-transfer
// instruction plan built with the RELAYER as fee payer (via createNoopSigner — same pattern
// packages/cbridge/src/bridge.ts now uses) instead of the owner, batched with the free-tier SKR
// fee transaction, POSTed to the real relayer's /relay endpoint, and landed on devnet. This
// mirrors what the bridge + RN host will do once the Send screen calls it; the only thing this
// script does differently is sign alice's part with her raw keypair instead of an MWA round-trip
// (there's no phone here).
// Prerequisite: the relayer must be running locally first (`npm run relayer:dev`).
// Run with `npx tsx scripts/test-relayer-confidential-transfer.ts`.
import {
  address,
  createNoopSigner,
  createTransactionMessage,
  createTransactionPlanExecutor,
  createTransactionPlanner,
  getBase64EncodedWireTransaction,
  getTransactionDecoder,
  partiallySignTransactionMessageWithSigners,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  singleInstructionPlan,
  summarizeTransactionPlanResult,
  type InstructionPlan,
  type Rpc,
  type SolanaRpcApi,
  type Transaction,
  type TransactionSigner,
} from '@solana/kit'
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
} from '@solana-program/token-2022/confidential'
import {
  getCreateAssociatedTokenIdempotentInstructionAsync,
  getMintToATAInstructionPlanAsync as getMintToClassicATAInstructionPlanAsync,
  getTransferInstruction,
  TOKEN_PROGRAM_ADDRESS,
} from '@solana-program/token'
import { deriveWalletConfidentialKeys } from './lib/confidentialKeys.ts'
import { sendInstructionPlan } from './lib/executePlan.ts'
import { loadWalletSigner, readDevnetConfig } from './lib/keys.ts'
import { createDevnetClients } from './lib/rpc.ts'

const DECIMALS = 6
const TRANSFER_AMOUNT = 100_000n // 0.1 cUSDC, alice -> bob, relayer-sponsored
const RELAYER_URL = process.env.RELAYER_URL ?? 'http://localhost:8787'
const FREE_TIER_FEE_AMOUNT = 1_000_000n // 1 SKR; matches relayer/src/config.ts's FREE_TIER_FEE_AMOUNT default

// Mirrors packages/cbridge/src/signPlan.ts's signInstructionPlan — same "leave payer's signature
// slot empty" contract, just without the WebView-bridge plumbing around it.
async function signWithNoopPayer(
  instructionPlan: InstructionPlan,
  payer: TransactionSigner,
  rpc: Rpc<SolanaRpcApi>,
): Promise<string[]> {
  const transactionPlanner = createTransactionPlanner({
    createTransactionMessage: () =>
      pipe(createTransactionMessage({ version: 0 }), (m) => setTransactionMessageFeePayerSigner(payer, m)),
  })
  const transactionPlanExecutor = createTransactionPlanExecutor<{ transaction?: Transaction; wireTransaction: string }>(
    {
      executeTransactionMessage: async (context, message) => {
        const { value: latestBlockhash } = await rpc.getLatestBlockhash().send()
        const messageWithLifetime = setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, message)
        const transaction = await partiallySignTransactionMessageWithSigners(messageWithLifetime)
        context.transaction = transaction
        const wireTransaction = getBase64EncodedWireTransaction(transaction)
        return { transaction, wireTransaction }
      },
    },
  )
  const transactionPlan = await transactionPlanner(instructionPlan)
  const result = await transactionPlanExecutor(transactionPlan)
  const summary = summarizeTransactionPlanResult(result)
  if (!summary.successful) {
    throw new Error(
      `instruction plan signing failed: ${summary.failedTransactions.length} failed, ${summary.canceledTransactions.length} canceled`,
    )
  }
  return summary.successfulTransactions.map((tx) => tx.context.wireTransaction)
}

async function relay(owner: string, transactions: string[]) {
  const response = await fetch(`${RELAYER_URL}/relay`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ owner, transactions }),
  })
  return { status: response.status, body: (await response.json()) as { signatures?: string[]; error?: string } }
}

async function main() {
  const clients = createDevnetClients()
  const { rpc } = clients
  const config = readDevnetConfig() as { mints?: { cusdc: string; skr: string }; wallets?: { relayer: string } }
  if (!config.mints?.cusdc) throw new Error('config/devnet.json has no `mints.cusdc`')
  if (!config.mints?.skr) throw new Error('config/devnet.json has no `mints.skr`')
  if (!config.wallets?.relayer) throw new Error('config/devnet.json has no `wallets.relayer`')
  const cusdcMint = address(config.mints.cusdc)
  const skrMint = address(config.mints.skr)
  const relayerAddress = address(config.wallets.relayer)

  const admin = await loadWalletSigner('admin')
  const alice = await loadWalletSigner('alice')
  const bob = await loadWalletSigner('bob')

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

  console.log('deriving confidential keys (alice, bob)...')
  const aliceKeys = await deriveWalletConfidentialKeys(alice)
  const bobKeys = await deriveWalletConfidentialKeys(bob)

  const aliceBalance = await fetchConfidentialTransferBalance({
    token: aliceAta,
    rpc,
    elgamalSecretKey: aliceKeys.elgamalKeypair.secret(),
    aesKey: aliceKeys.aesKey,
  })
  console.log(`alice's available confidential balance: ${aliceBalance.availableBalance}`)

  if (aliceBalance.availableBalance < TRANSFER_AMOUNT) {
    console.log('topping up alice (mint + deposit + apply)...')
    const mintPlan = await getMintToATAInstructionPlanAsync({
      payer: admin,
      owner: alice.address,
      mint: cusdcMint,
      mintAuthority: admin,
      amount: TRANSFER_AMOUNT * 10n,
      decimals: DECIMALS,
    })
    await sendInstructionPlan(mintPlan, admin, clients)

    const depositIx = getConfidentialDepositInstruction({
      token: aliceAta,
      mint: cusdcMint,
      authority: alice,
      amount: TRANSFER_AMOUNT * 10n,
      decimals: DECIMALS,
    })
    await sendInstructionPlan(singleInstructionPlan(depositIx), admin, clients)

    const aliceAccountForApply = await fetchToken(rpc, aliceAta)
    const applyIx = getApplyConfidentialPendingBalanceInstructionFromToken({
      token: aliceAta,
      tokenAccount: aliceAccountForApply.data,
      authority: alice,
      elgamalSecretKey: aliceKeys.elgamalKeypair.secret(),
      aesKey: aliceKeys.aesKey,
    })
    await sendInstructionPlan(singleInstructionPlan(applyIx), admin, clients)
  }

  const [sourceAccount, destinationAccount] = await Promise.all([fetchToken(rpc, aliceAta), fetchToken(rpc, bobAta)])

  console.log('building confidential transfer plan with the relayer as fee payer (noop signer)...')
  const relayerSigner = createNoopSigner(relayerAddress)
  const plan = await getConfidentialTransferInstructionPlan({
    sourceToken: aliceAta,
    destinationToken: bobAta,
    mint: cusdcMint,
    sourceTokenAccount: sourceAccount.data,
    destinationTokenAccount: destinationAccount.data,
    authority: alice, // alice's real signer — she round-trips an MWA prompt on-device; here it's her raw keypair
    amount: TRANSFER_AMOUNT,
    sourceElgamalKeypair: aliceKeys.elgamalKeypair,
    aesKey: aliceKeys.aesKey,
    payer: relayerSigner,
    rpc,
  })

  const transferWireTransactions = await signWithNoopPayer(plan, relayerSigner, rpc)
  console.log(`built ${transferWireTransactions.length} partially-signed transfer transaction(s)`)

  console.log("setting up alice's SKR balance + the relayer's SKR ATA for the free-tier fee...")
  const [aliceSkrAta] = await findAssociatedTokenPda({
    owner: alice.address,
    mint: skrMint,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  })
  const [relayerSkrAta] = await findAssociatedTokenPda({
    owner: relayerAddress,
    mint: skrMint,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  })
  const mintSkrPlan = await getMintToClassicATAInstructionPlanAsync({
    payer: admin,
    owner: alice.address,
    mint: skrMint,
    mintAuthority: admin,
    amount: FREE_TIER_FEE_AMOUNT * 10n,
    decimals: DECIMALS,
  })
  await sendInstructionPlan(mintSkrPlan, admin, clients)
  const createRelayerSkrAtaIx = await getCreateAssociatedTokenIdempotentInstructionAsync({
    payer: admin,
    owner: relayerAddress,
    mint: skrMint,
  })
  await sendInstructionPlan(singleInstructionPlan(createRelayerSkrAtaIx), admin, clients)

  console.log('building the free-tier SKR fee transaction (relayer fee payer, alice signs the transfer)...')
  const feeIx = getTransferInstruction({
    source: aliceSkrAta,
    destination: relayerSkrAta,
    authority: alice,
    amount: FREE_TIER_FEE_AMOUNT,
  })
  const feeWireTransactions = await signWithNoopPayer(singleInstructionPlan(feeIx), relayerSigner, rpc)

  const wireTransactions = [...feeWireTransactions, ...transferWireTransactions]
  console.log(
    `batch: ${wireTransactions.length} transaction(s) total (1 fee + ${transferWireTransactions.length} transfer)`,
  )

  console.log("verifying each transaction: every non-relayer signer signed for real, relayer's slot is empty...")
  for (const [i, wire] of wireTransactions.entries()) {
    const decoded = getTransactionDecoder().decode(Buffer.from(wire, 'base64'))
    if (!(relayerAddress in decoded.signatures)) throw new Error(`tx ${i}: relayer isn't a required signer at all`)
    if (decoded.signatures[relayerAddress] !== null) {
      throw new Error(`tx ${i}: expected relayer's slot to be empty (null), got a signature`)
    }
    const otherSigners = Object.entries(decoded.signatures).filter(([addr]) => addr !== relayerAddress)
    const unsigned = otherSigners.filter(([, sig]) => !sig)
    if (unsigned.length > 0) {
      throw new Error(`tx ${i}: missing signature(s) for ${unsigned.map(([addr]) => addr).join(', ')}`)
    }
    console.log(`  tx ${i}: relayer slot empty; ${otherSigners.length} other signer(s) signed for real`)
  }

  console.log('POSTing the whole batch to /relay...')
  const { status, body } = await relay(alice.address, wireTransactions)
  console.log({ status, body })
  if (status !== 200 || !body.signatures) {
    throw new Error(`relay failed: ${JSON.stringify(body)}`)
  }

  console.log('confirming each signature landed...')
  for (const sig of body.signatures) {
    const statusResponse = await fetch(`${RELAYER_URL}/status/${sig}`)
    console.log(sig, await statusResponse.json())
  }

  const bobBalance = await fetchConfidentialTransferBalance({
    token: bobAta,
    rpc,
    elgamalSecretKey: bobKeys.elgamalKeypair.secret(),
    aesKey: bobKeys.aesKey,
  })
  console.log(`bob's pending confidential balance after the transfer: ${bobBalance.pendingBalance}`)
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
