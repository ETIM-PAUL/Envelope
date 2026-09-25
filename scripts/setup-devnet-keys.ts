// Phase 0: generate (or reuse) devnet keypairs for admin/relayer/alice/bob/carol
// and record their pubkeys + cluster config in config/devnet.json.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import 'dotenv/config'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const KEYS_DIR = join(ROOT, '.keys')
const CONFIG_PATH = join(ROOT, 'config', 'devnet.json')

const WALLETS = ['admin', 'relayer', 'alice', 'bob', 'carol'] as const

function ensureKeypair(name: string): string {
  const outfile = join(KEYS_DIR, `${name}.json`)
  if (!existsSync(outfile)) {
    execFileSync('solana-keygen', ['new', '--no-bip39-passphrase', '--silent', '--outfile', outfile])
    console.log(`created ${outfile}`)
  }
  return execFileSync('solana-keygen', ['pubkey', outfile]).toString().trim()
}

mkdirSync(KEYS_DIR, { recursive: true })

const pubkeys = Object.fromEntries(WALLETS.map((name) => [name, ensureKeypair(name)]))

// The RPC URL (Helius API key included) stays in .env only — never committed here.
const existing = existsSync(CONFIG_PATH) ? JSON.parse(readFileSync(CONFIG_PATH, 'utf8')) : {}

const config = {
  ...existing,
  cluster: 'devnet',
  wallets: pubkeys,
}

mkdirSync(dirname(CONFIG_PATH), { recursive: true })
writeFileSync(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`)

console.log(`wrote ${CONFIG_PATH}`)
console.table(pubkeys)
