import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createKeyPairSignerFromBytes, type KeyPairSigner } from '@solana/kit'

// The programs' `ADMIN` constant (both envelope_stake and envelope_vault) is the devnet admin, and
// only it may call `initialize`/`initialize_asset` — so tests must sign as that same key, read
// from .keys/admin.json (`npm run devnet:keys`). A fixed key, not a per-run random one: vitest's
// `--isolate` (default) gives each test FILE its own module realm, so a plain in-memory singleton
// doesn't share state across envelope-stake.test.ts and envelope-vault.test.ts. Both files need to
// agree on the SAME admin identity independently — whichever creates the shared stake pool (see
// setup-stake-pool.ts) becomes the SKR mint's authority on-chain, and the other file still needs
// to mint SKR through that same authority. Reading one file in each realm solves that.
const ADMIN_KEYPAIR_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '.keys', 'admin.json')

let cached: Promise<KeyPairSigner> | undefined

export function testAdminSigner(): Promise<KeyPairSigner> {
  cached ??= createKeyPairSignerFromBytes(new Uint8Array(JSON.parse(readFileSync(ADMIN_KEYPAIR_PATH, 'utf8'))))
  return cached
}
