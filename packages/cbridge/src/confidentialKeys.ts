import { deriveConfidentialKeys } from '@solana-program/token-2022/confidential'
import { AeKey, ElGamalKeypair, ElGamalSecretKey } from '@solana/zk-sdk/web'
import type { MessagePartialSigner } from '@solana/kit'

export type ConfidentialWalletKeys = {
  elgamalKeypair: ElGamalKeypair
  aesKey: AeKey
}

// Mirrors scripts/lib/confidentialKeys.ts, targeting the "web" wasm-bindgen build instead of
// "bundler" (see build.ts for why: esbuild can't natively resolve the bundler target's raw
// `.wasm` import, so this bundle aliases `@solana/zk-sdk/bundler` to `@solana/zk-sdk/web`
// everywhere, including inside @solana-program/token-2022's own import of it).
export async function deriveWalletConfidentialKeys(signer: MessagePartialSigner): Promise<ConfidentialWalletKeys> {
  const derived = await deriveConfidentialKeys({ signer })
  return {
    elgamalKeypair: ElGamalKeypair.fromSecretKey(ElGamalSecretKey.fromBytes(derived.elgamalKeypair.secretKey)),
    aesKey: AeKey.fromBytes(derived.aeKey),
  }
}
