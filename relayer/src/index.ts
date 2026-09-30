// Relayer service — pays fees for users, enforces tiers, delivers push notifications for
// incoming activity. See envelope-core-build-plan.md's Phase 12 for the spec; policy.ts carries
// the security-critical validation this endpoint exists to enforce.
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import {
  getBase64EncodedWireTransaction,
  getSignatureFromTransaction,
  getTransactionDecoder,
  partiallySignTransaction,
  type Transaction,
} from '@solana/kit'
import { port, relayerAddress, relayerCryptoKeyPair, rpc, heliusWebhookSecret } from './config.ts'
import { validateTransaction } from './policy.ts'
import { checkRateLimit } from './rate-limit.ts'
import { getTierForWallet } from './tier.ts'
import { getPushTokens, registerPushToken } from './push-store.ts'
import { sendPushNotification } from './expo-push.ts'

const app = new Hono()

app.get('/', (c) => c.json({ ok: true, relayer: relayerAddress }))

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

  const signatures: string[] = []
  for (const wireBase64 of body.transactions) {
    let transaction: Transaction
    try {
      transaction = getTransactionDecoder().decode(Buffer.from(wireBase64, 'base64'))
    } catch {
      return c.json({ error: 'malformed transaction' }, 400)
    }

    const policyResult = await validateTransaction(transaction, tier)
    if (!policyResult.ok) {
      return c.json({ error: `rejected: ${policyResult.reason}` }, 400)
    }

    const cosigned = await partiallySignTransaction([relayerCryptoKeyPair], transaction)
    const wireTransaction = getBase64EncodedWireTransaction(cosigned)
    try {
      await rpc.sendTransaction(wireTransaction, { encoding: 'base64' }).send()
    } catch (err) {
      // Logged in full server-side (SolanaError's `context` often carries bigints, which
      // JSON.stringify — and therefore c.json() — throws on) but only a plain message goes to
      // the client.
      console.error('submission failed:', err)
      return c.json({ error: `submission failed: ${err instanceof Error ? err.message : String(err)}` }, 502)
    }
    signatures.push(getSignatureFromTransaction(cosigned))
  }

  return c.json({ signatures })
})

app.get('/status/:sig', async (c) => {
  const sig = c.req.param('sig')
  try {
    const { value } = await rpc.getSignatureStatuses([sig as Parameters<typeof rpc.getSignatureStatuses>[0][0]]).send()
    const status = value[0]
    if (!status) return c.json({ status: 'unknown' })
    return c.json({
      status: status.confirmationStatus ?? 'processed',
      err: status.err,
    })
  } catch {
    return c.json({ error: 'malformed signature' }, 400)
  }
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
