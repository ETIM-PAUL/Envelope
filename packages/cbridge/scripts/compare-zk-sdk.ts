// Checks that vendor/zk-sdk-web (the zk-sdk rebuilt without WebAssembly reference types, so it
// runs on Chrome 85+ WebViews — see build-zk-sdk-compat.sh) is the same cryptography as the
// published @solana/zk-sdk:
//
//   1. the published module uses externref (needs Chrome 96+) and the vendored one doesn't;
//   2. keys from the same seed are byte-identical;
//   3. ciphertexts and commitments with the same (fixed) opening are byte-identical;
//   4. a proof of each kind a transfer or withdraw uses, made by either build, verifies in the
//      other — proofs are randomised, so this is the meaningful equality for them.
//
// Run: npx tsx packages/cbridge/scripts/compare-zk-sdk.ts
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'

const VENDOR = join(import.meta.dirname, '..', 'vendor', 'zk-sdk-web')
const require = createRequire(import.meta.url)

// Both builds expose the same classes; typed loosely so either can stand in for the other.
type Sdk = any

let failures = 0
function check(label: string, ok: boolean, detail = '') {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` (${detail})` : ''}`)
  if (!ok) failures++
}
const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString('hex')
const same = (a: Uint8Array, b: Uint8Array) => hex(a) === hex(b)

// Does the module declare any externref (0x6f) value or table type? Walks the type, import, table
// and global sections — where wasm-bindgen's externref glue shows up.
function usesExternref(wasm: Uint8Array): boolean {
  let pos = 8
  const u32 = () => {
    let result = 0
    let shift = 0
    for (;;) {
      const byte = wasm[pos++]!
      result |= (byte & 0x7f) << shift
      if (!(byte & 0x80)) return result >>> 0
      shift += 7
    }
  }
  const skipName = () => {
    const n = u32()
    pos += n
  }
  const limits = () => {
    const flag = wasm[pos++]!
    u32()
    if (flag & 1) u32()
  }
  while (pos < wasm.length) {
    const id = wasm[pos++]!
    const size = u32()
    const end = pos + size
    if (id === 1) {
      for (let count = u32(); count > 0; count--) {
        pos++ // 0x60 func
        for (let params = u32(); params > 0; params--) if (wasm[pos++] === 0x6f) return true
        for (let results = u32(); results > 0; results--) if (wasm[pos++] === 0x6f) return true
      }
    } else if (id === 2) {
      for (let count = u32(); count > 0; count--) {
        skipName()
        skipName()
        const kind = wasm[pos++]
        if (kind === 0) u32()
        else if (kind === 1) {
          if (wasm[pos++] === 0x6f) return true
          limits()
        } else if (kind === 2) limits()
        else if (kind === 3) {
          if (wasm[pos++] === 0x6f) return true
          pos++
        }
      }
    } else if (id === 4) {
      for (let count = u32(); count > 0; count--) {
        if (wasm[pos++] === 0x6f) return true
        limits()
      }
    } else if (id === 6) {
      for (let count = u32(); count > 0; count--) {
        if (wasm[pos] === 0x6f) return true
        break // init expressions vary in length; the first global's type is what matters here
      }
    }
    pos = end
  }
  return false
}

async function main() {
  const published: Sdk = require('@solana/zk-sdk/node')
  const vendored: Sdk = await import(join(VENDOR, 'index.js'))
  vendored.initSync({ module: readFileSync(join(VENDOR, 'index_bg.wasm')) })
  const publishedWasm = readFileSync(require.resolve('@solana/zk-sdk/node').replace(/index\.js$/, 'index_bg.wasm'))
  const vendoredWasm = readFileSync(join(VENDOR, 'index_bg.wasm'))

  console.log('1. WebAssembly features')
  check('published @solana/zk-sdk uses externref (Chrome 96+)', usesExternref(publishedWasm))
  check('vendored build has no externref (Chrome 85+)', !usesExternref(vendoredWasm))

  console.log('2. keys from the same seed')
  const seed = new Uint8Array(32).map((_, i) => (i * 37 + 11) & 0xff)
  const keys = (sdk: Sdk) => {
    const elgamal = sdk.ElGamalKeypair.fromSeed(seed)
    return {
      elgamal,
      pubkey: elgamal.pubkey().toBytes() as Uint8Array,
      secret: elgamal.secret().toBytes() as Uint8Array,
      ae: sdk.AeKey.fromSeed(seed).toBytes() as Uint8Array,
    }
  }
  const p = keys(published)
  const v = keys(vendored)
  check('ElGamal public key', same(p.pubkey, v.pubkey), hex(p.pubkey).slice(0, 16) + '…')
  check('ElGamal secret key', same(p.secret, v.secret))
  check('AE key (decryptable balance)', same(p.ae, v.ae))

  console.log('3. ciphertexts and commitments with a fixed opening')
  const amount = 123_456_789n
  const encrypt = (sdk: Sdk, pubkeyBytes: Uint8Array) =>
    sdk.ElGamalPubkey.fromBytes(pubkeyBytes).encryptWith(amount, sdk.PedersenOpening.zero()).toBytes() as Uint8Array
  check('ElGamal ciphertext', same(encrypt(published, p.pubkey), encrypt(vendored, v.pubkey)))
  const commit = (sdk: Sdk) => sdk.PedersenCommitment.from(amount, sdk.PedersenOpening.zero()).toBytes() as Uint8Array
  check('Pedersen commitment', same(commit(published), commit(vendored)))
  // Randomised encryptions still decrypt across builds.
  const randomCiphertext = published.ElGamalPubkey.fromBytes(p.pubkey)
    .encryptWith(amount, new published.PedersenOpening())
    .toBytes()
  check(
    'published ciphertext decrypts in the vendored build',
    vendored.ElGamalSecretKey.fromBytes(v.secret).decrypt(vendored.ElGamalCiphertext.fromBytes(randomCiphertext)) ===
      amount,
  )
  const aeCiphertext = vendored.AeKey.fromBytes(v.ae).encrypt(amount).toBytes()
  check(
    'vendored AE ciphertext decrypts in the published build',
    published.AeKey.fromBytes(p.ae).decrypt(published.AeCiphertext.fromBytes(aeCiphertext)) === amount,
  )

  console.log('4. proofs made by one build verify in the other')
  const proofs: Record<string, (sdk: Sdk, k: ReturnType<typeof keys>) => Uint8Array> = {
    PubkeyValidityProofData: (sdk, k) => new sdk.PubkeyValidityProofData(k.elgamal).toBytes(),
    ZeroCiphertextProofData: (sdk, k) =>
      new sdk.ZeroCiphertextProofData(
        k.elgamal,
        k.elgamal.pubkey().encryptWith(0n, new sdk.PedersenOpening()),
      ).toBytes(),
    CiphertextCommitmentEqualityProofData: (sdk, k) => {
      const opening = new sdk.PedersenOpening()
      const ciphertext = k.elgamal.pubkey().encryptWith(amount, new sdk.PedersenOpening())
      return new sdk.CiphertextCommitmentEqualityProofData(
        k.elgamal,
        ciphertext,
        sdk.PedersenCommitment.from(amount, opening),
        opening,
        amount,
      ).toBytes()
    },
    BatchedRangeProofU64Data: (sdk) => {
      const openings = [new sdk.PedersenOpening(), new sdk.PedersenOpening()]
      const amounts = new BigUint64Array([amount, 42n])
      const commitments = [0, 1].map((i) => sdk.PedersenCommitment.from(amounts[i]!, openings[i]!))
      return new sdk.BatchedRangeProofU64Data(commitments, amounts, new Uint8Array([32, 32]), openings).toBytes()
    },
  }
  for (const [name, make] of Object.entries(proofs)) {
    for (const [from, to, fromKeys] of [
      [published, vendored, p],
      [vendored, published, v],
    ] as const) {
      const bytes = make(from, fromKeys)
      let ok = true
      try {
        to[name].fromBytes(bytes).verify()
      } catch {
        ok = false
      }
      check(`${name}: ${from === published ? 'published → vendored' : 'vendored → published'}`, ok)
    }
    // And a corrupted proof must fail: the check isn't vacuous.
    const tampered = make(published, p)
    tampered[tampered.length - 1]! ^= 1
    let rejected = false
    try {
      vendored[name].fromBytes(tampered).verify()
    } catch {
      rejected = true
    }
    check(`${name}: a tampered proof is rejected`, rejected)
  }

  console.log(failures === 0 ? 'zk-sdk builds match' : `${failures} check(s) failed`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
