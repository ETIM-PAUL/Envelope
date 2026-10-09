// End-to-end test of the *shipped* bridge bundle (packages/cbridge/dist/bridge.html) for cSKR, on
// devnet, with alice as the wallet: the bundle runs in Node in place of the WebView, and this
// script plays the app's side of the channel — answering signMessage/signTransactions with
// alice's key (a wallet that signs as-is), sending what the bridge returns, and relaying private
// sends through the hosted relayer. Covers: withdraw cSKR -> SKR, a pot that accepts dollars *and*
// SKR, a private cSKR contribution to it (with privacy negative checks: the amount appears nowhere
// on-chain in plaintext), a one-approval batch to two different recipients, closing the pot (sweep
// back to the host), a zero-SOL user, and gift links (a brand-new wallet claims a gift with only
// the link's secret; the sender takes back an unclaimed one). Prints an Explorer link for every
// transaction.
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

  // Every transaction this run lands, for the Explorer links printed at the end.
  const landed: { label: string; signature: string }[] = []
  let step = ''
  const explorer = (signature: string) => `https://explorer.solana.com/tx/${signature}?cluster=devnet`

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
      landed.push({ label: step, signature })
    }
  }
  async function relay(transactions: string[]): Promise<string[]> {
    if (transactions.length === 0) return []
    const response = await fetch(`${RELAYER_URL}/relay`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ owner: aliceAddress, transactions }),
    })
    const body = (await response.json()) as { signatures?: string[]; error?: string }
    if (!response.ok || body.error) throw new Error(`relay: ${body.error ?? response.status}`)
    for (const signature of body.signatures ?? []) landed.push({ label: `${step} (relayed)`, signature })
    return body.signatures ?? []
  }
  // Privacy negative check: the plaintext amount (the u64 a classic transfer would carry) appears
  // nowhere in the transactions' bytes, and their token-balance metadata shows `owner`'s accounts
  // at 0 before and after — a confidential balance lives only as ciphertext.
  async function amountHiddenOnChain(signatures: string[], amount: bigint, owner: string) {
    const needle = Buffer.alloc(8)
    needle.writeBigUInt64LE(amount)
    for (const signature of signatures) {
      const tx = await rpc
        .getTransaction(signature as never, {
          encoding: 'base64',
          maxSupportedTransactionVersion: 0,
          commitment: 'confirmed',
        })
        .send()
      if (!tx) throw new Error(`no transaction ${signature}`)
      if (Buffer.from(tx.transaction[0], 'base64').includes(needle)) return false
      const balances = [...(tx.meta?.preTokenBalances ?? []), ...(tx.meta?.postTokenBalances ?? [])]
      if (balances.some((b) => b.owner === owner && b.uiTokenAmount.amount !== '0')) return false
    }
    return true
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
  step = 'withdraw 1 cSKR to SKR'
  let before = await privateBalance(cskr, aliceAddress)
  if (before.available < 6_000_000n && before.pending > 0n) {
    // Earlier runs return the pot's cSKR to alice as pending; make it spendable.
    step = "apply alice's pending cSKR"
    await send((await call('ensureGasTank', { rpcUrl, owner: aliceAddress })).signedTransactions)
    await send(
      (await call('applyPendingBalance', { rpcUrl, mint: cskr, owner: aliceAddress, payer: aliceAddress }))
        .signedTransactions,
    )
    before = await privateBalance(cskr, aliceAddress)
    step = 'withdraw 1 cSKR to SKR'
  }
  if (before.available < 6_000_000n)
    throw new Error(
      `alice needs 6+ private cSKR (has ${before.available} available, ${before.pending} pending) — run devnet:cskr-roundtrip`,
    )
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
  step = 'create a pot (dollars + SKR)'
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
  step = 'contribute 2 cSKR to the pot'
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
  const contribution = [
    ...(await relay(transfer.signedTransactions)),
    ...(await relay(
      (await call('signContinuation', { rpcUrl, continuationId: transfer.continuationId })).signedTransactions,
    )),
  ]
  check(
    'pot holds 2 cSKR (pending), readable with the host-derived pot key',
    (await privateBalance(cskr, potOwnerAddress)).pending === 2_000_000n,
  )
  // Privacy negative checks: what anyone else (another guest, an indexer) can see on-chain.
  const [potCskr] = await findAta2022({
    owner: potOwnerAddress as Address,
    mint: cskr as Address,
    tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
  })
  check(
    "pot's public token balance still reads 0",
    (await rpc.getTokenAccountBalance(potCskr).send()).value.amount === '0',
  )
  check(
    'the 2 cSKR amount appears nowhere in the contribution transactions',
    await amountHiddenOnChain(contribution, 2_000_000n, potOwnerAddress),
    `${contribution.length} transactions scanned`,
  )

  // 3b. Batch send: two transfers from one balance to two different recipients, one approval —
  // the second transfer's proofs must chain off the balance the first one leaves.
  console.log('3b. batch (Free tier: 2 people): 1.1 cSKR to bob and 0.35 cSKR into the pot — one approval')
  step = 'batch: 1.1 cSKR to bob + 0.35 cSKR to the pot'
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
    { destinationOwner: bob, amount: '1100000' },
    { destinationOwner: potOwnerAddress, amount: '350000' },
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
  const batchSignatures = await relay(batch.signedTransactions)
  const approvals = signRequests
  batchSignatures.push(
    ...(await relay(
      (await call('signContinuation', { rpcUrl, continuationId: batch.continuationId })).signedTransactions,
    )),
  )
  check('one wallet approval for the whole batch', signRequests - approvals === 1, `${signRequests - approvals}`)
  check('bob received 1 transfer', (await bobCredits()) - bobCreditsBefore === 1n)
  check('pot now holds 2.35 cSKR (pending)', (await privateBalance(cskr, potOwnerAddress)).pending === 2_350_000n)
  check(
    'alice private cSKR -1.45',
    aliceBeforeBatch.available - (await privateBalance(cskr, aliceAddress)).available === 1_450_000n,
  )
  check(
    "neither recipient's amount appears in the batch transactions",
    (await amountHiddenOnChain(batchSignatures, 1_100_000n, bob)) &&
      (await amountHiddenOnChain(batchSignatures, 350_000n, potOwnerAddress)),
    `${batchSignatures.length} transactions scanned`,
  )

  // 4. Close: apply the pot's pending SKR, then close_pot + sweep every token back to alice.
  console.log('4. close the pot')
  step = 'close the pot'
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
  check("alice got the pot's 2.35 cSKR back", hostAfter.pending - hostBefore.pending === 2_350_000n)
  // 5. A user whose wallet never holds SOL: SKR fuel pays rent and fees throughout.
  console.log('5. zero-SOL user (dave): welcome fuel, setup, receive, withdraw, pot — no SOL in the wallet')
  step = 'zero-SOL user'
  const dave = await generateKeyPairSigner()
  wallets.set(dave.address, dave.keyPair)
  await call('deriveKeys', { owner: dave.address })
  // A guest can't get at a pot's decryption key: it's derived from the host's wallet signature,
  // so anyone else deriving "the same pot" gets an unrelated key and account.
  check(
    "another wallet can't derive alice's pot key",
    (await call('derivePotKeys', { owner: dave.address, potId })).potOwnerAddress !== potOwnerAddress,
  )
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

  // 6. Gift links: alice parks cSKR behind a link's secret; a brand-new wallet (no SOL, no SKR,
  // never used Envelope) claims it with nothing but that secret. Then alice takes back a second,
  // unclaimed gift.
  console.log('6. gift link: alice gifts 0.5 cSKR, a brand-new wallet claims it; alice takes back a second gift')
  step = 'gift: create, 0.5 cSKR'
  await send((await call('ensureGasTank', { rpcUrl, owner: aliceAddress })).signedTransactions)
  const gift = await call('createGift', { rpcUrl, mint: cskr, sender: aliceAddress })
  await send(gift.signedTransactions)
  const giftPlan = await call('buildTransferPlan', {
    rpcUrl,
    mint: cskr,
    owner: aliceAddress,
    destinationOwner: gift.giftOwnerAddress,
    amount: '500000',
    feePayer: tier.relayerAddress,
    feeInstruction: tier.tier === 'free' ? { skrMint: tier.skrMint, amount: tier.freeTierFeeAmount } : undefined,
  })
  const giftSends = [
    ...(await relay(giftPlan.signedTransactions)),
    ...(await relay(
      (await call('signContinuation', { rpcUrl, continuationId: giftPlan.continuationId })).signedTransactions,
    )),
  ]
  const giftCskr = (opened: { balances: { mint: string; exists: boolean; pending: string }[] }) =>
    opened.balances.find((balance) => balance.mint === cskr)!
  check(
    'the link opens the gift: 0.5 cSKR waiting',
    giftCskr(await call('openGift', { rpcUrl, mints: [cusdc, cskr], secret: gift.secret })).pending === '500000',
  )
  check(
    'the gift amount appears nowhere on-chain',
    await amountHiddenOnChain(giftSends, 500_000n, gift.giftOwnerAddress),
    `${giftSends.length} transactions scanned`,
  )

  step = 'gift: a new wallet claims it'
  const erin = await generateKeyPairSigner()
  wallets.set(erin.address, erin.keyPair)
  await call('deriveKeys', { owner: erin.address })
  const { address: erinTank } = await call('gasTankAddress', { owner: erin.address })
  const erinFuel = (await (
    await fetch(`${RELAYER_URL}/fuel`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ owner: erin.address, tank: erinTank }),
    })
  ).json()) as { status?: string }
  check('new wallet: welcome fuel', erinFuel.status === 'sent', JSON.stringify(erinFuel))
  await send(
    (
      await call('ensureAccountReady', {
        rpcUrl,
        mint: cusdc,
        extraMints: [cskr],
        owner: erin.address,
        payWithGasTank: true,
      })
    ).signedTransactions,
  )
  const claimRequests = signRequests
  await call('openGift', { rpcUrl, mints: [cusdc, cskr], secret: gift.secret })
  await send(
    (await call('applyPendingBalance', { rpcUrl, mint: cskr, owner: gift.giftOwnerAddress, payer: erin.address }))
      .signedTransactions,
  )
  const claim = await call('claimGift', { rpcUrl, mint: cskr, giftOwner: gift.giftOwnerAddress, claimer: erin.address })
  await send(claim.signedTransactions)
  await send(
    (await call('closeGift', { rpcUrl, mint: cskr, giftOwner: gift.giftOwnerAddress, claimer: erin.address }))
      .signedTransactions,
  )
  check('claimed with no wallet approval', signRequests === claimRequests, `${signRequests - claimRequests}`)
  check('the new wallet received 0.5 cSKR', (await privateBalance(cskr, erin.address)).pending === 500_000n)
  check(
    'the gift is spent: its account is closed',
    !giftCskr(await call('openGift', { rpcUrl, mints: [cusdc, cskr], secret: gift.secret })).exists,
  )
  check('the new wallet still holds 0 SOL', (await rpc.getBalance(erin.address).send()).value === 0n)

  step = 'gift: create 0.2 cSKR, then take it back'
  const unclaimed = await call('createGift', { rpcUrl, mint: cskr, sender: aliceAddress })
  await send(unclaimed.signedTransactions)
  const unclaimedPlan = await call('buildTransferPlan', {
    rpcUrl,
    mint: cskr,
    owner: aliceAddress,
    destinationOwner: unclaimed.giftOwnerAddress,
    amount: '200000',
    feePayer: tier.relayerAddress,
    feeInstruction: tier.tier === 'free' ? { skrMint: tier.skrMint, amount: tier.freeTierFeeAmount } : undefined,
  })
  await relay(unclaimedPlan.signedTransactions)
  await relay(
    (await call('signContinuation', { rpcUrl, continuationId: unclaimedPlan.continuationId })).signedTransactions,
  )
  const aliceBeforeTakeBack = await privateBalance(cskr, aliceAddress)
  await send((await call('ensureGasTank', { rpcUrl, owner: aliceAddress })).signedTransactions)
  await call('openGift', { rpcUrl, mints: [cskr], secret: unclaimed.secret })
  await send(
    (
      await call('applyPendingBalance', {
        rpcUrl,
        mint: cskr,
        owner: unclaimed.giftOwnerAddress,
        payer: aliceAddress,
      })
    ).signedTransactions,
  )
  await send(
    (
      await call('claimGift', {
        rpcUrl,
        mint: cskr,
        giftOwner: unclaimed.giftOwnerAddress,
        claimer: aliceAddress,
      })
    ).signedTransactions,
  )
  await send(
    (await call('closeGift', { rpcUrl, mint: cskr, giftOwner: unclaimed.giftOwnerAddress, claimer: aliceAddress }))
      .signedTransactions,
  )
  check(
    'alice took the unclaimed 0.2 cSKR back',
    (await privateBalance(cskr, aliceAddress)).pending - aliceBeforeTakeBack.pending === 200_000n,
  )

  console.log('\nTransactions (devnet):')
  for (const { label, signature } of landed) console.log(`  ${label}: ${explorer(signature)}`)
  console.log('bridge cSKR e2e OK')
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
