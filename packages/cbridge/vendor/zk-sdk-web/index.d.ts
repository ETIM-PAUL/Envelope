/* tslint:disable */
/* eslint-disable */
export class AeCiphertext {
  private constructor();
  free(): void;
  /**
   * Deserializes an `AeCiphertext` from a byte slice.
   */
  static fromBytes(uint8_array: Uint8Array): AeCiphertext | undefined;
  /**
   * Decrypts the ciphertext. Returns the amount if successful, otherwise `undefined`.
   */
  decrypt(key: AeKey): bigint | undefined;
  /**
   * Serializes the `AeCiphertext` to a byte array.
   */
  toBytes(): Uint8Array;
}
export class AeKey {
  free(): void;
  /**
   * Deserializes an `AeKey` from a byte slice.
   */
  static fromBytes(uint8_array: Uint8Array): AeKey;
  /**
   * Deterministically derives an `AeKey` from a BIP39 mnemonic seed
   * phrase and optional passphrase.
   */
  static fromSeedPhraseAndPassphrase(seed_phrase: string, passphrase?: string | null): AeKey;
  /**
   * Decrypts a ciphertext. Returns the amount if successful, otherwise `undefined`.
   */
  decrypt(ciphertext: AeCiphertext): bigint;
  /**
   * Encrypts a 64-bit amount.
   */
  encrypt(amount: bigint): AeCiphertext;
  /**
   * Creates a new, random authenticated encryption key.
   */
  constructor();
  /**
   * Serializes the `AeKey` to a byte array.
   */
  toBytes(): Uint8Array;
  /**
   * Deterministically derives an `AeKey` from a seed.
   *
   * The seed must be between 16 and 65535 bytes in length.
   */
  static fromSeed(seed: Uint8Array): AeKey;
}
/**
 * The context data needed to verify a batched grouped ciphertext 2-handles validity proof.
 */
export class BatchedGroupedCiphertext2HandlesValidityProofContext {
  private constructor();
  free(): void;
  /**
   * Deserializes a batched grouped ciphertext 2-handles validity proof context from a byte slice.
   * Throws an error if the bytes are invalid.
   */
  static fromBytes(bytes: Uint8Array): BatchedGroupedCiphertext2HandlesValidityProofContext;
  /**
   * Serializes the batched grouped ciphertext 2-handles validity proof context to a byte array.
   */
  toBytes(): Uint8Array;
}
/**
 * A batched grouped ciphertext validity proof with two decryption handles. This proof certifies
 * the validity of two grouped ElGamal ciphertexts that are encrypted under the same public keys.
 */
export class BatchedGroupedCiphertext2HandlesValidityProofData {
  free(): void;
  /**
   * Deserializes a batched grouped ciphertext validity proof with two handles from a byte slice.
   * Throws an error if the bytes are invalid.
   */
  static fromBytes(bytes: Uint8Array): BatchedGroupedCiphertext2HandlesValidityProofData;
  /**
   * Creates a new batched grouped ciphertext validity proof with two handles.
   */
  constructor(first_pubkey: ElGamalPubkey, second_pubkey: ElGamalPubkey, grouped_ciphertext_lo: GroupedElGamalCiphertext2Handles, grouped_ciphertext_hi: GroupedElGamalCiphertext2Handles, amount_lo: bigint, amount_hi: bigint, opening_lo: PedersenOpening, opening_hi: PedersenOpening);
  /**
   * Verifies the batched grouped ciphertext 2-handles validity proof.
   * Throws an error if the proof is invalid.
   */
  verify(): void;
  /**
   * Returns the context data associated with the proof.
   */
  context(): BatchedGroupedCiphertext2HandlesValidityProofContext;
  /**
   * Serializes the batched grouped ciphertext validity proof with two handles to a byte array.
   */
  toBytes(): Uint8Array;
}
/**
 * The context data needed to verify a batched grouped ciphertext 3-handles validity proof.
 */
export class BatchedGroupedCiphertext3HandlesValidityProofContext {
  private constructor();
  free(): void;
  /**
   * Deserializes a batched grouped ciphertext 3-handles validity proof context from a byte slice.
   * Throws an error if the bytes are invalid.
   */
  static fromBytes(bytes: Uint8Array): BatchedGroupedCiphertext3HandlesValidityProofContext;
  /**
   * Serializes the batched grouped ciphertext 3-handles validity proof context to a byte array.
   */
  toBytes(): Uint8Array;
}
/**
 * A batched grouped ciphertext validity proof with three decryption handles. This proof certifies
 * the validity of two grouped ElGamal ciphertexts that are encrypted under the same public keys.
 */
export class BatchedGroupedCiphertext3HandlesValidityProofData {
  free(): void;
  /**
   * Deserializes a batched grouped ciphertext validity proof with three handles from a byte slice.
   * Throws an error if the bytes are invalid.
   */
  static fromBytes(bytes: Uint8Array): BatchedGroupedCiphertext3HandlesValidityProofData;
  /**
   * Creates a new batched grouped ciphertext validity proof with three handles.
   */
  constructor(first_pubkey: ElGamalPubkey, second_pubkey: ElGamalPubkey, third_pubkey: ElGamalPubkey, grouped_ciphertext_lo: GroupedElGamalCiphertext3Handles, grouped_ciphertext_hi: GroupedElGamalCiphertext3Handles, amount_lo: bigint, amount_hi: bigint, opening_lo: PedersenOpening, opening_hi: PedersenOpening);
  /**
   * Verifies the batched grouped ciphertext 3-handles validity proof.
   * Throws an error if the proof is invalid.
   */
  verify(): void;
  /**
   * Returns the context data associated with the proof.
   */
  context(): BatchedGroupedCiphertext3HandlesValidityProofContext;
  /**
   * Serializes the batched grouped ciphertext validity proof with three handles to a byte array.
   */
  toBytes(): Uint8Array;
}
/**
 * The context data for a batched range proof. This context is shared by all
 * batched range proof instructions.
 */
export class BatchedRangeProofContext {
  private constructor();
  free(): void;
  /**
   * Deserializes a batched range proof context from a byte slice.
   * Throws an error if the bytes are invalid.
   */
  static fromBytes(bytes: Uint8Array): BatchedRangeProofContext;
  /**
   * Serializes the batched range proof context to a byte array.
   */
  toBytes(): Uint8Array;
}
/**
 * A 128-bit batched range proof.
 *
 * This proof certifies that a batch of Pedersen commitments encrypt values
 * that are within specified bit ranges, summing up to 128 bits in total.
 */
export class BatchedRangeProofU128Data {
  free(): void;
  /**
   * Deserializes a 128-bit batched range proof from a byte slice.
   * Throws an error if the bytes are invalid.
   */
  static fromBytes(bytes: Uint8Array): BatchedRangeProofU128Data;
  /**
   * Creates a new 128-bit batched range proof.
   *
   * The function takes arrays of Pedersen commitments, amounts (as `BigUint64Array`),
   * bit lengths (as `Uint8Array`), and Pedersen openings. The sum of bit lengths must be 128,
   * and each bit length must be a power of two.
   *
   * # Arguments
   *
   * * `commitments` - An array of `PedersenCommitment`.
   * * `amounts` - An array of 64-bit amounts (as `BigUint64Array`).
   * * `bit_lengths` - An array of bit lengths (as `Uint8Array`).
   * * `openings` - An array of `PedersenOpening`.
   */
  constructor(commitments: PedersenCommitment[], amounts: BigUint64Array, bit_lengths: Uint8Array, openings: PedersenOpening[]);
  /**
   * Verifies the 128-bit batched range proof.
   */
  verify(): void;
  /**
   * Returns the context data associated with the proof.
   */
  context(): BatchedRangeProofContext;
  /**
   * Serializes the 128-bit batched range proof to a byte array.
   */
  toBytes(): Uint8Array;
}
/**
 * A 256-bit batched range proof.
 *
 * This proof certifies that a batch of Pedersen commitments encrypt values
 * that are within specified bit ranges, summing up to 256 bits in total.
 * Each individual bit length must not exceed 128.
 */
export class BatchedRangeProofU256Data {
  free(): void;
  /**
   * Deserializes a 256-bit batched range proof from a byte slice.
   * Throws an error if the bytes are invalid.
   */
  static fromBytes(bytes: Uint8Array): BatchedRangeProofU256Data;
  /**
   * Creates a new 256-bit batched range proof.
   *
   * The function takes arrays of Pedersen commitments, amounts (as `BigUint64Array`),
   * bit lengths (as `Uint8Array`), and Pedersen openings. The sum of bit lengths must be 256,
   * and each bit length must be a power of two less than or equal to 128.
   *
   * # Arguments
   *
   * * `commitments` - An array of `PedersenCommitment`.
   * * `amounts` - An array of 64-bit amounts (as `BigUint64Array`).
   * * `bit_lengths` - An array of bit lengths (as `Uint8Array`).
   * * `openings` - An array of `PedersenOpening`.
   */
  constructor(commitments: PedersenCommitment[], amounts: BigUint64Array, bit_lengths: Uint8Array, openings: PedersenOpening[]);
  /**
   * Verifies the 256-bit batched range proof.
   */
  verify(): void;
  /**
   * Returns the context data associated with the proof.
   */
  context(): BatchedRangeProofContext;
  /**
   * Serializes the 256-bit batched range proof to a byte array.
   */
  toBytes(): Uint8Array;
}
/**
 * A 64-bit batched range proof.
 *
 * This proof certifies that a batch of Pedersen commitments encrypt values
 * that are within specified bit ranges, summing up to 64 bits in total.
 */
export class BatchedRangeProofU64Data {
  free(): void;
  /**
   * Deserializes a 64-bit batched range proof from a byte slice.
   * Throws an error if the bytes are invalid.
   */
  static fromBytes(bytes: Uint8Array): BatchedRangeProofU64Data;
  /**
   * Creates a new 64-bit batched range proof.
   *
   * The function takes arrays of Pedersen commitments, amounts (as `BigUint64Array`),
   * bit lengths (as `Uint8Array`), and Pedersen openings. The sum of bit lengths must be 64.
   *
   * # Arguments
   *
   * * `commitments` - An array of `PedersenCommitment`.
   * * `amounts` - An array of 64-bit amounts (as `BigUint64Array`).
   * * `bit_lengths` - An array of bit lengths (as `Uint8Array`).
   * * `openings` - An array of `PedersenOpening`.
   */
  constructor(commitments: PedersenCommitment[], amounts: BigUint64Array, bit_lengths: Uint8Array, openings: PedersenOpening[]);
  /**
   * Verifies the 64-bit batched range proof.
   */
  verify(): void;
  /**
   * Returns the context data associated with the proof.
   */
  context(): BatchedRangeProofContext;
  /**
   * Serializes the 64-bit batched range proof to a byte array.
   */
  toBytes(): Uint8Array;
}
/**
 * The context data needed to verify a ciphertext-ciphertext equality proof.
 */
export class CiphertextCiphertextEqualityProofContext {
  private constructor();
  free(): void;
  /**
   * Deserializes a ciphertext-ciphertext equality proof context from a byte slice.
   * Throws an error if the bytes are invalid.
   */
  static fromBytes(bytes: Uint8Array): CiphertextCiphertextEqualityProofContext;
  /**
   * Serializes the ciphertext-ciphertext equality proof context to a byte array.
   */
  toBytes(): Uint8Array;
}
/**
 * A ciphertext-ciphertext equality proof. This proof certifies that two ElGamal
 * ciphertexts encrypt the same message.
 */
export class CiphertextCiphertextEqualityProofData {
  free(): void;
  /**
   * Deserializes a ciphertext-ciphertext equality proof from a byte slice.
   * Throws an error if the bytes are invalid.
   */
  static fromBytes(bytes: Uint8Array): CiphertextCiphertextEqualityProofData;
  /**
   * Creates a new ciphertext-ciphertext equality proof.
   */
  constructor(first_keypair: ElGamalKeypair, second_pubkey: ElGamalPubkey, first_ciphertext: ElGamalCiphertext, second_ciphertext: ElGamalCiphertext, second_opening: PedersenOpening, amount: bigint);
  /**
   * Verifies the ciphertext-ciphertext equality proof.
   * Throws an error if the proof is invalid.
   */
  verify(): void;
  /**
   * Returns the context data associated with the proof.
   */
  context(): CiphertextCiphertextEqualityProofContext;
  /**
   * Serializes the ciphertext-ciphertext equality proof to a byte array.
   */
  toBytes(): Uint8Array;
}
/**
 * The context data needed to verify a ciphertext-commitment equality proof.
 */
export class CiphertextCommitmentEqualityProofContext {
  private constructor();
  free(): void;
  /**
   * Deserializes a ciphertext-commitment equality proof context from a byte slice.
   * Throws an error if the bytes are invalid.
   */
  static fromBytes(bytes: Uint8Array): CiphertextCommitmentEqualityProofContext;
  /**
   * Serializes the ciphertext-commitment equality proof context to a byte array.
   */
  toBytes(): Uint8Array;
}
/**
 * A ciphertext-commitment equality proof. This proof certifies that an ElGamal
 * ciphertext and a Pedersen commitment encrypt/encode the same message.
 */
export class CiphertextCommitmentEqualityProofData {
  free(): void;
  /**
   * Deserializes a ciphertext-commitment equality proof from a byte slice.
   * Throws an error if the bytes are invalid.
   */
  static fromBytes(bytes: Uint8Array): CiphertextCommitmentEqualityProofData;
  /**
   * Creates a new ciphertext-commitment equality proof.
   */
  constructor(keypair: ElGamalKeypair, ciphertext: ElGamalCiphertext, commitment: PedersenCommitment, opening: PedersenOpening, amount: bigint);
  /**
   * Verifies the ciphertext-commitment equality proof.
   * Throws an error if the proof is invalid.
   */
  verify(): void;
  /**
   * Returns the context data associated with the proof.
   */
  context(): CiphertextCommitmentEqualityProofContext;
  /**
   * Serializes the ciphertext-commitment equality proof to a byte array.
   */
  toBytes(): Uint8Array;
}
/**
 * Container returned by the unified confidential-balances key derivation.
 *
 * Both the ElGamal keypair and the AES (`decryptable_available_balance`
 * fast-path) key are derived from a single source of input key material
 * via a shared HKDF-SHA512 chain.
 */
export class ConfidentialKeys {
  private constructor();
  free(): void;
  /**
   * Derives a `ConfidentialKeys` pair from a 64-byte ed25519 signature
   * over the message returned by `signerMessage`.
   */
  static fromSignature(signature: Uint8Array): ConfidentialKeys;
  /**
   * Returns the standard derivation message: the constant bytes
   * `solana-conf-bal/v1` a Solana wallet signs once to derive its
   * `ConfidentialKeys` pair via `fromSignature`.
   *
   * The derived keys are bound to the signing wallet alone (one ElGamal
   * keypair and one AES key across all of the wallet's mints and token
   * accounts) and match what every other standard client derives for the
   * same wallet.
   *
   * Wallets SHOULD recognize these exact bytes, expose the signature only
   * through a dedicated key-derivation API, and refuse any generic
   * `signMessage` request whose message starts with this prefix: the
   * resulting signature is the input key material for the wallet's
   * confidential-balance decryption keys.
   */
  static signerMessage(): Uint8Array;
  /**
   * Returns the non-standard, seed-scoped WebAuthn PRF evaluation input:
   * byte-identical to `signerMessageWithSeed`. See `signerMessageWithSeed`
   * for when a seed is appropriate; see `prfInput` for the standard path.
   */
  static prfInputWithSeed(public_seed: Uint8Array): Uint8Array;
  /**
   * Returns the canonical `public_seed` for single-signer PDA wallet accounts.
   *
   * The output is `program_id || wallet_pda || mint || token_account`.
   * Pass it to `signerMessageWithSeed` or `prfInputWithSeed` so PDA/passkey
   * wallets use a consistent seed convention across implementations.
   */
  static pdaWalletPublicSeed(program_id: Uint8Array, wallet_pda: Uint8Array, mint: Uint8Array, token_account: Uint8Array): Uint8Array;
  /**
   * Returns the non-standard, seed-scoped derivation message:
   * `b"solana-conf-bal/v1" || public_seed`.
   *
   * Use this only for schemes that genuinely need keys scoped more finely
   * than the wallet (single-signer PDA wallets via `pdaWalletPublicSeed`,
   * custom application keying). Keys derived from a non-empty seed will NOT
   * match the standard keys other clients derive for the same wallet; for
   * standard wallet-level keys use `signerMessage`.
   */
  static signerMessageWithSeed(public_seed: Uint8Array): Uint8Array;
  /**
   * Returns the AES key component.
   */
  ae(): AeKey;
  /**
   * Returns the ElGamal keypair component.
   */
  elgamal(): ElGamalKeypair;
  /**
   * Derives a `ConfidentialKeys` pair from raw input key material.
   *
   * Use this when the caller already produced 32 or more bytes of IKM
   * via a non-`Signer` path: WebAuthn PRF output, Secure Enclave HMAC
   * output, KMS `GenerateMac` output, HKDF over an Ed25519 seed, or a
   * BIP39 seed.
   */
  static fromIkm(ikm: Uint8Array): ConfidentialKeys;
  /**
   * Derives a `ConfidentialKeys` pair from a WebAuthn PRF output (the
   * passkey adapter).
   *
   * A passkey's ECDSA signing is randomized by spec, so signature-based
   * derivation is structurally broken on passkey authenticators. The PRF
   * (`hmac-secret`) extension is deterministic by construction and is the
   * only viable path: evaluate `prf` over the salt returned by `prfInput`,
   * then pass the result here as a `Uint8Array`. The browser exposes
   * `prf.results.first` as a raw `ArrayBuffer`, so wrap it with
   * `new Uint8Array(result)` before calling.
   *
   * Accepts a 32-byte output (single `prf.results.first`) or a 64-byte
   * output (`first || second` concatenated). The all-zero output is rejected
   * as a non-functioning authenticator.
   */
  static fromPrf(prf_output: Uint8Array): ConfidentialKeys;
  /**
   * Returns the standard WebAuthn PRF evaluation input for `fromPrf`:
   * byte-identical to `signerMessage` (the constant `solana-conf-bal/v1`).
   *
   * Pass it to the authenticator as the `prf.eval.first` salt. The same
   * canonical message is signed in the Ed25519 path and PRF-evaluated in the
   * passkey path, so both adapters derive wallet-level keys by default.
   *
   * Browsers apply the mandatory `SHA-256("WebAuthn PRF" || 0x00 || input)`
   * prefixing before the authenticator, so this message is passed as-is.
   * Non-browser / direct-CTAP `hmac-secret` consumers MUST reproduce that
   * prefixing over this message to derive byte-identical keys.
   */
  static prfInput(): Uint8Array;
}
export class DecryptHandle {
  private constructor();
  free(): void;
  /**
   * Deserializes a decryption handle from a byte slice.
   * Returns `undefined` if the bytes are invalid.
   */
  static fromBytes(uint8_array: Uint8Array): DecryptHandle | undefined;
  /**
   * Serializes the decryption handle to a byte array.
   */
  toBytes(): Uint8Array;
}
export class ElGamalCiphertext {
  private constructor();
  free(): void;
  /**
   * Returns the commitment component of the ciphertext.
   */
  commitment(): PedersenCommitment;
  /**
   * Deserializes an ElGamal ciphertext from a byte slice.
   * Returns `undefined` if the bytes are invalid.
   */
  static fromBytes(uint8_array: Uint8Array): ElGamalCiphertext | undefined;
  /**
   * Returns the decryption handle component of the ciphertext.
   */
  handle(): DecryptHandle;
  /**
   * Serializes the ElGamal ciphertext to a byte array.
   */
  toBytes(): Uint8Array;
}
export class ElGamalKeypair {
  free(): void;
  /**
   * Creates an ElGamal keypair from a secret key.
   */
  static fromSecretKey(secret_key: ElGamalSecretKey): ElGamalKeypair;
  /**
   * Deterministically derives an `ElGamalKeypair` from a BIP39 mnemonic
   * seed phrase and optional passphrase.
   */
  static fromSeedPhraseAndPassphrase(seed_phrase: string, passphrase?: string | null): ElGamalKeypair;
  /**
   * Returns the public key of the keypair.
   */
  pubkey(): ElGamalPubkey;
  /**
   * Returns the secret key of the keypair.
   */
  secret(): ElGamalSecretKey;
  /**
   * Creates a new, random ElGamal keypair.
   */
  constructor();
  /**
   * Deterministically derives an `ElGamalKeypair` from a seed.
   *
   * The seed must be between 32 and 65535 bytes in length.
   */
  static fromSeed(seed: Uint8Array): ElGamalKeypair;
}
export class ElGamalPubkey {
  private constructor();
  free(): void;
  /**
   * Deserializes an ElGamal public key from a byte slice.
   * Throws an error if the bytes are invalid.
   */
  static fromBytes(uint8_array: Uint8Array): ElGamalPubkey;
  /**
   * Encrypts a 64-bit amount using the public key.
   */
  encryptU64(amount: bigint): ElGamalCiphertext;
  /**
   * Encrypts a 64-bit amount using the public key and a specific opening.
   */
  encryptWith(amount: bigint, opening: PedersenOpening): ElGamalCiphertext;
  /**
   * Creates an ElGamal public key from a secret key.
   */
  static fromSecretKey(secret_key: ElGamalSecretKey): ElGamalPubkey;
  /**
   * Serializes the ElGamal public key to a byte array.
   */
  toBytes(): Uint8Array;
}
export class ElGamalSecretKey {
  free(): void;
  /**
   * Deserializes an ElGamal secret key from a byte slice.
   * Throws an error if the bytes are invalid.
   */
  static fromBytes(uint8_array: Uint8Array): ElGamalSecretKey;
  /**
   * Deterministically derives an `ElGamalSecretKey` from a BIP39 mnemonic
   * seed phrase and optional passphrase.
   */
  static fromSeedPhraseAndPassphrase(seed_phrase: string, passphrase?: string | null): ElGamalSecretKey;
  /**
   * Decrypts an ElGamal ciphertext.
   * Returns the decrypted amount as a `u64`, or `undefined` if decryption fails.
   */
  decrypt(ciphertext: ElGamalCiphertext): bigint;
  /**
   * Creates a new, random ElGamal secret key.
   */
  constructor();
  /**
   * Serializes the ElGamal secret key to a byte array.
   */
  toBytes(): Uint8Array;
  /**
   * Deterministically derives an `ElGamalSecretKey` from a seed.
   *
   * The seed must be between 32 and 65535 bytes in length.
   */
  static fromSeed(seed: Uint8Array): ElGamalSecretKey;
}
/**
 * The context data needed to verify a grouped ciphertext 2-handles validity proof.
 */
export class GroupedCiphertext2HandlesValidityProofContext {
  private constructor();
  free(): void;
  /**
   * Deserializes a grouped ciphertext 2-handles validity proof context from a byte slice.
   * Throws an error if the bytes are invalid.
   */
  static fromBytes(bytes: Uint8Array): GroupedCiphertext2HandlesValidityProofContext;
  /**
   * Serializes the grouped ciphertext 2-handles validity proof context to a byte array.
   */
  toBytes(): Uint8Array;
}
/**
 * A grouped ciphertext validity proof with two decryption handles. This proof certifies
 * that a given grouped ElGamal ciphertext with two handles is well-formed.
 */
export class GroupedCiphertext2HandlesValidityProofData {
  free(): void;
  /**
   * Deserializes a grouped ciphertext validity proof with two handles from a byte slice.
   * Throws an error if the bytes are invalid.
   */
  static fromBytes(bytes: Uint8Array): GroupedCiphertext2HandlesValidityProofData;
  /**
   * Creates a new grouped ciphertext validity proof with two handles.
   */
  constructor(first_pubkey: ElGamalPubkey, second_pubkey: ElGamalPubkey, grouped_ciphertext: GroupedElGamalCiphertext2Handles, amount: bigint, opening: PedersenOpening);
  /**
   * Verifies the grouped ciphertext 2-handles validity proof.
   * Throws an error if the proof is invalid.
   */
  verify(): void;
  /**
   * Returns the context data associated with the proof.
   */
  context(): GroupedCiphertext2HandlesValidityProofContext;
  /**
   * Serializes the grouped ciphertext validity proof with two handles to a byte array.
   */
  toBytes(): Uint8Array;
}
/**
 * The context data needed to verify a grouped ciphertext 3-handles validity proof.
 */
export class GroupedCiphertext3HandlesValidityProofContext {
  private constructor();
  free(): void;
  /**
   * Deserializes a grouped ciphertext 3-handles validity proof context from a byte slice.
   * Throws an error if the bytes are invalid.
   */
  static fromBytes(bytes: Uint8Array): GroupedCiphertext3HandlesValidityProofContext;
  /**
   * Serializes the grouped ciphertext 3-handles validity proof context to a byte array.
   */
  toBytes(): Uint8Array;
}
/**
 * A grouped ciphertext validity proof with three decryption handles. This proof certifies
 * that a given grouped ElGamal ciphertext with three handles is well-formed.
 */
export class GroupedCiphertext3HandlesValidityProofData {
  free(): void;
  /**
   * Deserializes a grouped ciphertext validity proof with three handles from a byte slice.
   * Throws an error if the bytes are invalid.
   */
  static fromBytes(bytes: Uint8Array): GroupedCiphertext3HandlesValidityProofData;
  /**
   * Creates a new grouped ciphertext validity proof with three handles.
   */
  constructor(first_pubkey: ElGamalPubkey, second_pubkey: ElGamalPubkey, third_pubkey: ElGamalPubkey, grouped_ciphertext: GroupedElGamalCiphertext3Handles, amount: bigint, opening: PedersenOpening);
  /**
   * Verifies the grouped ciphertext 3-handles validity proof.
   * Throws an error if the proof is invalid.
   */
  verify(): void;
  /**
   * Returns the context data associated with the proof.
   */
  context(): GroupedCiphertext3HandlesValidityProofContext;
  /**
   * Serializes the grouped ciphertext validity proof with three handles to a byte array.
   */
  toBytes(): Uint8Array;
}
export class GroupedElGamalCiphertext2Handles {
  private constructor();
  free(): void;
  /**
   * Deserializes a 2-handle grouped ElGamal ciphertext from a byte slice.
   * Throws an error if the bytes are invalid.
   */
  static fromBytes(bytes: Uint8Array): GroupedElGamalCiphertext2Handles;
  /**
   * Encrypts a 64-bit amount under two ElGamal public keys using a specific opening.
   */
  static encryptWith(first_pubkey: ElGamalPubkey, second_pubkey: ElGamalPubkey, amount: bigint, opening: PedersenOpening): GroupedElGamalCiphertext2Handles;
  /**
   * Decrypts the ciphertext using a secret key and a handle index.
   * Returns the decrypted amount as a `u64`, or `undefined` if decryption fails.
   */
  decrypt(secret_key: ElGamalSecretKey, index: number): bigint;
  /**
   * Encrypts a 64-bit amount under two ElGamal public keys.
   */
  static encrypt(first_pubkey: ElGamalPubkey, second_pubkey: ElGamalPubkey, amount: bigint): GroupedElGamalCiphertext2Handles;
  /**
   * Serializes the 2-handle grouped ElGamal ciphertext to a byte array.
   */
  toBytes(): Uint8Array;
}
export class GroupedElGamalCiphertext3Handles {
  private constructor();
  free(): void;
  /**
   * Deserializes a 3-handle grouped ElGamal ciphertext from a byte slice.
   * Throws an error if the bytes are invalid.
   */
  static fromBytes(bytes: Uint8Array): GroupedElGamalCiphertext3Handles;
  /**
   * Encrypts a 64-bit amount under three ElGamal public keys using a specific opening.
   */
  static encryptWith(first_pubkey: ElGamalPubkey, second_pubkey: ElGamalPubkey, third_pubkey: ElGamalPubkey, amount: bigint, opening: PedersenOpening): GroupedElGamalCiphertext3Handles;
  /**
   * Decrypts the ciphertext using a secret key and a handle index.
   * Returns the decrypted amount as a `u64`, or `undefined` if decryption fails.
   */
  decrypt(secret_key: ElGamalSecretKey, index: number): bigint;
  /**
   * Encrypts a 64-bit amount under three ElGamal public keys.
   */
  static encrypt(first_pubkey: ElGamalPubkey, second_pubkey: ElGamalPubkey, third_pubkey: ElGamalPubkey, amount: bigint): GroupedElGamalCiphertext3Handles;
  /**
   * Serializes the 3-handle grouped ElGamal ciphertext to a byte array.
   */
  toBytes(): Uint8Array;
}
export class PedersenCommitment {
  private constructor();
  free(): void;
  /**
   * Deserializes a Pedersen commitment from a byte slice.
   * Throws an error if the bytes are invalid.
   */
  static fromBytes(uint8_array: Uint8Array): PedersenCommitment;
  /**
   * Combines low and high Pedersen commitments as `lo + hi * 2^bit_length`.
   */
  static combineLoHi(lo: PedersenCommitment, hi: PedersenCommitment, bit_length: number): PedersenCommitment;
  /**
   * Multiplies a Pedersen commitment by a 64-bit scalar.
   */
  multiplyByU64(scalar: bigint): PedersenCommitment;
  /**
   * Adds two Pedersen commitments.
   */
  add(other: PedersenCommitment): PedersenCommitment;
  /**
   * Creates the identity Pedersen commitment.
   */
  static zero(): PedersenCommitment;
  /**
   * Subtracts another Pedersen commitment from this commitment.
   */
  subtract(other: PedersenCommitment): PedersenCommitment;
  /**
   * Serializes the Pedersen commitment to a byte array.
   */
  toBytes(): Uint8Array;
  /**
   * Creates a Pedersen commitment from a 64-bit amount and a Pedersen opening.
   */
  static from(amount: bigint, opening: PedersenOpening): PedersenCommitment;
}
export class PedersenOpening {
  free(): void;
  /**
   * Combines low and high Pedersen openings as `lo + hi * 2^bit_length`.
   */
  static combineLoHi(lo: PedersenOpening, hi: PedersenOpening, bit_length: number): PedersenOpening;
  /**
   * Multiplies a Pedersen opening by a 64-bit scalar.
   */
  multiplyByU64(scalar: bigint): PedersenOpening;
  /**
   * Adds two Pedersen openings.
   */
  add(other: PedersenOpening): PedersenOpening;
  /**
   * Creates a zero Pedersen opening.
   */
  static zero(): PedersenOpening;
  /**
   * Creates a new, random Pedersen opening.
   */
  constructor();
  /**
   * Subtracts another Pedersen opening from this opening.
   */
  subtract(other: PedersenOpening): PedersenOpening;
}
/**
 * The context data needed to verify a percentage-with-cap proof.
 */
export class PercentageWithCapProofContext {
  private constructor();
  free(): void;
  /**
   * Deserializes a percentage-with-cap proof context from a byte slice.
   * Throws an error if the bytes are invalid.
   */
  static fromBytes(bytes: Uint8Array): PercentageWithCapProofContext;
  /**
   * Serializes the percentage-with-cap proof context to a byte array.
   */
  toBytes(): Uint8Array;
}
/**
 * A percentage-with-cap proof. This proof is used to certify that a transfer
 * amount is within a certain percentage of a base amount, with a cap.
 */
export class PercentageWithCapProofData {
  free(): void;
  /**
   * Deserializes a percentage-with-cap proof from a byte slice.
   * Throws an error if the bytes are invalid.
   */
  static fromBytes(bytes: Uint8Array): PercentageWithCapProofData;
  /**
   * Creates a new percentage-with-cap proof.
   */
  constructor(percentage_commitment: PedersenCommitment, percentage_opening: PedersenOpening, percentage_amount: bigint, delta_commitment: PedersenCommitment, delta_opening: PedersenOpening, delta_amount: bigint, claimed_commitment: PedersenCommitment, claimed_opening: PedersenOpening, max_value: bigint);
  /**
   * Verifies the percentage-with-cap proof.
   * Throws an error if the proof is invalid.
   */
  verify(): void;
  /**
   * Returns the context data associated with the proof.
   */
  context(): PercentageWithCapProofContext;
  /**
   * Serializes the percentage-with-cap proof to a byte array.
   */
  toBytes(): Uint8Array;
}
/**
 * The context data needed to verify a public-key validity proof.
 */
export class PubkeyValidityProofContext {
  private constructor();
  free(): void;
  /**
   * Deserializes a public-key validity proof context from a byte slice.
   * Throws an error if the bytes are invalid.
   */
  static fromBytes(bytes: Uint8Array): PubkeyValidityProofContext;
  /**
   * Serializes the public-key validity proof context to a byte array.
   */
  toBytes(): Uint8Array;
}
/**
 * A public-key validity proof. This proof is used to certify that an ElGamal
 * public key is valid (i.e., the prover knows the corresponding secret key).
 */
export class PubkeyValidityProofData {
  free(): void;
  /**
   * Deserializes a pubkey validity proof from a byte slice.
   * Throws an error if the bytes are invalid.
   */
  static fromBytes(bytes: Uint8Array): PubkeyValidityProofData;
  /**
   * Creates a new public-key validity proof.
   */
  constructor(keypair: ElGamalKeypair);
  /**
   * Verifies the public-key validity proof.
   * Throws an error if the proof is invalid.
   */
  verify(): void;
  /**
   * Returns the context data associated with the proof.
   */
  context(): PubkeyValidityProofContext;
  /**
   * Serializes the pubkey validity proof to a byte array.
   */
  toBytes(): Uint8Array;
}
/**
 * The context data needed to verify a zero-ciphertext proof.
 */
export class ZeroCiphertextProofContext {
  private constructor();
  free(): void;
  /**
   * Deserializes a zero-ciphertext proof context from a byte slice.
   * Throws an error if the bytes are invalid.
   */
  static fromBytes(bytes: Uint8Array): ZeroCiphertextProofContext;
  /**
   * Serializes the zero-ciphertext proof context to a byte array.
   */
  toBytes(): Uint8Array;
}
/**
 * A zero-ciphertext proof. This proof is used to certify that an ElGamal
 * ciphertext encrypts the number 0.
 */
export class ZeroCiphertextProofData {
  free(): void;
  /**
   * Deserializes a zero-ciphertext proof from a byte slice.
   * Throws an error if the bytes are invalid.
   */
  static fromBytes(bytes: Uint8Array): ZeroCiphertextProofData;
  /**
   * Creates a new zero-ciphertext proof.
   */
  constructor(keypair: ElGamalKeypair, ciphertext: ElGamalCiphertext);
  /**
   * Verifies the zero-ciphertext proof.
   * Throws an error if the proof is invalid.
   */
  verify(): void;
  /**
   * Returns the context data associated with the proof.
   */
  context(): ZeroCiphertextProofContext;
  /**
   * Serializes the zero-ciphertext proof to a byte array.
   */
  toBytes(): Uint8Array;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly __wbg_batchedrangeproofcontext_free: (a: number, b: number) => void;
  readonly __wbg_ciphertextciphertextequalityproofcontext_free: (a: number, b: number) => void;
  readonly __wbg_ciphertextciphertextequalityproofdata_free: (a: number, b: number) => void;
  readonly batchedrangeproofcontext_fromBytes: (a: number, b: number) => void;
  readonly batchedrangeproofcontext_toBytes: (a: number, b: number) => void;
  readonly ciphertextciphertextequalityproofcontext_fromBytes: (a: number, b: number) => void;
  readonly ciphertextciphertextequalityproofcontext_toBytes: (a: number, b: number) => void;
  readonly ciphertextciphertextequalityproofdata_context: (a: number) => number;
  readonly ciphertextciphertextequalityproofdata_fromBytes: (a: number, b: number) => void;
  readonly ciphertextciphertextequalityproofdata_new: (a: number, b: number, c: number, d: number, e: number, f: number, g: bigint) => void;
  readonly ciphertextciphertextequalityproofdata_toBytes: (a: number, b: number) => void;
  readonly ciphertextciphertextequalityproofdata_verify: (a: number, b: number) => void;
  readonly __wbg_aeciphertext_free: (a: number, b: number) => void;
  readonly __wbg_aekey_free: (a: number, b: number) => void;
  readonly __wbg_batchedgroupedciphertext3handlesvalidityproofcontext_free: (a: number, b: number) => void;
  readonly __wbg_batchedgroupedciphertext3handlesvalidityproofdata_free: (a: number, b: number) => void;
  readonly aeciphertext_decrypt: (a: number, b: number, c: number) => void;
  readonly aeciphertext_fromBytes: (a: number) => number;
  readonly aeciphertext_toBytes: (a: number, b: number) => void;
  readonly aekey_decrypt: (a: number, b: number, c: number) => void;
  readonly aekey_encrypt: (a: number, b: bigint) => number;
  readonly aekey_fromBytes: (a: number, b: number) => void;
  readonly aekey_fromSeed: (a: number, b: number) => void;
  readonly aekey_fromSeedPhraseAndPassphrase: (a: number, b: number, c: number, d: number, e: number) => void;
  readonly aekey_new_rand: () => number;
  readonly aekey_toBytes: (a: number, b: number) => void;
  readonly batchedgroupedciphertext3handlesvalidityproofcontext_fromBytes: (a: number, b: number) => void;
  readonly batchedgroupedciphertext3handlesvalidityproofcontext_toBytes: (a: number, b: number) => void;
  readonly batchedgroupedciphertext3handlesvalidityproofdata_context: (a: number) => number;
  readonly batchedgroupedciphertext3handlesvalidityproofdata_fromBytes: (a: number, b: number) => void;
  readonly batchedgroupedciphertext3handlesvalidityproofdata_new: (a: number, b: number, c: number, d: number, e: number, f: number, g: bigint, h: bigint, i: number, j: number) => void;
  readonly batchedgroupedciphertext3handlesvalidityproofdata_toBytes: (a: number, b: number) => void;
  readonly batchedgroupedciphertext3handlesvalidityproofdata_verify: (a: number, b: number) => void;
  readonly __wbg_batchedgroupedciphertext2handlesvalidityproofcontext_free: (a: number, b: number) => void;
  readonly __wbg_batchedgroupedciphertext2handlesvalidityproofdata_free: (a: number, b: number) => void;
  readonly __wbg_groupedelgamalciphertext2handles_free: (a: number, b: number) => void;
  readonly __wbg_groupedelgamalciphertext3handles_free: (a: number, b: number) => void;
  readonly batchedgroupedciphertext2handlesvalidityproofcontext_fromBytes: (a: number, b: number) => void;
  readonly batchedgroupedciphertext2handlesvalidityproofcontext_toBytes: (a: number, b: number) => void;
  readonly batchedgroupedciphertext2handlesvalidityproofdata_context: (a: number) => number;
  readonly batchedgroupedciphertext2handlesvalidityproofdata_fromBytes: (a: number, b: number) => void;
  readonly batchedgroupedciphertext2handlesvalidityproofdata_new: (a: number, b: number, c: number, d: number, e: number, f: bigint, g: bigint, h: number, i: number) => void;
  readonly batchedgroupedciphertext2handlesvalidityproofdata_toBytes: (a: number, b: number) => void;
  readonly batchedgroupedciphertext2handlesvalidityproofdata_verify: (a: number, b: number) => void;
  readonly groupedelgamalciphertext2handles_decrypt: (a: number, b: number, c: number, d: number) => void;
  readonly groupedelgamalciphertext2handles_encrypt: (a: number, b: number, c: bigint) => number;
  readonly groupedelgamalciphertext2handles_encryptWith: (a: number, b: number, c: bigint, d: number) => number;
  readonly groupedelgamalciphertext2handles_fromBytes: (a: number, b: number) => void;
  readonly groupedelgamalciphertext2handles_toBytes: (a: number, b: number) => void;
  readonly groupedelgamalciphertext3handles_decrypt: (a: number, b: number, c: number, d: number) => void;
  readonly groupedelgamalciphertext3handles_encrypt: (a: number, b: number, c: number, d: bigint) => number;
  readonly groupedelgamalciphertext3handles_encryptWith: (a: number, b: number, c: number, d: bigint, e: number) => number;
  readonly groupedelgamalciphertext3handles_fromBytes: (a: number, b: number) => void;
  readonly groupedelgamalciphertext3handles_toBytes: (a: number, b: number) => void;
  readonly __wbg_batchedrangeproofu128data_free: (a: number, b: number) => void;
  readonly __wbg_groupedciphertext2handlesvalidityproofcontext_free: (a: number, b: number) => void;
  readonly __wbg_groupedciphertext2handlesvalidityproofdata_free: (a: number, b: number) => void;
  readonly batchedrangeproofu128data_context: (a: number) => number;
  readonly batchedrangeproofu128data_fromBytes: (a: number, b: number) => void;
  readonly batchedrangeproofu128data_new: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => void;
  readonly batchedrangeproofu128data_toBytes: (a: number, b: number) => void;
  readonly batchedrangeproofu128data_verify: (a: number, b: number) => void;
  readonly groupedciphertext2handlesvalidityproofcontext_fromBytes: (a: number, b: number) => void;
  readonly groupedciphertext2handlesvalidityproofcontext_toBytes: (a: number, b: number) => void;
  readonly groupedciphertext2handlesvalidityproofdata_context: (a: number) => number;
  readonly groupedciphertext2handlesvalidityproofdata_fromBytes: (a: number, b: number) => void;
  readonly groupedciphertext2handlesvalidityproofdata_new: (a: number, b: number, c: number, d: number, e: bigint, f: number) => void;
  readonly groupedciphertext2handlesvalidityproofdata_toBytes: (a: number, b: number) => void;
  readonly groupedciphertext2handlesvalidityproofdata_verify: (a: number, b: number) => void;
  readonly __wbg_percentagewithcapproofcontext_free: (a: number, b: number) => void;
  readonly __wbg_percentagewithcapproofdata_free: (a: number, b: number) => void;
  readonly __wbg_pubkeyvalidityproofcontext_free: (a: number, b: number) => void;
  readonly __wbg_pubkeyvalidityproofdata_free: (a: number, b: number) => void;
  readonly percentagewithcapproofcontext_fromBytes: (a: number, b: number) => void;
  readonly percentagewithcapproofcontext_toBytes: (a: number, b: number) => void;
  readonly percentagewithcapproofdata_context: (a: number) => number;
  readonly percentagewithcapproofdata_fromBytes: (a: number, b: number) => void;
  readonly percentagewithcapproofdata_new: (a: number, b: number, c: number, d: bigint, e: number, f: number, g: bigint, h: number, i: number, j: bigint) => void;
  readonly percentagewithcapproofdata_toBytes: (a: number, b: number) => void;
  readonly percentagewithcapproofdata_verify: (a: number, b: number) => void;
  readonly pubkeyvalidityproofcontext_fromBytes: (a: number, b: number) => void;
  readonly pubkeyvalidityproofcontext_toBytes: (a: number, b: number) => void;
  readonly pubkeyvalidityproofdata_context: (a: number) => number;
  readonly pubkeyvalidityproofdata_fromBytes: (a: number, b: number) => void;
  readonly pubkeyvalidityproofdata_new: (a: number, b: number) => void;
  readonly pubkeyvalidityproofdata_toBytes: (a: number, b: number) => void;
  readonly pubkeyvalidityproofdata_verify: (a: number, b: number) => void;
  readonly __wbg_ciphertextcommitmentequalityproofcontext_free: (a: number, b: number) => void;
  readonly __wbg_ciphertextcommitmentequalityproofdata_free: (a: number, b: number) => void;
  readonly __wbg_pedersencommitment_free: (a: number, b: number) => void;
  readonly __wbg_pedersenopening_free: (a: number, b: number) => void;
  readonly ciphertextcommitmentequalityproofcontext_fromBytes: (a: number, b: number) => void;
  readonly ciphertextcommitmentequalityproofcontext_toBytes: (a: number, b: number) => void;
  readonly ciphertextcommitmentequalityproofdata_context: (a: number) => number;
  readonly ciphertextcommitmentequalityproofdata_fromBytes: (a: number, b: number) => void;
  readonly ciphertextcommitmentequalityproofdata_new: (a: number, b: number, c: number, d: number, e: number, f: bigint) => void;
  readonly ciphertextcommitmentequalityproofdata_toBytes: (a: number, b: number) => void;
  readonly ciphertextcommitmentequalityproofdata_verify: (a: number, b: number) => void;
  readonly pedersencommitment_add: (a: number, b: number) => number;
  readonly pedersencommitment_combineLoHi: (a: number, b: number, c: number, d: number) => void;
  readonly pedersencommitment_from: (a: bigint, b: number) => number;
  readonly pedersencommitment_fromBytes: (a: number, b: number) => void;
  readonly pedersencommitment_multiplyByU64: (a: number, b: bigint) => number;
  readonly pedersencommitment_subtract: (a: number, b: number) => number;
  readonly pedersencommitment_toBytes: (a: number, b: number) => void;
  readonly pedersencommitment_zero: () => number;
  readonly pedersenopening_add: (a: number, b: number) => number;
  readonly pedersenopening_combineLoHi: (a: number, b: number, c: number, d: number) => void;
  readonly pedersenopening_multiplyByU64: (a: number, b: bigint) => number;
  readonly pedersenopening_new_rand: () => number;
  readonly pedersenopening_subtract: (a: number, b: number) => number;
  readonly pedersenopening_zero: () => number;
  readonly __wbg_decrypthandle_free: (a: number, b: number) => void;
  readonly __wbg_elgamalciphertext_free: (a: number, b: number) => void;
  readonly __wbg_elgamalkeypair_free: (a: number, b: number) => void;
  readonly __wbg_elgamalpubkey_free: (a: number, b: number) => void;
  readonly __wbg_elgamalsecretkey_free: (a: number, b: number) => void;
  readonly decrypthandle_fromBytes: (a: number) => number;
  readonly decrypthandle_toBytes: (a: number, b: number) => void;
  readonly elgamalciphertext_commitment: (a: number) => number;
  readonly elgamalciphertext_fromBytes: (a: number) => number;
  readonly elgamalciphertext_handle: (a: number) => number;
  readonly elgamalciphertext_toBytes: (a: number, b: number) => void;
  readonly elgamalkeypair_fromSecretKey: (a: number) => number;
  readonly elgamalkeypair_fromSeed: (a: number, b: number) => void;
  readonly elgamalkeypair_fromSeedPhraseAndPassphrase: (a: number, b: number, c: number, d: number, e: number) => void;
  readonly elgamalkeypair_new_rand: () => number;
  readonly elgamalkeypair_secret: (a: number) => number;
  readonly elgamalpubkey_encryptU64: (a: number, b: bigint) => number;
  readonly elgamalpubkey_encryptWith: (a: number, b: bigint, c: number) => number;
  readonly elgamalpubkey_fromBytes: (a: number, b: number) => void;
  readonly elgamalpubkey_fromSecretKey: (a: number) => number;
  readonly elgamalpubkey_toBytes: (a: number, b: number) => void;
  readonly elgamalsecretkey_decrypt: (a: number, b: number, c: number) => void;
  readonly elgamalsecretkey_fromBytes: (a: number, b: number) => void;
  readonly elgamalsecretkey_fromSeed: (a: number, b: number) => void;
  readonly elgamalsecretkey_fromSeedPhraseAndPassphrase: (a: number, b: number, c: number, d: number, e: number) => void;
  readonly elgamalsecretkey_new_rand: () => number;
  readonly elgamalsecretkey_toBytes: (a: number, b: number) => void;
  readonly elgamalkeypair_pubkey: (a: number) => number;
  readonly __wbg_batchedrangeproofu64data_free: (a: number, b: number) => void;
  readonly __wbg_groupedciphertext3handlesvalidityproofcontext_free: (a: number, b: number) => void;
  readonly __wbg_groupedciphertext3handlesvalidityproofdata_free: (a: number, b: number) => void;
  readonly batchedrangeproofu64data_context: (a: number) => number;
  readonly batchedrangeproofu64data_fromBytes: (a: number, b: number) => void;
  readonly batchedrangeproofu64data_new: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => void;
  readonly batchedrangeproofu64data_toBytes: (a: number, b: number) => void;
  readonly batchedrangeproofu64data_verify: (a: number, b: number) => void;
  readonly groupedciphertext3handlesvalidityproofcontext_fromBytes: (a: number, b: number) => void;
  readonly groupedciphertext3handlesvalidityproofcontext_toBytes: (a: number, b: number) => void;
  readonly groupedciphertext3handlesvalidityproofdata_context: (a: number) => number;
  readonly groupedciphertext3handlesvalidityproofdata_fromBytes: (a: number, b: number) => void;
  readonly groupedciphertext3handlesvalidityproofdata_new: (a: number, b: number, c: number, d: number, e: number, f: bigint, g: number) => void;
  readonly groupedciphertext3handlesvalidityproofdata_toBytes: (a: number, b: number) => void;
  readonly groupedciphertext3handlesvalidityproofdata_verify: (a: number, b: number) => void;
  readonly __wbg_confidentialkeys_free: (a: number, b: number) => void;
  readonly confidentialkeys_ae: (a: number) => number;
  readonly confidentialkeys_elgamal: (a: number) => number;
  readonly confidentialkeys_fromIkm: (a: number, b: number) => void;
  readonly confidentialkeys_fromPrf: (a: number, b: number) => void;
  readonly confidentialkeys_fromSignature: (a: number, b: number) => void;
  readonly confidentialkeys_pdaWalletPublicSeed: (a: number, b: number, c: number, d: number, e: number) => void;
  readonly confidentialkeys_prfInput: (a: number) => void;
  readonly confidentialkeys_prfInputWithSeed: (a: number, b: number) => void;
  readonly confidentialkeys_signerMessage: (a: number) => void;
  readonly confidentialkeys_signerMessageWithSeed: (a: number, b: number) => void;
  readonly __wbg_batchedrangeproofu256data_free: (a: number, b: number) => void;
  readonly __wbg_zerociphertextproofcontext_free: (a: number, b: number) => void;
  readonly __wbg_zerociphertextproofdata_free: (a: number, b: number) => void;
  readonly batchedrangeproofu256data_context: (a: number) => number;
  readonly batchedrangeproofu256data_fromBytes: (a: number, b: number) => void;
  readonly batchedrangeproofu256data_new: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => void;
  readonly batchedrangeproofu256data_toBytes: (a: number, b: number) => void;
  readonly batchedrangeproofu256data_verify: (a: number, b: number) => void;
  readonly zerociphertextproofcontext_fromBytes: (a: number, b: number) => void;
  readonly zerociphertextproofcontext_toBytes: (a: number, b: number) => void;
  readonly zerociphertextproofdata_context: (a: number) => number;
  readonly zerociphertextproofdata_fromBytes: (a: number, b: number) => void;
  readonly zerociphertextproofdata_new: (a: number, b: number, c: number) => void;
  readonly zerociphertextproofdata_toBytes: (a: number, b: number) => void;
  readonly zerociphertextproofdata_verify: (a: number, b: number) => void;
  readonly __wbindgen_export_0: (a: number) => void;
  readonly __wbindgen_add_to_stack_pointer: (a: number) => number;
  readonly __wbindgen_export_1: (a: number, b: number, c: number) => void;
  readonly __wbindgen_export_2: (a: number, b: number) => number;
  readonly __wbindgen_export_3: (a: number, b: number, c: number, d: number) => number;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;
/**
* Instantiates the given `module`, which can either be bytes or
* a precompiled `WebAssembly.Module`.
*
* @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
*
* @returns {InitOutput}
*/
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
* If `module_or_path` is {RequestInfo} or {URL}, makes a request and
* for everything else, calls `WebAssembly.instantiate` directly.
*
* @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
*
* @returns {Promise<InitOutput>}
*/
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
