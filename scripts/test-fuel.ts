// Exercises the relayer's SKR fuel endpoints on devnet (RELAYER_URL, default a local relayer):
// a Free-tier paid refill, the "not needed" and tank-binding refusals, a Member's included refill
// (after buying a pass), and a tampered transaction the relayer must refuse.
import {
  address,
  appendTransactionMessageInstructions,
  compileTransaction,
  createNoopSigner,
  createTransactionMessage,
  generateKeyPairSigner,
  getBase64EncodedWireTransaction,
  getTransactionDecoder,
  partiallySignTransaction,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  singleInstructionPlan,
  type KeyPairSigner,
} from '@solana/kit'
import { createKeyPairFromBytes } from '@solana/keys'
import { getTransferSolInstruction } from '@solana-program/system'
import {
  findAssociatedTokenPda,
  getMintToATAInstructionPlanAsync,
  getTransferCheckedInstruction,
  TOKEN_PROGRAM_ADDRESS,
} from '@solana-program/token'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { envelopeStake } from '../anchor/src/index.ts'
import { sendInstructionPlan } from './lib/executePlan.ts'
import { loadWalletSigner, readDevnetConfig } from './lib/keys.ts'
import { createDevnetClients } from './lib/rpc.ts'

const RELAYER_URL = process.env.RELAYER_URL ?? 'http://localhost:8788'
const SKR = 1_000_000n

function check(label: string, ok: boolean, detail = '') {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) throw new Error(`check failed: ${label}`)
}
async function post(path: string, body: unknown) {
  const response = await fetch(`${RELAYER_URL}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: response.status, body: (await response.json()) as Record<string, string> }
}
async function keyPairOf(name: string) {
  const bytes = new Uint8Array(
    JSON.parse(readFileSync(join(import.meta.dirname, '..', '.keys', `${name}.json`), 'utf8')),
  )
  return createKeyPairFromBytes(bytes)
}

async function main() {
  const clients = createDevnetClients()
  const { rpc } = clients
  const skrMint = address((readDevnetConfig() as { mints: { skr: string } }).mints.skr)
  const [admin, alice, bob, carol] = await Promise.all(['admin', 'alice', 'bob', 'carol'].map(loadWalletSigner))
  const balance = async (a: string) => (await rpc.getBalance(address(a)).send()).value
  const giveSkr = (to: KeyPairSigner, amount: bigint) =>
    getMintToATAInstructionPlanAsync({
      payer: admin,
      owner: to.address,
      mint: skrMint,
      mintAuthority: admin,
      amount,
      decimals: 6,
    }).then((plan) => sendInstructionPlan(plan, admin, clients))

  // 1. Free tier, paid: quote -> wallet signs -> submit.
  console.log('1. Free-tier refill paid in SKR (alice — not her first refill, so no welcome fuel)')
  await giveSkr(alice, 10n * SKR)
  const aliceTank = (await generateKeyPairSigner()).address
  const quote = await post('/fuel', { owner: alice.address, tank: aliceTank })
  check('quote returned', quote.body.status === 'quote', JSON.stringify(quote.body).slice(0, 120))
  const signed = await partiallySignTransaction(
    [await keyPairOf('alice')],
    getTransactionDecoder().decode(Buffer.from(quote.body.transaction!, 'base64')),
  )
  const submitted = await post('/fuel/submit', {
    owner: alice.address,
    transaction: getBase64EncodedWireTransaction(signed),
  })
  check('submitted', submitted.status === 200 && Boolean(submitted.body.signature), JSON.stringify(submitted.body))
  check('tank holds 0.025 SOL', (await balance(aliceTank)) === 25_000_000n)

  // 2. Refusals.
  console.log('2. refusals')
  const again = await post('/fuel', { owner: alice.address, tank: aliceTank })
  check('full tank: not needed', again.body.status === 'not-needed')
  const otherTank = await post('/fuel', { owner: alice.address, tank: (await generateKeyPairSigner()).address })
  check('a different tank is refused', otherTank.status === 400, otherTank.body.error)

  // 3. Member, included: buy a pass, then the relayer sends without a wallet signature.
  console.log('3. Member refill included (bob, after buying a pass)')
  await giveSkr(bob, 100n * SKR)
  const [passConfigAddress] = await envelopeStake.findPassConfigPda()
  const passConfig = await envelopeStake.fetchPassConfig(rpc, passConfigAddress)
  const [bobSkr] = await findAssociatedTokenPda({
    owner: bob.address,
    mint: skrMint,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  })
  await sendInstructionPlan(
    singleInstructionPlan(
      await envelopeStake.getBuyPassInstructionAsync({
        user: bob,
        payer: bob,
        userSkr: bobSkr,
        treasury: passConfig.data.treasury,
        tier: 1,
        periods: 1,
      }),
    ),
    bob,
    clients,
  )
  const tier = (await (await fetch(`${RELAYER_URL}/tier/${bob.address}`)).json()) as { tier: string; pass: unknown }
  check('bob is Member by pass', tier.tier === 'member', JSON.stringify(tier.pass))
  const bobTank = (await generateKeyPairSigner()).address
  const included = await post('/fuel', { owner: bob.address, tank: bobTank })
  check('sent without a wallet signature', included.body.status === 'sent', JSON.stringify(included.body).slice(0, 120))
  check('tank holds 0.025 SOL', (await balance(bobTank)) === 25_000_000n)

  // 4. Tampering: a transaction asking for more SOL than quoted is refused.
  console.log('4. tampered transaction (carol)')
  await giveSkr(carol, 10n * SKR)
  const carolTank = (await generateKeyPairSigner()).address
  const carolQuote = await post('/fuel', { owner: carol.address, tank: carolTank })
  check('quote returned', carolQuote.body.status === 'quote')
  const relayerInfo = (await (await fetch(`${RELAYER_URL}/`)).json()) as { relayer: string }
  const relayer = createNoopSigner(address(relayerInfo.relayer))
  const [carolSkr] = await findAssociatedTokenPda({
    owner: carol.address,
    mint: skrMint,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  })
  const [relayerSkr] = await findAssociatedTokenPda({
    owner: relayer.address,
    mint: skrMint,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  })
  const { value: blockhash } = await rpc.getLatestBlockhash().send()
  const greedy = compileTransaction(
    pipe(
      createTransactionMessage({ version: 0 }),
      (m) =>
        appendTransactionMessageInstructions(
          [
            getTransferCheckedInstruction({
              source: carolSkr,
              mint: skrMint,
              destination: relayerSkr,
              authority: createNoopSigner(carol.address),
              amount: 2n * SKR,
              decimals: 6,
            }),
            getTransferSolInstruction({
              source: relayer,
              destination: carolTank,
              amount: BigInt(carolQuote.body.lamports!) * 10n,
            }),
          ],
          m,
        ),
      (m) => setTransactionMessageFeePayerSigner(relayer, m),
      (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
    ),
  )
  const greedySigned = await partiallySignTransaction([await keyPairOf('carol')], greedy)
  const refused = await post('/fuel/submit', {
    owner: carol.address,
    transaction: getBase64EncodedWireTransaction(greedySigned),
  })
  check('10x SOL refused', refused.status === 400, refused.body.error)
  check('carol tank untouched', (await balance(carolTank)) === 0n)
  console.log('fuel OK')
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
