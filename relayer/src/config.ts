// Loads env vars, the relayer's own fee-payer keypair, devnet.json (program/mint addresses), and
// every policy constant `policy.ts` enforces — collected here so the security-critical numbers
// live in one obvious place, not scattered through the validation logic.
import 'dotenv/config'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  address,
  createKeyPairSignerFromBytes,
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  type Address,
  type KeyPairSigner,
} from '@solana/kit'
import { createKeyPairFromBytes } from '@solana/keys'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

function getDevnetRpcUrl(): string {
  return process.env.HELIUS_DEVNET_RPC_URL || 'https://api.devnet.solana.com'
}

type DevnetConfig = {
  programs?: { envelope_stake: string; envelope_vault: string }
  mints?: { usdc: string; skr: string; cusdc: string }
}

function readDevnetConfig(): DevnetConfig {
  return JSON.parse(readFileSync(join(ROOT, 'config', 'devnet.json'), 'utf8')) as DevnetConfig
}

async function loadRelayerKeypairBytes(): Promise<Uint8Array> {
  // Hosted deployments pass the keypair itself as a secret (the same JSON byte array as the file),
  // so no key file ever has to exist on the server.
  if (process.env.RELAYER_KEYPAIR) return new Uint8Array(JSON.parse(process.env.RELAYER_KEYPAIR))
  const path = process.env.RELAYER_KEYPAIR_PATH ?? '../.keys/relayer.json'
  // Relative to the relayer package directory (ROOT/relayer), matching .env.example's own
  // comment and how `RELAYER_KEYPAIR_PATH` reads as a path from someone running `npm run dev`
  // inside relayer/ — regardless of what cwd this process actually started from (`npm run dev -w
  // relayer` runs from the repo root).
  const resolved = path.startsWith('/') ? path : join(ROOT, 'relayer', path)
  return new Uint8Array(JSON.parse(readFileSync(resolved, 'utf8')))
}

const devnetConfig = readDevnetConfig()
if (!devnetConfig.programs) {
  throw new Error('config/devnet.json has no `programs` — run `npm run devnet:vault-roundtrip` first')
}
if (!devnetConfig.mints) {
  throw new Error('config/devnet.json has no `mints` — run `npm run devnet:mints` first')
}

const relayerKeypairBytes = await loadRelayerKeypairBytes()

export const rpcUrl = getDevnetRpcUrl()
export const rpc = createSolanaRpc(rpcUrl)
export const rpcSubscriptions = createSolanaRpcSubscriptions(rpcUrl.replace(/^http/, 'ws'))

// One signer (for submitting/co-signing transactions) and one raw CryptoKeyPair (for
// `partiallySignTransaction`, which needs the low-level key, not a Signer wrapper).
export const relayerSigner: KeyPairSigner = await createKeyPairSignerFromBytes(relayerKeypairBytes)
export const relayerCryptoKeyPair: CryptoKeyPair = await createKeyPairFromBytes(relayerKeypairBytes)
export const relayerAddress: Address = relayerSigner.address

export const programs = {
  envelopeStake: address(devnetConfig.programs.envelope_stake),
  envelopeVault: address(devnetConfig.programs.envelope_vault),
}
export const mints = {
  usdc: address(devnetConfig.mints.usdc),
  skr: address(devnetConfig.mints.skr),
  cusdc: address(devnetConfig.mints.cusdc),
}

// Devnet SKR faucet (faucet.ts). Base units, 6 decimals. Never enable against a real SKR mint:
// it hands the relayer's own SKR to anyone who asks, within these limits.
export const faucetConfig = {
  enabled: (process.env.SKR_FAUCET_ENABLED ?? 'true') === 'true',
  dailyLimit: BigInt(process.env.SKR_FAUCET_DAILY_LIMIT ?? '500000000'), // 500 SKR per wallet per 24h
  maxHeld: BigInt(process.env.SKR_FAUCET_MAX_HELD ?? '6000000000'), // never past 6,000 SKR held (incl. staked)
}

// SKR fuel (fuel.ts): the relayer refills a wallet's gas tank — the device-derived account that
// pays rent and network fees — so the wallet itself never needs SOL. Members get refills
// included; Free pays `priceSkr` per refill. Bounded either way: a refill only happens when the
// tank is below `refillBelowLamports`, tops it up to `topUpToLamports`, and at most
// `maxRefillsPerDay` times per wallet.
export const fuelConfig = {
  enabled: (process.env.FUEL_ENABLED ?? 'true') === 'true',
  refillBelowLamports: BigInt(process.env.FUEL_REFILL_BELOW_LAMPORTS ?? '10000000'), // 0.01 SOL
  topUpToLamports: BigInt(process.env.FUEL_TOP_UP_TO_LAMPORTS ?? '25000000'), // 0.025 SOL
  priceSkr: BigInt(process.env.FUEL_PRICE_SKR ?? '2000000'), // 2 SKR (6 decimals), Free tier
  maxRefillsPerDay: Number(process.env.FUEL_MAX_REFILLS_PER_DAY ?? 3),
}

export const policyConfig = {
  // Priority fees are capped, not fixed — this bounds how much of the relayer's own SOL a single
  // relayed transaction can spend on prioritization, regardless of what the client requests.
  // Must sit above what wallets inject on their own while signing (Solflare: 100,000) or every
  // relayed transaction signed there is rejected. Worst case at 200,000 × 1.4M CU = 0.00028 SOL.
  maxComputeUnitPriceMicroLamports: BigInt(process.env.MAX_COMPUTE_UNIT_PRICE_MICROLAMPORTS ?? '200000'),
  // Free-tier wallets must pay a small SKR fee to the relayer per relayed transaction (Members/
  // Business are exempt — see tier.ts). A devnet placeholder, not a tuned economic parameter.
  freeTierFeeAmount: BigInt(process.env.FREE_TIER_FEE_AMOUNT ?? '1000'),
  // Requests per wallet per window, sliding.
  rateLimitWindowMs: Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000),
  rateLimitMaxRequests: Number(process.env.RATE_LIMIT_MAX_REQUESTS ?? 10),
}

// What each tier gets beyond the vault's on-chain daily limits. The relayer enforces
// maxBatchRecipients and sendFeeWaived itself; the app enforces the pot rules (they aren't
// on-chain) and shows all of it on the Membership screen — /tier returns this table so the two
// never disagree.
export type TierPerks = {
  maxBatchRecipients: number
  maxOpenPots: number | null // null: unlimited
  multiTokenPots: boolean // a pot can accept dollars and SKR together
  sendFeeWaived: boolean
  fuelIncluded: boolean // gas-tank refills (rent and network fees) without paying SKR
}
export const tierPerks: Record<'free' | 'member' | 'business', TierPerks> = {
  free: { maxBatchRecipients: 3, maxOpenPots: 1, multiTokenPots: false, sendFeeWaived: false, fuelIncluded: false },
  member: { maxBatchRecipients: 10, maxOpenPots: 5, multiTokenPots: true, sendFeeWaived: true, fuelIncluded: true },
  business: {
    maxBatchRecipients: 25,
    maxOpenPots: null,
    multiTokenPots: true,
    sendFeeWaived: true,
    fuelIncluded: true,
  },
}

export const port = Number(process.env.PORT ?? 8787)
export const heliusWebhookSecret = process.env.HELIUS_WEBHOOK_SECRET ?? null
