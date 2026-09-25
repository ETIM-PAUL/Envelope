import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createKeyPairSignerFromBytes, type KeyPairSigner } from '@solana/kit'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const KEYS_DIR = join(ROOT, '.keys')

export async function loadWalletSigner(name: string): Promise<KeyPairSigner> {
  const bytes = new Uint8Array(JSON.parse(readFileSync(join(KEYS_DIR, `${name}.json`), 'utf8')))
  return createKeyPairSignerFromBytes(bytes)
}

export function devnetConfigPath(): string {
  return join(ROOT, 'config', 'devnet.json')
}

export function readDevnetConfig(): Record<string, unknown> {
  return JSON.parse(readFileSync(devnetConfigPath(), 'utf8'))
}
