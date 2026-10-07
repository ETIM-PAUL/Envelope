// End-to-end test of the *shipped* bridge bundle (packages/cbridge/dist/bridge.html) for cSKR, on
// devnet, with alice as the wallet: the bundle runs in Node in place of the WebView, and this
// script plays the app's side of the channel — answering signMessage/signTransactions with
// alice's key (a wallet that signs as-is), sending what the bridge returns, and relaying private
// sends through the hosted relayer. Covers: withdraw cSKR -> SKR, a pot that accepts dollars *and*
// SKR, a private cSKR contribution to it, and closing it (sweep back to the host).
//
// Needs `npm run cbridge:build`, `npm run devnet:cskr`, and alice holding private cSKR (run
// `npm run devnet:cskr-roundtrip` once). RELAYER_URL defaults to the hosted relayer.
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { join } from 'node:path'
import {
  generateKeyPairSigner,
  getTransactionDecoder,
  getTransactionEncoder,
  partiallySignTransaction,
  signBytes,
  unwrapOption,
  type Address,
} from '@solana/kit'
import { createKeyPairFromBytes } from '@solana/keys'
import { findAssociatedTokenPda, TOKEN_PROGRAM_ADDRESS } from '@solana-program/token'
import {
  fetchToken,
  findAssociatedTokenPda as findAta2022,
  TOKEN_2022_PROGRAM_ADDRESS,
} from '@solana-program/token-2022'
import { RpcChannel } from '../packages/cbridge/src/rpcChannel.ts'
import type { BridgeMethodMap } from '../packages/cbridge/src/protocol.ts'
import { readDevnetConfig } from './lib/keys.ts'
import { createDevnetClients, getDevnetRpcUrl } from './lib/rpc.ts'

const RELAYER_URL = process.env.RELAYER_URL ?? 'https://envelope-relayer.onrender.com'
const ROOT = join(import.meta.dirname, '..')

function check(label: string, ok: boolean, detail = '') {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) throw new Error(`check failed: ${label}`)
}

// The bridge makes its own RPC calls; public devnet answers bursts with 429. A local pass-through
// that retries those keeps a rate limit from looking like a bridge failure.
async function startRetryingRpcProxy(upstream: string): Promise<string> {
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = []
    for await (const chunk of req) chunks.push(chunk as Buffer)
    const body = Buffer.concat(chunks)
    for (let attempt = 0; ; attempt++) {
      const response = await fetch(upstream, { method: 'POST', headers: { 'content-type': 'application/json' }, body })
      if (response.status === 429 && attempt < 8) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** Math.min(attempt, 4)))
        continue
      }
      res.writeHead(response.status, { 'content-type': 'application/json' })
      res.end(Buffer.from(await response.arrayBuffer()))
      return
    }
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as { port: number }
  server.unref()
  return `http://127.0.0.1:${port}`
}

async function main() {
  const config = readDevnetConfig() as { mints: { usdc: string; skr: string; cusdc: string; cskr?: string } }
  if (!config.mints.cskr) throw new Error('no mints.cskr — run `npm run devnet:cskr`')
  const { cusdc, cskr, skr } = config.mints
  const { rpc } = createDevnetClients()
  const rpcUrl = await startRetryingRpcProxy(getDevnetRpcUrl())

  const aliceBytes = new Uint8Array(JSON.parse(readFileSync(join(ROOT, '.keys', 'alice.json'), 'utf8')))
  const aliceKeyPair = await createKeyPairFromBytes(aliceBytes)
  const alice = (await import('@solana/kit')).getAddressFromPublicKey
  const aliceAddress = await alice(aliceKeyPair.publicKey)

  // --- the WebView, in Node: globals the bundle expects, then the bundle itself ---
  const events = new EventTarget()
  const host = new RpcChannel((text) => {
    events.dispatchEvent(Object.assign(new Event('message'), { data: text }))
  }, 'host')
  Object.assign(globalThis, {
    window: globalThis,
    // The real WebView is a secure context (its https: baseUrl — see CBridgeHost); Kit checks.
    isSecureContext: true,
    addEventListener: events.addEventListener.bind(events),
    document: { addEventListener: () => {} },
    ReactNativeWebView: { postMessage: (text: string) => void host.receive(text) },
  })
  // The wallet: signs for whichever of its keys a request names (alice, and later dave).
  const wallets = new Map<string, CryptoKeyPair>([[aliceAddress, aliceKeyPair]])
  const keyFor = (owner: string) => {
    const keyPair = wallets.get(owner)
    if (!keyPair) throw new Error(`no key for ${owner}`)
    return keyPair
  }
  host.on('signMessage', async (params) => {
    const { address: owner, messageBase64 } = params as { address: string; messageBase64: string }
    const signature = await signBytes(keyFor(owner).privateKey, Buffer.from(messageBase64, 'base64'))
    return { signatureBase64: Buffer.from(signature).toString('base64') }
  })
  let signRequests = 0
  host.on('signTransactions', async (params) => {
    signRequests++
    const { address: owner, transactionsBase64 } = params as { address: string; transactionsBase64: string[] }
    const signed = await Promise.all(
      transactionsBase64.map(async (b64) => {
        const tx = getTransactionDecoder().decode(Buffer.from(b64, 'base64'))
        const out = await partiallySignTransaction([keyFor(owner)], tx)
        return Buffer.from(getTransactionEncoder().encode(out)).toString('base64')
      }),
    )
    return { signedTransactionsBase64: signed }
  })
  const html = readFileSync(join(ROOT, 'packages', 'cbridge', 'dist', 'bridge.html'), 'utf8')
  for (const [, script] of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) new Function(script!)()

  const call = <M extends keyof BridgeMethodMap>(method: M, params: BridgeMethodMap[M]['params']) =>
    host.call<BridgeMethodMap[M]['result']>(method, params)

  async function send(transactions: string[]) {
    for (const tx of transactions) {
      const signature = await rpc.sendTransaction(tx as never, { encoding: 'base64' }).send()
      for (let i = 0; ; i++) {
        const { value } = await rpc.getSignatureStatuses([signature]).send()
        const status = value[0]
        if (status?.err) throw new Error(`transaction failed: ${JSON.stringify(status.err)}`)
        if (status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized') break
        if (i > 60) throw new Error(`not confirmed: ${signature}`)
        await new Promise((resolve) => setTimeout(resolve, 1000))
      }
    }
  }
  async function relay(transactions: string[]) {
    if (transactions.length === 0) return
    const response = await fetch(`${RELAYER_URL}/relay`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ owner: aliceAddress, transactions }),
    })
    const body = (await response.json()) as { signatures?: string[]; error?: string }
    if (!response.ok || body.error) throw new Error(`relay: ${body.error ?? response.status}`)
  }
  const privateBalance = async (mint: string, owner: string) => {
    const { availableBalance, pendingBalance } = await call('decryptAvailable', { rpcUrl, mint, owner })
    return { available: BigInt(availableBalance), pending: BigInt(pendingBalance) }
  }
  const skrWallet = async () => {
    const [ata] = await findAssociatedTokenPda({
      owner: aliceAddress,
      mint: skr as Address,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    })
    return BigInt((await rpc.getTokenAccountBalance(ata).send()).value.amount)
  }

  console.log('bridge ping:', JSON.stringify(await call('ping', {})))
  await call('deriveKeys', { owner: aliceAddress })
  check(
    'alice can receive private SKR',
    (await call('isAccountReady', { rpcUrl, mint: cskr, owner: aliceAddress })).ready,
  )

  // 1. Withdraw 1 cSKR -> SKR (bridge picks unwrap_asset from the underlying mint).
  console.log('1. withdraw 1 cSKR to SKR')
  const before = await privateBalance(cskr, aliceAddress)
  if (before.available < 3_000_000n) throw new Error('alice needs 3+ private cSKR — run devnet:cskr-roundtrip')
  const skrBefore = await skrWallet()
  await send((await call('ensureGasTank', { rpcUrl, owner: aliceAddress })).signedTransactions)
  const withdrawPlan = await call('buildWithdrawPlan', {
    rpcUrl,
    mint: cskr,
    underlyingMint: skr,
    owner: aliceAddress,
    amount: '1000000',
  })
  await send(withdrawPlan.signedTransactions)
  await send(
    (await call('signContinuation', { rpcUrl, continuationId: withdrawPlan.continuationId })).signedTransactions,
  )
  check('SKR wallet +1', (await skrWallet()) - skrBefore === 1_000_000n)
  check('private cSKR -1', before.available - (await privateBalance(cskr, aliceAddress)).available === 1_000_000n)

  // 2. A pot that accepts dollars and SKR.
  console.log('2. create a pot accepting dollars and SKR')
  await send((await call('ensureGasTank', { rpcUrl, owner: aliceAddress })).signedTransactions)
  const potId = Date.now().toString()
  const { potOwnerAddress } = await call('derivePotKeys', { owner: aliceAddress, potId })
  const created = await call('createPot', {
    rpcUrl,
    mint: cusdc,
    extraMints: [cskr],
    host: aliceAddress,
    potOwner: potOwnerAddress,
    potId,
    name: 'E2E dual pot',
    closeTs: String(Math.floor(Date.now() / 1000) + 86_400),
  })
  await send(created.signedTransactions)
  check('pot accepts dollars', (await call('isAccountReady', { rpcUrl, mint: cusdc, owner: potOwnerAddress })).ready)
  check('pot accepts SKR', (await call('isAccountReady', { rpcUrl, mint: cskr, owner: potOwnerAddress })).ready)

  // 3. Contribute 2 cSKR privately, through the relayer (the app's send path).
  console.log('3. send 2 cSKR to the pot through the relayer')
  const tier = (await (await fetch(`${RELAYER_URL}/tier/${aliceAddress}`)).json()) as {
    tier: string
    relayerAddress: string
    skrMint: string
    freeTierFeeAmount: string
  }
  const transfer = await call('buildTransferPlan', {
    rpcUrl,
    mint: cskr,
    owner: aliceAddress,
    destinationOwner: potOwnerAddress,
    amount: '2000000',
    feePayer: tier.relayerAddress,
    feeInstruction: tier.tier === 'free' ? { skrMint: tier.skrMint, amount: tier.freeTierFeeAmount } : undefined,
  })
  await relay(transfer.signedTransactions)
  await relay((await call('signContinuation', { rpcUrl, continuationId: transfer.continuationId })).signedTransactions)
  check('pot holds 2 cSKR (pending)', (await privateBalance(cskr, potOwnerAddress)).pending === 2_000_000n)

  // 3b. Batch send: three transfers from one balance, one approval — including the same recipient
  // twice, so each transfer's proofs must chain off the balance the previous one leaves.
  console.log('3b. batch: 1 cSKR to bob, 0.5 to the pot, 0.25 to bob again — one approval')
  const bob = 'DCuGm6sfoc6tBZaU829aFb3VtAMyVksEkvekkoVd3MVG'
  // Bob's amounts are his to decrypt; what's visible is his incoming-transfer counter.
  const [bobToken] = await findAta2022({
    owner: bob as Address,
    mint: cskr as Address,
    tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
  })
  const bobCredits = async () => {
    const extensions = unwrapOption((await fetchToken(rpc, bobToken)).data.extensions) ?? []
    const account = extensions.find((e) => e.__kind === 'ConfidentialTransferAccount')
    return account?.__kind === 'ConfidentialTransferAccount' ? BigInt(account.pendingBalanceCreditCounter) : -1n
  }
  const bobCreditsBefore = await bobCredits()
  const aliceBeforeBatch = await privateBalance(cskr, aliceAddress)
  const batchTransfers = [
    { destinationOwner: bob, amount: '1000000' },
    { destinationOwner: potOwnerAddress, amount: '500000' },
    { destinationOwner: bob, amount: '250000' },
  ]
  const batch = await call('buildBatchTransferPlan', {
    rpcUrl,
    mint: cskr,
    owner: aliceAddress,
    transfers: batchTransfers,
    feePayer: tier.relayerAddress,
    feeInstruction:
      tier.tier === 'free'
        ? { skrMint: tier.skrMint, amount: String(BigInt(tier.freeTierFeeAmount) * BigInt(batchTransfers.length)) }
        : undefined,
  })
  await relay(batch.signedTransactions)
  const approvals = signRequests
  await relay((await call('signContinuation', { rpcUrl, continuationId: batch.continuationId })).signedTransactions)
  check('one wallet approval for the whole batch', signRequests - approvals === 1, `${signRequests - approvals}`)
  check('bob received 2 transfers', (await bobCredits()) - bobCreditsBefore === 2n)
  check(
    'alice private cSKR -1.75',
    aliceBeforeBatch.available - (await privateBalance(cskr, aliceAddress)).available === 1_750_000n,
  )
  check('pot +0.5 cSKR', (await privateBalance(cskr, potOwnerAddress)).pending === 2_500_000n)

  // 4. Close: apply the pot's pending SKR, then close_pot + sweep every token back to alice.
  console.log('4. close the pot')
  await send((await call('ensureGasTank', { rpcUrl, owner: aliceAddress })).signedTransactions)
  const hostBefore = await privateBalance(cskr, aliceAddress)
  await send(
    (await call('applyPendingBalance', { rpcUrl, mint: cskr, owner: potOwnerAddress, payer: aliceAddress }))
      .signedTransactions,
  )
  await send(
    (
      await call('closePot', {
        rpcUrl,
        mints: [cusdc, cskr],
        host: aliceAddress,
        potOwner: potOwnerAddress,
        potId,
      })
    ).signedTransactions,
  )
  const hostAfter = await privateBalance(cskr, aliceAddress)
  check("alice got the pot's 2.5 cSKR back", hostAfter.pending - hostBefore.pending === 2_500_000n)
  // 5. A user whose wallet never holds SOL: SKR fuel pays rent and fees throughout.
  console.log('5. zero-SOL user (dave): welcome fuel, setup, receive, withdraw, pot — no SOL in the wallet')
  const dave = await generateKeyPairSigner()
  wallets.set(dave.address, dave.keyPair)
  await call('deriveKeys', { owner: dave.address })
  const { address: daveTank } = await call('gasTankAddress', { owner: dave.address })
  const fuelResponse = await fetch(`${RELAYER_URL}/fuel`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ owner: dave.address, tank: daveTank }),
  })
  const fuel = (await fuelResponse.json()) as { status?: string; error?: string }
  check('welcome fuel sent with no approval', fuel.status === 'sent', JSON.stringify(fuel))

  await send(
    (
      await call('ensureAccountReady', {
        rpcUrl,
        mint: cusdc,
        extraMints: [cskr],
        owner: dave.address,
        payWithGasTank: true,
      })
    ).signedTransactions,
  )
  check('dave can receive dollars', (await call('isAccountReady', { rpcUrl, mint: cusdc, owner: dave.address })).ready)
  check('dave can receive SKR', (await call('isAccountReady', { rpcUrl, mint: cskr, owner: dave.address })).ready)

  const toDave = await call('buildTransferPlan', {
    rpcUrl,
    mint: cskr,
    owner: aliceAddress,
    destinationOwner: dave.address,
    amount: '1000000',
    feePayer: tier.relayerAddress,
    feeInstruction: tier.tier === 'free' ? { skrMint: tier.skrMint, amount: tier.freeTierFeeAmount } : undefined,
  })
  await relay(toDave.signedTransactions)
  await relay((await call('signContinuation', { rpcUrl, continuationId: toDave.continuationId })).signedTransactions)
  await send(
    (await call('applyPendingBalance', { rpcUrl, mint: cskr, owner: dave.address, payer: dave.address }))
      .signedTransactions,
  )
  check('dave holds 1 private cSKR', (await privateBalance(cskr, dave.address)).available === 1_000_000n)

  const daveWithdraw = await call('buildWithdrawPlan', {
    rpcUrl,
    mint: cskr,
    underlyingMint: skr,
    owner: dave.address,
    amount: '1000000',
  })
  await send(daveWithdraw.signedTransactions)
  await send(
    (await call('signContinuation', { rpcUrl, continuationId: daveWithdraw.continuationId })).signedTransactions,
  )
  const [daveSkr] = await findAssociatedTokenPda({
    owner: dave.address,
    mint: skr as Address,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  })
  check(
    'dave withdrew to SKR (account created for him)',
    BigInt((await rpc.getTokenAccountBalance(daveSkr).send()).value.amount) === 1_000_000n,
  )

  const davePotId = Date.now().toString()
  const { potOwnerAddress: davePot } = await call('derivePotKeys', { owner: dave.address, potId: davePotId })
  await send(
    (
      await call('createPot', {
        rpcUrl,
        mint: cusdc,
        extraMints: [cskr],
        host: dave.address,
        potOwner: davePot,
        potId: davePotId,
        name: 'Zero-SOL pot',
        closeTs: String(Math.floor(Date.now() / 1000) + 86_400),
      })
    ).signedTransactions,
  )
  check('dave created a pot', (await call('isAccountReady', { rpcUrl, mint: cskr, owner: davePot })).ready)
  check('dave still holds 0 SOL', (await rpc.getBalance(dave.address).send()).value === 0n)

  console.log('bridge cSKR e2e OK')
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
