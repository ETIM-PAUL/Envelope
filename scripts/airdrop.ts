// Phase 0: airdrop devnet SOL to every wallet in config/devnet.json.
// Devnet faucets are rate-limited; run this daily rather than in a loop.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { airdropFactory, createSolanaRpc, createSolanaRpcSubscriptions, address, lamports } from '@solana/kit'
import 'dotenv/config'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CONFIG_PATH = join(ROOT, 'config', 'devnet.json')

const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8')) as {
  wallets: Record<string, string>
}

const rpcUrl = process.env.HELIUS_DEVNET_RPC_URL ?? 'https://api.devnet.solana.com'
const rpc = createSolanaRpc(rpcUrl)
const rpcSubscriptions = createSolanaRpcSubscriptions(rpcUrl.replace(/^http/, 'ws'))
const airdrop = airdropFactory({ rpc, rpcSubscriptions })

const AMOUNT_SOL = 2n

for (const [name, pubkey] of Object.entries(config.wallets)) {
  try {
    await airdrop({
      commitment: 'confirmed',
      lamports: lamports(AMOUNT_SOL * 1_000_000_000n),
      recipientAddress: address(pubkey),
    })
    console.log(`airdropped ${AMOUNT_SOL} SOL to ${name} (${pubkey})`)
  } catch (err) {
    console.error(`airdrop failed for ${name} (${pubkey}):`, err instanceof Error ? err.message : err)
  }
}
