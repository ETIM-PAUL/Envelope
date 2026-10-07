// Verifies Phase 12's "done when": a malicious tx is rejected, and a well-formed, fully-signed
// tx is relayed successfully end to end (submitted, confirmed on-chain).
// Prerequisite: the relayer must be running locally first (`npm run relayer:dev`).
// Run with `npm run relayer:test-policy`.
import { readFileSync } from 'node:fs'
import {
  address,
  appendTransactionMessageInstructions,
  compileTransactionMessage,
  createNoopSigner,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  getCompiledTransactionMessageEncoder,
  getTransactionEncoder,
  partiallySignTransaction,
  pipe,
  setTransactionMessageFeePayer,
  singleInstructionPlan,
  setTransactionMessageLifetimeUsingBlockhash,
  type Transaction,
} from '@solana/kit'
import { createKeyPairFromBytes } from '@solana/keys'
import { getTransferSolInstruction } from '@solana-program/system'
import { getSetComputeUnitPriceInstruction } from '@solana-program/compute-budget'
import {
  findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstructionAsync,
  getMintToATAInstructionPlanAsync,
  getTransferInstruction,
  TOKEN_PROGRAM_ADDRESS,
} from '@solana-program/token'
import { sendInstructionPlan } from './lib/executePlan.ts'
import { loadWalletSigner, readDevnetConfig } from './lib/keys.ts'
import { createDevnetClients } from './lib/rpc.ts'

const RELAYER_ADDRESS = address('Fjqmc1BpebL3FMVZo93zXMKMuiiMxSS57r5w8PHUP8Fe')

async function relay(owner: string, wireBase64: string) {
  const response = await fetch(`${process.env.RELAYER_URL ?? 'http://localhost:8787'}/relay`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ owner, transactions: [wireBase64] }),
  })
  return { status: response.status, body: await response.json() }
}

async function main() {
  const clients = createDevnetClients()
  const { rpc } = clients
  const admin = await loadWalletSigner('admin')
  const alice = await loadWalletSigner('alice')
  const config = readDevnetConfig() as { mints?: { skr: string } }
  const skrMint = address(config.mints!.skr)

  // --- malicious: System Transfer moving lamports FROM the relayer ---
  const { value: blockhash1 } = await rpc.getLatestBlockhash().send()
  const maliciousMessage = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayer(RELAYER_ADDRESS, m),
    (m) =>
      appendTransactionMessageInstructions(
        [
          getTransferSolInstruction({
            // A noop signer — it never actually signs; the relayer's policy check must reject
            // this transaction before any real signature is ever needed.
            source: createNoopSigner(RELAYER_ADDRESS),
            destination: alice.address,
            amount: 1_000_000n,
          }),
        ],
        m,
      ),
    (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash1, m),
  )
  const maliciousCompiled = compileTransactionMessage(maliciousMessage as never)
  const maliciousMessageBytes = getCompiledTransactionMessageEncoder().encode(maliciousCompiled)
  const maliciousTransaction: Transaction = {
    messageBytes: maliciousMessageBytes as Transaction['messageBytes'],
    signatures: { [RELAYER_ADDRESS]: null },
  }
  const maliciousWire = Buffer.from(getTransactionEncoder().encode(maliciousTransaction)).toString('base64')

  console.log('--- malicious transaction (System Transfer from relayer) ---')
  console.log(await relay(alice.address, maliciousWire))

  // --- benign: ComputeBudget price + real SKR fee transfer, fully signed by alice ---
  const [aliceSkrAta] = await findAssociatedTokenPda({
    owner: alice.address,
    mint: skrMint,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  })
  const [relayerSkrAta] = await findAssociatedTokenPda({
    owner: RELAYER_ADDRESS,
    mint: skrMint,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  })

  console.log('funding alice with mock SKR (if needed)...')
  const mintPlan = await getMintToATAInstructionPlanAsync({
    payer: admin,
    owner: alice.address,
    mint: skrMint,
    mintAuthority: admin,
    amount: 10_000n,
    decimals: 6,
  })
  await sendInstructionPlan(mintPlan, admin, clients)

  console.log("creating the relayer's SKR ATA (if needed)...")
  const createRelayerAtaIx = await getCreateAssociatedTokenIdempotentInstructionAsync({
    payer: admin,
    owner: RELAYER_ADDRESS,
    mint: skrMint,
  })
  await sendInstructionPlan(singleInstructionPlan(createRelayerAtaIx), admin, clients)

  const aliceKeypairBytes = new Uint8Array(
    JSON.parse(readFileSync(new URL('../.keys/alice.json', import.meta.url), 'utf8')),
  )
  const aliceCryptoKeyPair = await createKeyPairFromBytes(aliceKeypairBytes)

  const { value: blockhash2 } = await rpc.getLatestBlockhash().send()
  const benignMessage = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayer(RELAYER_ADDRESS, m),
    (m) =>
      appendTransactionMessageInstructions(
        [
          getSetComputeUnitPriceInstruction({ microLamports: 5_000n }),
          getTransferInstruction({
            source: aliceSkrAta,
            destination: relayerSkrAta,
            authority: alice, // alice really signs this one
            amount: 1_000n,
          }),
        ],
        m,
      ),
    (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash2, m),
  )
  const benignCompiled = compileTransactionMessage(benignMessage as never)
  const benignMessageBytes = getCompiledTransactionMessageEncoder().encode(benignCompiled)
  const unsignedBenign: Transaction = {
    messageBytes: benignMessageBytes as Transaction['messageBytes'],
    signatures: { [RELAYER_ADDRESS]: null, [alice.address]: null },
  }
  // Alice signs her own part for real — only the relayer's signature slot stays empty, exactly
  // the "partially signed tx" contract POST /relay expects.
  const aliceSigned = await partiallySignTransaction([aliceCryptoKeyPair], unsignedBenign)
  const benignWire = getBase64EncodedWireTransaction(aliceSigned)

  console.log('--- benign transaction (ComputeBudget + real SKR fee, signed by alice) ---')
  console.log(await relay(alice.address, benignWire))
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
