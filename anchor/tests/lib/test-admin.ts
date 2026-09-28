import { createKeyPairSignerFromBytes, type KeyPairSigner } from '@solana/kit'

// A fixed keypair, not a per-run random one: vitest's `--isolate` (default) gives each test FILE
// its own module realm, so a plain in-memory singleton doesn't actually share state across
// envelope-stake.test.ts and envelope-vault.test.ts even sequentially. Both files need to agree
// on the SAME admin identity independently — whichever creates the shared stake pool (see
// setup-stake-pool.ts) becomes the SKR mint's authority on-chain, and the other file still needs
// to mint SKR through that same authority. A fixed keypair, reconstructed identically in each
// file's isolated realm, solves that without any shared JS state. Devnet/test-only; not a secret
// worth protecting.
const TEST_ADMIN_SECRET_KEY = new Uint8Array([
  238, 165, 125, 200, 42, 164, 63, 173, 164, 159, 108, 133, 101, 51, 182, 94, 231, 84, 145, 166, 213, 141, 176, 169,
  122, 78, 42, 68, 208, 203, 76, 130, 122, 129, 134, 222, 178, 180, 176, 217, 69, 129, 255, 200, 237, 153, 78, 2, 76,
  31, 195, 252, 192, 102, 233, 85, 216, 141, 196, 66, 165, 238, 231, 1,
])

let cached: Promise<KeyPairSigner> | undefined

export function testAdminSigner(): Promise<KeyPairSigner> {
  cached ??= createKeyPairSignerFromBytes(TEST_ADMIN_SECRET_KEY)
  return cached
}
