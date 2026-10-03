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

export const port = Number(process.env.PORT ?? 8787)
export const heliusWebhookSecret = process.env.HELIUS_WEBHOOK_SECRET ?? null
