// Relayer service — pays fees for users, enforces tiers, delivers push notifications for
// incoming activity. See envelope-core-build-plan.md's Phase 12 for the spec; policy.ts carries
// the security-critical validation this endpoint exists to enforce.
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import {
  address,
  getBase64EncodedWireTransaction,
  getSignatureFromTransaction,
  getTransactionDecoder,
  partiallySignTransaction,
  type Transaction,
} from '@solana/kit'
import {
  faucetConfig,
  fuelConfig,
  tierPerks,
  mints,
  policyConfig,
  port,
  relayerAddress,
  relayerCryptoKeyPair,
  rpc,
  heliusWebhookSecret,
} from './config.ts'
import { confirmSignature } from './confirm.ts'
import { validateTransaction } from './policy.ts'
import { checkRateLimit } from './rate-limit.ts'
import { forgetCachedTier, getMembership, getTierForWallet } from './tier.ts'
import { getPushTokens, registerPushToken } from './push-store.ts'
import { claimFromFaucet, FaucetRefusal, getFaucetStatus } from './faucet.ts'
import { FuelRefusal, requestFuel, submitFuel } from './fuel.ts'
import { sendPushNotification } from './expo-push.ts'
import { giftPage } from './gift-page.ts'

// The outermost SolanaError is usually generic ("Transaction simulation failed"); the reason that
// matters to the client — e.g. "Blockhash not found", which it retries by re-asking the wallet —
// is in the cause chain. Messages only, joined: never the full error, which can carry bigints and
// program logs.
function describeFailure(err: unknown): string {
  const messages: string[] = []
  let current = err
  for (let depth = 0; depth < 5 && current instanceof Error; depth++) {
    messages.push(current.message)
    current = current.cause
  }
  return messages.length > 0 ? messages.join(': ') : String(err)
}

const app = new Hono()

app.get('/', (c) => c.json({ ok: true, relayer: relayerAddress }))

// GET /gift — the page a gift link (`/gift#<secret>`) opens; see gift-page.ts. The secret is in
// the fragment, so it never reaches this server.
const APP_DOWNLOAD_URL =
  process.env.APP_DOWNLOAD_URL ?? 'https://github.com/ETIM-PAUL/Envelope/releases/latest/download/envelope.apk'
app.get('/gift', (c) => {
  c.header('Cache-Control', 'public, max-age=300')
  c.header('Referrer-Policy', 'no-referrer')
  return c.html(giftPage(APP_DOWNLOAD_URL))
})

// GET /tier/:wallet — read-only, no auth: lets a client (the phone app) show an accurate fee line
// before building a transfer, and know whether to include the free-tier SKR fee instruction at
// all, without duplicating tier.ts's on-chain stake lookup in a second runtime. Exposes the exact
// numbers /relay's own policy check enforces (freeTierFeeAmount, mints.skr, relayerAddress) so the
// client never has to hardcode them separately and risk drifting out of sync.
app.get('/tier/:wallet', async (c) => {
  const wallet = c.req.param('wallet')
  let membership: Awaited<ReturnType<typeof getMembership>>
  try {
    // Always fresh here (not the /relay cache): the app reads this right after buying a pass.
    membership = await getMembership(rpc, address(wallet))
    forgetCachedTier(wallet)
  } catch {
    return c.json({ error: 'malformed wallet address' }, 400)
  }
  const { tier, pass } = membership
  return c.json({
    tier,
    pass,
    relayerAddress,
    skrMint: mints.skr,
    freeTierFeeAmount: policyConfig.freeTierFeeAmount.toString(),
    perks: tierPerks[tier],
    allPerks: tierPerks,
  })
})

// POST /fuel — body: { owner, tank }. Refills the wallet's gas tank with SOL (see fuel.ts): sent
// straight away for members (`sent`), or returned as a transaction for the wallet to sign
// (`quote`, Free tier: pays SKR) and hand back to POST /fuel/submit.
app.post('/fuel', async (c) => {
  if (!fuelConfig.enabled) return c.json({ error: 'fuel disabled' }, 404)
  const body = await c.req.json<{ owner?: string; tank?: string }>().catch(() => null)
  if (!body?.owner || !body.tank) return c.json({ error: 'body must be { owner: string, tank: string }' }, 400)
  const rateLimit = checkRateLimit(body.owner)
  if (!rateLimit.allowed) return c.json({ error: 'rate limit exceeded', retryAfterMs: rateLimit.retryAfterMs }, 429)
  try {
    return c.json(await requestFuel(address(body.owner), address(body.tank)))
  } catch (err) {
    if (err instanceof FuelRefusal) return c.json({ error: err.message }, 400)
    return c.json({ error: describeFailure(err) }, 502)
  }
})

// POST /fuel/submit — body: { owner, transaction } (the /fuel quote, signed by the wallet).
app.post('/fuel/submit', async (c) => {
  if (!fuelConfig.enabled) return c.json({ error: 'fuel disabled' }, 404)
  const body = await c.req.json<{ owner?: string; transaction?: string }>().catch(() => null)
  if (!body?.owner || !body.transaction) {
    return c.json({ error: 'body must be { owner: string, transaction: string }' }, 400)
  }
  let transaction: Transaction
  try {
    transaction = getTransactionDecoder().decode(Buffer.from(body.transaction, 'base64'))
  } catch {
    return c.json({ error: 'malformed transaction' }, 400)
  }
  try {
    return c.json({ signature: await submitFuel(address(body.owner), transaction) })
  } catch (err) {
    if (err instanceof FuelRefusal) return c.json({ error: err.message }, 400)
    return c.json({ error: describeFailure(err) }, 502)
  }
})

// GET /faucet/skr/:wallet — what a claim would give right now, and why not if nothing (see faucet.ts).
app.get('/faucet/skr/:wallet', async (c) => {
  if (!faucetConfig.enabled) return c.json({ error: 'faucet disabled' }, 404)
  try {
    return c.json(await getFaucetStatus(address(c.req.param('wallet'))))
  } catch {
    return c.json({ error: 'malformed wallet address' }, 400)
  }
})

// POST /faucet/skr — body: { wallet: string }. Sends that wallet whatever it's allowed right now.
app.post('/faucet/skr', async (c) => {
  if (!faucetConfig.enabled) return c.json({ error: 'faucet disabled' }, 404)
  const body = await c.req.json<{ wallet?: string }>().catch(() => null)
  let wallet: ReturnType<typeof address>
  try {
    wallet = address(body?.wallet ?? '')
  } catch {
    return c.json({ error: 'body must be { wallet: string }' }, 400)
  }
  try {
    return c.json(await claimFromFaucet(wallet))
  } catch (err) {
    if (err instanceof FaucetRefusal) return c.json({ error: err.message }, 400)
    console.error('faucet claim failed:', err)
    return c.json({ error: 'faucet transfer failed, try again shortly' }, 502)
  }
})

// POST /relay — body: { owner: string, transactions: string[] } (base64 wire transactions,
// already signed by `owner` for every signature role except the relayer's own fee-payer slot).
// Validates each against policy.ts, co-signs as fee payer, submits, and returns each signature —
// same contract the plan specifies, one call per batch of transactions from one instruction plan.
app.post('/relay', async (c) => {
  const body = await c.req.json<{ owner?: string; transactions?: string[] }>().catch(() => null)
  if (!body?.owner || !body.transactions?.length) {
    return c.json({ error: 'body must be { owner: string, transactions: string[] }' }, 400)
  }

  const rateLimit = checkRateLimit(body.owner)
  if (!rateLimit.allowed) {
    return c.json({ error: 'rate limit exceeded', retryAfterMs: rateLimit.retryAfterMs }, 429)
  }

  const tier = await getTierForWallet(rpc, body.owner as Parameters<typeof getTierForWallet>[1])

  // Validate every transaction in the batch before co-signing or submitting any of them — a
  // confidential transfer spans several transactions (proof-context creation, the transfer,
  // context close), so the free-tier fee only needs to appear once across the whole batch, not
  // once per transaction (see policy.ts's validateTransaction doc comment).
  const transactions: Transaction[] = []
  let sawFreeTierFeeInstruction = false
  let proofSetupOnly = true
  let confidentialTransfers = 0
  let freeTierFeePaid = 0n
  for (const wireBase64 of body.transactions) {
    let transaction: Transaction
    try {
      transaction = getTransactionDecoder().decode(Buffer.from(wireBase64, 'base64'))
    } catch {
      return c.json({ error: 'malformed transaction' }, 400)
    }

    const policyResult = await validateTransaction(transaction)
    if (!policyResult.ok) {
      return c.json({ error: `rejected: ${policyResult.reason}` }, 400)
    }
    if (policyResult.sawFreeTierFeeInstruction) sawFreeTierFeeInstruction = true
    if (!policyResult.proofSetupOnly) proofSetupOnly = false
    confidentialTransfers += policyResult.confidentialTransfers
    freeTierFeePaid += policyResult.freeTierFeePaid
    transactions.push(transaction)
  }

  // A batch send is one request carrying several private transfers: capped by tier, and on the
  // free tier each transfer pays its own fee.
  const perks = tierPerks[tier]
  if (confidentialTransfers > perks.maxBatchRecipients) {
    return c.json({ error: `rejected: your tier can send to ${perks.maxBatchRecipients} people at once` }, 400)
  }
  if (!perks.sendFeeWaived && freeTierFeePaid < policyConfig.freeTierFeeAmount * BigInt(confidentialTransfers)) {
    return c.json({ error: 'rejected: each private transfer needs its SKR send fee' }, 400)
  }

  // A batch of nothing but proof-context setup is exempt (see policy.ts's PolicyResult): a private
  // send's transfer batch, relayed right after it, still has to carry the fee.
  if (tier === 'free' && !sawFreeTierFeeInstruction && !proofSetupOnly) {
    return c.json(
      { error: 'rejected: free-tier transactions must include the SKR fee instruction to the relayer' },
      400,
    )
  }

  // Submitted — and CONFIRMED — one at a time, in order: a multi-transaction plan (e.g. a
  // confidential transfer's proof-context creation followed by the verify instruction that
  // references it) can have later transactions that depend on earlier ones having already landed.
  // Firing them all without waiting caused a real "Invalid account owner" failure in practice —
  // the range-proof verify transaction was submitted (and preflight-simulated) before its
  // context-account creation transaction had confirmed.
  const signatures: string[] = []
  for (const transaction of transactions) {
    const cosigned = await partiallySignTransaction([relayerCryptoKeyPair], transaction)
    const wireTransaction = getBase64EncodedWireTransaction(cosigned)
    const signature = getSignatureFromTransaction(cosigned)
    try {
      await rpc.sendTransaction(wireTransaction, { encoding: 'base64' }).send()
      await confirmSignature(signature)
    } catch (err) {
      // Logged in full server-side (SolanaError's `context` often carries bigints, which
      // JSON.stringify — and therefore c.json() — throws on) but only a plain message goes to
      // the client.
      console.error('submission failed:', err)
      return c.json({ error: `submission failed: ${describeFailure(err)}` }, 502)
    }
    signatures.push(signature)
  }

  return c.json({ signatures })
})

app.get('/status/:sig', async (c) => {
  const sig = c.req.param('sig')
  let result: Awaited<ReturnType<ReturnType<typeof rpc.getSignatureStatuses>['send']>>
  try {
    result = await rpc.getSignatureStatuses([sig as Parameters<typeof rpc.getSignatureStatuses>[0][0]]).send()
  } catch (err) {
    // A malformed signature and a transient RPC failure (e.g. the public devnet RPC's rate
    // limiting) look the same from here (both throw) but aren't the same problem — only the
    // former is the client's fault, so only that gets a 400.
    const message = err instanceof Error ? err.message : String(err)
    if (/invalid|malformed|base58/i.test(message)) {
      return c.json({ error: 'malformed signature' }, 400)
    }
    console.error('status lookup failed:', err)
    return c.json({ error: `status lookup failed: ${message}` }, 502)
  }
  const { value } = result
  const status = value[0]
  if (!status) return c.json({ status: 'unknown' })
  return c.json({
    status: status.confirmationStatus ?? 'processed',
    err: status.err,
  })
})

app.post('/push/register', async (c) => {
  const body = await c.req.json<{ wallet?: string; expoPushToken?: string }>().catch(() => null)
  if (!body?.wallet || !body.expoPushToken) {
    return c.json({ error: 'body must be { wallet: string, expoPushToken: string }' }, 400)
  }
  registerPushToken(body.wallet, body.expoPushToken)
  return c.json({ ok: true })
})

// Incoming activity -> push. Helius's enhanced webhook payload shape varies by configuration;
// this reads defensively (optional chaining throughout) and only acts on entries it can confirm
// name a wallet with registered push tokens — never throws on an unrecognized shape, since a
// malformed webhook body should be a no-op, not a crash.
app.post('/webhook/helius', async (c) => {
  if (heliusWebhookSecret) {
    const provided = c.req.header('authorization')
    if (provided !== heliusWebhookSecret) {
      return c.json({ error: 'unauthorized' }, 401)
    }
  }

  const events = await c.req.json<unknown[]>().catch(() => [])
  for (const event of events) {
    const accountData = (event as { accountData?: { account?: string }[] } | null)?.accountData ?? []
    for (const entry of accountData) {
      const wallet = entry.account
      if (!wallet) continue
      const tokens = getPushTokens(wallet)
      if (tokens.length === 0) continue
      await sendPushNotification(tokens, {
        title: 'Envelope',
        body: 'You received a private payment.',
        data: { wallet },
      }).catch(() => {
        // A push-send failure shouldn't fail the webhook response — Helius retries on non-2xx.
      })
    }
  }

  return c.json({ ok: true })
})

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`relayer listening on http://localhost:${info.port} (fee payer: ${relayerAddress})`)
})
