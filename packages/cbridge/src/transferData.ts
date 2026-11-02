// Where a confidential transfer's amounts live on-chain, and how to read them: shared by the
// bridge (which decrypts and proves them, bridge.ts) and statement verification (statement.ts), so
// the prover and the verifier read exactly the same bytes.
import { BatchedGroupedCiphertext3HandlesValidityProofData } from '@solana/zk-sdk/web'

// Verified against a real devnet transfer with a known amount (see git history for the one-off
// research script that confirmed this) — none of these constants are documented in
// @solana/zk-sdk's public TS bindings, which expose the proof context as opaque toBytes()/
// fromBytes() only, no field accessors.
export const ZK_ELGAMAL_PROOF_PROGRAM_ADDRESS = 'ZkE1Gama1Proof11111111111111111111111111111'
export const VERIFY_BATCHED_GROUPED_CIPHERTEXT_3_HANDLES_VALIDITY_DISCRIMINATOR = 12
export const CONFIDENTIAL_TRANSFER_EXTENSION_DISCRIMINATOR = 27 // Token-2022's top-level instruction byte
export const CONFIDENTIAL_TRANSFER_SUB_DISCRIMINATOR = 7 // the extension's own "Transfer" sub-instruction
export const TRANSFER_AMOUNT_LO_BIT_LENGTH = 16n
// context = 3x32-byte pubkeys (first/second/third, matching the proof's constructor order) +
// grouped_ciphertext_lo (128 bytes) + grouped_ciphertext_hi (128 bytes).
export const PROOF_CONTEXT_PUBKEYS_SIZE = 96
export const GROUPED_CIPHERTEXT_SIZE = 128 // 32-byte commitment + 3x32-byte handles
// Handle order within a grouped ciphertext, fixed by how transfers are built
// (buildConfidentialTransferProofData: sourcePubkey, destinationPubkey, auditorPubkey).
export const SOURCE_HANDLE_INDEX = 0
export const DESTINATION_HANDLE_INDEX = 1

export function combineAmounts(lo: bigint, hi: bigint, bitLength: bigint): bigint {
  return (hi << bitLength) + lo
}

// Not exported by @solana-program/token-2022's public API (only leaks into its dist/types, never
// re-exported from "." or "./confidential") despite being used internally — reimplemented from
// its own doc comment: "32-byte commitment followed by N 32-byte handles. The returned 64-byte
// array is [commitment, handle]."
export function extractCiphertextFromGroupedBytes(grouped: Uint8Array, handleIndex: number): Uint8Array {
  const result = new Uint8Array(64)
  result.set(grouped.slice(0, 32), 0)
  result.set(grouped.slice(32 + handleIndex * 32, 32 + (handleIndex + 1) * 32), 32)
  return result
}

// One handle's lo/hi ciphertexts (64 bytes each: commitment + that handle) from a ciphertext-validity
// proof instruction's raw data (including its 1-byte discriminator prefix).
export function proofInstructionCiphertexts(
  instructionData: Uint8Array,
  handleIndex: number,
): [Uint8Array, Uint8Array] {
  const proofDataBytes = instructionData.slice(1) // strip the 1-byte VerifyProof discriminator
  const proofData = BatchedGroupedCiphertext3HandlesValidityProofData.fromBytes(proofDataBytes)
  const contextBytes = proofData.context().toBytes()
  const loBytes = contextBytes.slice(PROOF_CONTEXT_PUBKEYS_SIZE, PROOF_CONTEXT_PUBKEYS_SIZE + GROUPED_CIPHERTEXT_SIZE)
  const hiBytes = contextBytes.slice(
    PROOF_CONTEXT_PUBKEYS_SIZE + GROUPED_CIPHERTEXT_SIZE,
    PROOF_CONTEXT_PUBKEYS_SIZE + 2 * GROUPED_CIPHERTEXT_SIZE,
  )
  return [
    extractCiphertextFromGroupedBytes(loBytes, handleIndex),
    extractCiphertextFromGroupedBytes(hiBytes, handleIndex),
  ]
}

// A ConfidentialTransfer instruction's account list: [source, mint, destination, equality proof,
// ciphertext-validity proof, range proof, ...] — each proof slot being either a proof context
// account or the instructions sysvar (proof inline in the same transaction).
export const TRANSFER_VALIDITY_PROOF_ACCOUNT_INDEX = 4

// The public key a proof instruction's context lists for one party (source, destination, auditor):
// the key that party's handle is encrypted to.
export function proofInstructionPubkey(instructionData: Uint8Array, handleIndex: number): Uint8Array {
  const proofData = BatchedGroupedCiphertext3HandlesValidityProofData.fromBytes(instructionData.slice(1))
  return proofData
    .context()
    .toBytes()
    .slice(handleIndex * 32, (handleIndex + 1) * 32)
}
