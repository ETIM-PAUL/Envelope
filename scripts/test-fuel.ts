// Exercises the relayer's SKR fuel endpoints on devnet (RELAYER_URL, default a local relayer):
// the one-time welcome refill, a Free-tier paid refill, the "not needed" and tank-binding
// refusals, a Member's included refill (after buying a pass), and a tampered transaction the
// relayer must refuse. Uses fresh wallets each run, so it works against any relayer ledger.
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
import { getTransferSolInstruction } from '@solana-program/system'
import {
  findAssociatedTokenPda,
  getMintToATAInstructionPlanAsync,
  getTransferCheckedInstruction,
  TOKEN_PROGRAM_ADDRESS,
} from '@solana-program/token'
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
async function main() {
  const clients = createDevnetClients()
  const { rpc } = clients
  const skrMint = address((readDevnetConfig() as { mints: { skr: string } }).mints.skr)
  const admin = await loadWalletSigner('admin')
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

  // Fresh wallets each run, so the result doesn't depend on the relayer's ledger (the hosted one
  // starts empty after every redeploy). Each first takes its one-time welcome refill and then
  // empties its tank, so the next request exercises the path under test.
  async function walletPastWelcome(label: string) {
    const owner = await generateKeyPairSigner()
    const tank = await generateKeyPairSigner()
    const welcome = await post('/fuel', { owner: owner.address, tank: tank.address })
    check(`${label}: first refill is the free welcome`, welcome.body.status === 'sent', JSON.stringify(welcome.body))
    await emptyTank(tank)
    return { owner, tank }
  }
  async function emptyTank(tank: KeyPairSigner) {
    const lamports = await balance(tank.address)
    await sendInstructionPlan(
      singleInstructionPlan(
        getTransferSolInstruction({ source: tank, destination: admin.address, amount: lamports - 5_000n }),
      ),
      tank,
      clients,
    )
  }

  // 1. Free tier, paid: quote -> wallet signs -> submit.
  console.log('1. Free-tier refill paid in SKR')
  const free = await walletPastWelcome('free wallet')
  await giveSkr(free.owner, 10n * SKR)
  const quote = await post('/fuel', { owner: free.owner.address, tank: free.tank.address })
  check('quote returned', quote.body.status === 'quote', JSON.stringify(quote.body).slice(0, 120))
  const signed = await partiallySignTransaction(
    [free.owner.keyPair],
    getTransactionDecoder().decode(Buffer.from(quote.body.transaction!, 'base64')),
  )
  const submitted = await post('/fuel/submit', {
    owner: free.owner.address,
    transaction: getBase64EncodedWireTransaction(signed),
  })
  check('submitted', submitted.status === 200 && Boolean(submitted.body.signature), JSON.stringify(submitted.body))
  check('tank holds 0.025 SOL', (await balance(free.tank.address)) === 25_000_000n)

  // 2. Refusals.
  console.log('2. refusals')
  const again = await post('/fuel', { owner: free.owner.address, tank: free.tank.address })
  check('full tank: not needed', again.body.status === 'not-needed')
  const otherTank = await post('/fuel', {
    owner: free.owner.address,
    tank: (await generateKeyPairSigner()).address,
  })
  check('a different tank is refused', otherTank.status === 400, otherTank.body.error)

  // 3. Member, included: buy a pass, then the relayer sends without a wallet signature.
  console.log('3. Member refill included (after buying a pass)')
  const member = await walletPastWelcome('member wallet')
  await giveSkr(member.owner, 100n * SKR)
  await sendInstructionPlan(
    singleInstructionPlan(
      getTransferSolInstruction({ source: admin, destination: member.owner.address, amount: 10_000_000n }),
    ),
    admin,
    clients,
  )
  const [passConfigAddress] = await envelopeStake.findPassConfigPda()
  const passConfig = await envelopeStake.fetchPassConfig(rpc, passConfigAddress)
  const [memberSkr] = await findAssociatedTokenPda({
    owner: member.owner.address,
    mint: skrMint,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  })
  await sendInstructionPlan(
    singleInstructionPlan(
      await envelopeStake.getBuyPassInstructionAsync({
        user: member.owner,
        payer: member.owner,
        userSkr: memberSkr,
        treasury: passConfig.data.treasury,
        tier: 1,
        periods: 1,
      }),
    ),
    member.owner,
    clients,
  )
  const tier = (await (await fetch(`${RELAYER_URL}/tier/${member.owner.address}`)).json()) as {
    tier: string
    pass: unknown
  }
  check('member by pass', tier.tier === 'member', JSON.stringify(tier.pass))
  const included = await post('/fuel', { owner: member.owner.address, tank: member.tank.address })
  check('sent without a wallet signature', included.body.status === 'sent', JSON.stringify(included.body).slice(0, 120))
  check('tank holds 0.025 SOL', (await balance(member.tank.address)) === 25_000_000n)

  // 4. Tampering: a transaction asking for more SOL than quoted is refused.
  console.log('4. tampered transaction')
  const greedyUser = await walletPastWelcome('tampering wallet')
  const carol = greedyUser.owner
  const carolTank = greedyUser.tank.address
  await giveSkr(carol, 10n * SKR)
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
  const greedySigned = await partiallySignTransaction([carol.keyPair], greedy)
  const refused = await post('/fuel/submit', {
    owner: carol.address,
    transaction: getBase64EncodedWireTransaction(greedySigned),
  })
  check('10x SOL refused', refused.status === 400, refused.body.error)
  check('tank untouched', (await balance(carolTank)) === 0n)
  console.log('fuel OK')
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
