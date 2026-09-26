import { deriveConfidentialKeys } from '@solana-program/token-2022/confidential'
import { AeKey, ElGamalKeypair, ElGamalSecretKey } from '@solana/zk-sdk/bundler'
import type { MessagePartialSigner } from '@solana/kit'

export type ConfidentialWalletKeys = {
  elgamalKeypair: ElGamalKeypair
  aesKey: AeKey
}

// `deriveConfidentialKeys` (the standard, non-deprecated wallet-level derivation — one Ed25519
// signature over a fixed message, via the WASM ZK SDK) returns plain bytes for portability.
// The confidential-transfer instruction builders want the WASM class instances instead, so we
// reconstruct them here.
export async function deriveWalletConfidentialKeys(signer: MessagePartialSigner): Promise<ConfidentialWalletKeys> {
  const derived = await deriveConfidentialKeys({ signer })
  return {
    elgamalKeypair: ElGamalKeypair.fromSecretKey(ElGamalSecretKey.fromBytes(derived.elgamalKeypair.secretKey)),
    aesKey: AeKey.fromBytes(derived.aeKey),
  }
}
