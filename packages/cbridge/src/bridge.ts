// Entry point bundled by build.ts into a single local HTML file, loaded by rn-confidential's
// hidden WebView. Builds confidential-transfer instructions/proofs and transactions here (where
// WASM works); every signature — the one-time key-derivation signature and every transaction
// signature — round-trips to React Native (MWA) via the host methods in protocol.ts. This bridge
// never receives or stores an MWA-controlled private key, only the derived confidential keys,
// which live in memory for this WebView session only (cleared on reload / the app's "Lock" action).
import {
  address,
  createNoopSigner,
  createSolanaRpc,
  getBase58Decoder,
  sequentialInstructionPlan,
  singleInstructionPlan,
  unwrapOption,
  type Address,
  type Instruction,
  type InstructionPlan,
  type MessagePartialSigner,
  type ReadonlyUint8Array,
  type SignatureDictionary,
  type TransactionPartialSigner,
} from '@solana/kit'
import {
  ExtensionType,
  fetchMaybeToken,
  fetchToken,
  findAssociatedTokenPda,
  getEnableCpiGuardInstruction,
  getReallocateInstruction,
  TOKEN_2022_PROGRAM_ADDRESS,
} from '@solana-program/token-2022'
import {
  findAssociatedTokenPda as findClassicAssociatedTokenPda,
  getTransferInstruction as getClassicTransferInstruction,
  TOKEN_PROGRAM_ADDRESS,
} from '@solana-program/token'
import {
  decryptConfidentialTransferBalance,
  fetchConfidentialTransferBalance,
  getConfidentialTransferInstructionPlan,
  getCreateConfidentialTransferAccountInstructionPlan,
} from '@solana-program/token-2022/confidential'
import zkInit, { BatchedGroupedCiphertext3HandlesValidityProofData, ElGamalCiphertext } from '@solana/zk-sdk/web'
import type { AeKey, ElGamalKeypair } from '@solana/zk-sdk/web'
import { ZK_SDK_WASM_BASE64 } from './generated/wasmBase64.ts'
import { deriveWalletConfidentialKeys } from './confidentialKeys.ts'
import { RpcChannel } from './rpcChannel.ts'
import { signInstructionPlan } from './signPlan.ts'
import type {
  BuildTransferPlanParams,
  BuildTransferPlanResult,
  DecryptAvailableParams,
  DecryptAvailableResult,
  DeriveKeysParams,
  DeriveKeysResult,
  EnsureAccountReadyParams,
  EnsureAccountReadyResult,
  IsAccountReadyParams,
  IsAccountReadyResult,
  LockKeysParams,
  LockKeysResult,
  PingParams,
  PingResult,
  DecryptActivityParams,
  DecryptActivityResult,
  PrepareApplyPendingBalanceParams,
  PrepareApplyPendingBalanceResult,
  RestoreKeysParams,
  RestoreKeysResult,
  SignMessageResult,
  SignTransactionResult,
} from './protocol.ts'

// Matches roundtrip.ts's MAX_PENDING_BALANCE_CREDIT_COUNTER — how many unapplied confidential
// deposits/transfers an account can queue before `applyPendingBalance` must run before another
// lands. 65,536 is the standard default across the ecosystem's confidential-transfer tooling.
const MAX_PENDING_BALANCE_CREDIT_COUNTER = 65_536n

declare global {
  interface Window {
    ReactNativeWebView?: { postMessage(message: string): void }
  }
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function bytesToBase64(bytes: ReadonlyUint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

let wasmReady = false
const wasmInit = zkInit(base64ToBytes(ZK_SDK_WASM_BASE64)).then(() => {
  wasmReady = true
})

const channel = new RpcChannel((text) => window.ReactNativeWebView?.postMessage(text), 'bridge')
window.addEventListener('message', (event) => channel.receive(String(event.data)))
// Android WebViews deliver postMessage on `document`, not `window` — listen on both.
document.addEventListener('message', (event) => channel.receive(String((event as MessageEvent).data)))

const sessionKeys = new Map<string, { elgamalKeypair: ElGamalKeypair; aesKey: AeKey }>()

// `onSignature` lets deriveKeys capture the raw signature bytes for persistence (Phase 8) without
// this signer needing to know anything about that — it's just a side channel on top of the normal
// MWA round trip.
function createHostMessageSigner(owner: Address, onSignature?: (signature: Uint8Array) => void): MessagePartialSigner {
  return {
    address: owner,
    async signMessages(messages) {
      return Promise.all(
        messages.map(async (message) => {
          const { signatureBase64 } = await channel.call<SignMessageResult>('signMessage', {
            address: owner,
            messageBase64: bytesToBase64(message.content),
          })
          const signature = base64ToBytes(signatureBase64)
          onSignature?.(signature)
          return { [owner]: signature } as SignatureDictionary
        }),
      )
    },
  }
}

// Replays a previously captured derivation signature instead of round-tripping through MWA again
// — same message (`solana-conf-bal/v1`, signed by `deriveConfidentialKeys` internally), same
// deterministic Ed25519 signature, same derived keys.
function createReplayMessageSigner(owner: Address, signature: Uint8Array): MessagePartialSigner {
  return {
    address: owner,
    async signMessages(messages) {
      return messages.map(() => ({ [owner]: signature }) as SignatureDictionary)
    },
  }
}

function createHostTransactionSigner(owner: Address): TransactionPartialSigner {
  return {
    address: owner,
    async signTransactions(transactions) {
      return Promise.all(
        transactions.map(async (transaction) => {
          const { signatureBase64 } = await channel.call<SignTransactionResult>('signTransaction', {
            address: owner,
            messageBase64: bytesToBase64(transaction.messageBytes),
          })
          return { [owner]: base64ToBytes(signatureBase64) } as SignatureDictionary
        }),
      )
    },
  }
}

channel.on('ping', async (_params) => {
  void (_params as PingParams)
  await wasmInit
  return { ok: true, wasmReady } satisfies PingResult
})

channel.on('deriveKeys', async (params) => {
  const { owner } = params as DeriveKeysParams
  await wasmInit
  const ownerAddress = address(owner)
  let signature: Uint8Array | undefined
  const keys = await deriveWalletConfidentialKeys(
    createHostMessageSigner(ownerAddress, (sig) => {
      signature = sig
    }),
  )
  if (!signature) throw new Error('deriveKeys: no derivation signature captured')
  sessionKeys.set(owner, keys)
  const elgamalPubkeyBase58 = getBase58Decoder().decode(keys.elgamalKeypair.pubkey().toBytes())
  return { elgamalPubkeyBase58, signatureBase64: bytesToBase64(signature) } satisfies DeriveKeysResult
})

channel.on('restoreKeys', async (params) => {
  const { owner, signatureBase64 } = params as RestoreKeysParams
  await wasmInit
  const ownerAddress = address(owner)
  const signature = base64ToBytes(signatureBase64)
  const keys = await deriveWalletConfidentialKeys(createReplayMessageSigner(ownerAddress, signature))
  sessionKeys.set(owner, keys)
  const elgamalPubkeyBase58 = getBase58Decoder().decode(keys.elgamalKeypair.pubkey().toBytes())
  return { elgamalPubkeyBase58 } satisfies RestoreKeysResult
})

channel.on('lockKeys', async (_params) => {
  void (_params as LockKeysParams)
  sessionKeys.clear()
  return { ok: true } satisfies LockKeysResult
})

channel.on('buildTransferPlan', async (params) => {
  const { rpcUrl, mint, owner, destinationOwner, amount, feePayer, feeInstruction } = params as BuildTransferPlanParams
  await wasmInit
  const keys = sessionKeys.get(owner)
  if (!keys) throw new Error(`call deriveKeys("${owner}") before buildTransferPlan`)

  const rpc = createSolanaRpc(rpcUrl)
  const mintAddress = address(mint)
  const ownerAddress = address(owner)
  const destinationAddress = address(destinationOwner)
  const relayerAddress = address(feePayer)

  const [sourceToken] = await findAssociatedTokenPda({
    owner: ownerAddress,
    mint: mintAddress,
    tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
  })
  const [destinationToken] = await findAssociatedTokenPda({
    owner: destinationAddress,
    mint: mintAddress,
    tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
  })

  const [sourceAccount, destinationAccount] = await Promise.all([
    fetchToken(rpc, sourceToken),
    fetchToken(rpc, destinationToken),
  ])

  // owner signs as transfer authority (real MWA round-trip); the relayer pays fees + proof-context
  // rent, but never signs here — a noop signer leaves its slot empty for /relay to co-sign (see
  // protocol.ts's BuildTransferPlanParams doc comment).
  const signer = createHostTransactionSigner(ownerAddress)
  const relayerSigner = createNoopSigner(relayerAddress)

  const plan = await getConfidentialTransferInstructionPlan({
    sourceToken,
    destinationToken,
    mint: mintAddress,
    sourceTokenAccount: sourceAccount.data,
    destinationTokenAccount: destinationAccount.data,
    authority: signer,
    amount: BigInt(amount),
    sourceElgamalKeypair: keys.elgamalKeypair,
    aesKey: keys.aesKey,
    payer: relayerSigner,
    rpc,
  })

  const transferTransactions = await signInstructionPlan(plan, relayerSigner, rpc)

  // Free-tier senders (owner asked the relayer's GET /tier/:wallet) prepend a small, separate SKR
  // fee transaction — same owner-signs/relayer-noop-payer pattern, built and signed here (not in
  // React Native) so it reuses the exact same MWA round-trip and never needs its own Solana
  // instruction-building code on the native side.
  let feeTransactions: string[] = []
  if (feeInstruction) {
    const skrMintAddress = address(feeInstruction.skrMint)
    const [ownerSkrAta] = await findClassicAssociatedTokenPda({
      owner: ownerAddress,
      mint: skrMintAddress,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    })
    const [relayerSkrAta] = await findClassicAssociatedTokenPda({
      owner: relayerAddress,
      mint: skrMintAddress,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    })
    const feeIx = getClassicTransferInstruction({
      source: ownerSkrAta,
      destination: relayerSkrAta,
      authority: signer,
      amount: BigInt(feeInstruction.amount),
    })
    feeTransactions = await signInstructionPlan(singleInstructionPlan(feeIx), relayerSigner, rpc)
  }

  return { signedTransactions: [...feeTransactions, ...transferTransactions] } satisfies BuildTransferPlanResult
})

channel.on('decryptAvailable', async (params) => {
  const { rpcUrl, mint, owner } = params as DecryptAvailableParams
  await wasmInit
  const keys = sessionKeys.get(owner)
  if (!keys) throw new Error(`call deriveKeys("${owner}") before decryptAvailable`)

  const rpc = createSolanaRpc(rpcUrl)
  const [token] = await findAssociatedTokenPda({
    owner: address(owner),
    mint: address(mint),
    tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
  })

  const balance = await fetchConfidentialTransferBalance({
    token,
    rpc,
    elgamalSecretKey: keys.elgamalKeypair.secret(),
    aesKey: keys.aesKey,
  })

  return {
    availableBalance: balance.availableBalance.toString(),
    pendingBalance: balance.pendingBalance.toString(),
  } satisfies DecryptAvailableResult
})

function hasExtension(extensions: { __kind: string }[] | undefined, kind: string): boolean {
  return extensions?.some((extension) => extension.__kind === kind) ?? false
}

function hasCpiGuardEnabled(extensions: { __kind: string; lockCpi?: boolean }[] | undefined): boolean {
  return extensions?.some((extension) => extension.__kind === 'CpiGuard' && extension.lockCpi === true) ?? false
}

channel.on('ensureAccountReady', async (params) => {
  const { rpcUrl, mint, owner } = params as EnsureAccountReadyParams
  await wasmInit
  const keys = sessionKeys.get(owner)
  if (!keys) throw new Error(`call deriveKeys("${owner}") before ensureAccountReady`)

  const rpc = createSolanaRpc(rpcUrl)
  const mintAddress = address(mint)
  const ownerAddress = address(owner)
  const signer = createHostTransactionSigner(ownerAddress)

  const [token] = await findAssociatedTokenPda({
    owner: ownerAddress,
    mint: mintAddress,
    tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
  })
  const existing = await fetchMaybeToken(rpc, token)
  const extensions = existing.exists ? (unwrapOption(existing.data.extensions) ?? undefined) : undefined

  const steps: (Instruction | InstructionPlan)[] = []

  if (!hasExtension(extensions, 'ConfidentialTransferAccount')) {
    steps.push(
      await getCreateConfidentialTransferAccountInstructionPlan({
        payer: signer,
        owner: signer,
        mint: mintAddress,
        rpc,
        elgamalKeypair: keys.elgamalKeypair,
        aesKey: keys.aesKey,
        maximumPendingBalanceCreditCounter: MAX_PENDING_BALANCE_CREDIT_COUNTER,
      }),
    )
  }

  if (!hasCpiGuardEnabled(extensions)) {
    // Reallocating an extension the account already has space for is rejected on-chain, so only
    // include it when the TLV entry genuinely isn't there yet (as opposed to present but
    // `lockCpi: false`, which just needs EnableCpiGuard).
    if (!hasExtension(extensions, 'CpiGuard')) {
      steps.push(
        getReallocateInstruction({
          token,
          payer: signer,
          owner: signer,
          newExtensionTypes: [ExtensionType.CpiGuard],
        }),
      )
    }
    steps.push(getEnableCpiGuardInstruction({ token, owner: signer }))
  }

  if (steps.length === 0) {
    return { alreadyReady: true, signedTransactions: [] } satisfies EnsureAccountReadyResult
  }

  const signedTransactions = await signInstructionPlan(sequentialInstructionPlan(steps), signer, rpc)
  return { alreadyReady: false, signedTransactions } satisfies EnsureAccountReadyResult
})

channel.on('isAccountReady', async (params) => {
  const { rpcUrl, mint, owner } = params as IsAccountReadyParams
  const rpc = createSolanaRpc(rpcUrl)
  const [token] = await findAssociatedTokenPda({
    owner: address(owner),
    mint: address(mint),
    tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
  })
  const existing = await fetchMaybeToken(rpc, token)
  const ready =
    existing.exists && hasExtension(unwrapOption(existing.data.extensions) ?? undefined, 'ConfidentialTransferAccount')
  return { ready } satisfies IsAccountReadyResult
})

channel.on('prepareApplyPendingBalance', async (params) => {
  const { rpcUrl, mint, owner, amount } = params as PrepareApplyPendingBalanceParams
  await wasmInit
  const keys = sessionKeys.get(owner)
  if (!keys) throw new Error(`call deriveKeys("${owner}") before prepareApplyPendingBalance`)

  const rpc = createSolanaRpc(rpcUrl)
  const [token] = await findAssociatedTokenPda({
    owner: address(owner),
    mint: address(mint),
    tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
  })
  const tokenAccount = await fetchToken(rpc, token)
  const current = decryptConfidentialTransferBalance({
    tokenAccount: tokenAccount.data,
    elgamalSecretKey: keys.elgamalKeypair.secret(),
    aesKey: keys.aesKey,
  })

  // Both terms account for what will have already happened on-chain by the time this
  // instruction runs (Deposit, earlier in the same transaction): the deposited amount is about
  // to land in pending, and applying sweeps *all* pending (any the account already had, plus
  // this deposit) into available — not just this deposit's amount alone.
  const newAvailable = current.availableBalance + current.pendingBalance + BigInt(amount)
  const newDecryptableAvailableBalance = keys.aesKey.encrypt(newAvailable).toBytes()
  const expectedPendingBalanceCreditCounter = current.pendingBalanceCreditCounter + 1n

  return {
    newDecryptableAvailableBalanceBase64: bytesToBase64(newDecryptableAvailableBalance),
    expectedPendingBalanceCreditCounter: expectedPendingBalanceCreditCounter.toString(),
  } satisfies PrepareApplyPendingBalanceResult
})

// --- Phase 11: activity decryption ---
// Verified against a real devnet transfer with a known amount (see git history for the one-off
// research script that confirmed this) — none of these constants are documented in
// @solana/zk-sdk's public TS bindings, which expose the proof context as opaque toBytes()/
// fromBytes() only, no field accessors.
const ZK_ELGAMAL_PROOF_PROGRAM_ADDRESS = 'ZkE1Gama1Proof11111111111111111111111111111'
const VERIFY_BATCHED_GROUPED_CIPHERTEXT_3_HANDLES_VALIDITY_DISCRIMINATOR = 12
const CONFIDENTIAL_TRANSFER_EXTENSION_DISCRIMINATOR = 27 // Token-2022's top-level instruction byte
const CONFIDENTIAL_TRANSFER_SUB_DISCRIMINATOR = 7 // the extension's own "Transfer" sub-instruction
const TRANSFER_AMOUNT_LO_BIT_LENGTH = 16n
// context = 3x32-byte pubkeys (first/second/third, matching the proof's constructor order) +
// grouped_ciphertext_lo (128 bytes) + grouped_ciphertext_hi (128 bytes).
const PROOF_CONTEXT_PUBKEYS_SIZE = 96
const GROUPED_CIPHERTEXT_SIZE = 128 // 32-byte commitment + 3x32-byte handles
// Handle order within a grouped ciphertext, fixed by how transfers are built
// (buildConfidentialTransferProofData: sourcePubkey, destinationPubkey, auditorPubkey).
const SOURCE_HANDLE_INDEX = 0
const DESTINATION_HANDLE_INDEX = 1

function combineAmounts(lo: bigint, hi: bigint, bitLength: bigint): bigint {
  return (hi << bitLength) + lo
}

// Not exported by @solana-program/token-2022's public API (only leaks into its dist/types, never
// re-exported from "." or "./confidential") despite being used internally — reimplemented from
// its own doc comment: "32-byte commitment followed by N 32-byte handles. The returned 64-byte
// array is [commitment, handle]."
function extractCiphertextFromGroupedBytes(grouped: Uint8Array, handleIndex: number): Uint8Array {
  const result = new Uint8Array(64)
  result.set(grouped.slice(0, 32), 0)
  result.set(grouped.slice(32 + handleIndex * 32, 32 + (handleIndex + 1) * 32), 32)
  return result
}

// Decrypts one handle (source or destination) of a ciphertext-validity proof instruction's amount,
// given that instruction's raw data (including its 1-byte discriminator prefix).
function decryptProofInstructionAmount(
  instructionData: Uint8Array,
  secretKey: ElGamalSecretKeyLike,
  handleIndex: number,
): bigint {
  const proofDataBytes = instructionData.slice(1) // strip the 1-byte VerifyProof discriminator
  const proofData = BatchedGroupedCiphertext3HandlesValidityProofData.fromBytes(proofDataBytes)
  const contextBytes = proofData.context().toBytes()
  const loBytes = contextBytes.slice(PROOF_CONTEXT_PUBKEYS_SIZE, PROOF_CONTEXT_PUBKEYS_SIZE + GROUPED_CIPHERTEXT_SIZE)
  const hiBytes = contextBytes.slice(
    PROOF_CONTEXT_PUBKEYS_SIZE + GROUPED_CIPHERTEXT_SIZE,
    PROOF_CONTEXT_PUBKEYS_SIZE + 2 * GROUPED_CIPHERTEXT_SIZE,
  )
  const handleLo = extractCiphertextFromGroupedBytes(loBytes, handleIndex)
  const handleHi = extractCiphertextFromGroupedBytes(hiBytes, handleIndex)
  const ciphertextLo = ElGamalCiphertext.fromBytes(handleLo)
  const ciphertextHi = ElGamalCiphertext.fromBytes(handleHi)
  if (!ciphertextLo || !ciphertextHi) throw new Error('invalid ciphertext bytes in proof instruction')
  const amountLo = secretKey.decrypt(ciphertextLo)
  const amountHi = secretKey.decrypt(ciphertextHi)
  return combineAmounts(amountLo, amountHi, TRANSFER_AMOUNT_LO_BIT_LENGTH)
}

type ElGamalSecretKeyLike = { decrypt(ciphertext: ElGamalCiphertext): bigint }

channel.on('decryptActivity', async (params) => {
  const { rpcUrl, mint, owner, limit } = params as DecryptActivityParams
  await wasmInit
  const keys = sessionKeys.get(owner)
  if (!keys) throw new Error(`call deriveKeys("${owner}") before decryptActivity`)

  const rpc = createSolanaRpc(rpcUrl)
  const ownerAddress = address(owner)
  const [token] = await findAssociatedTokenPda({
    owner: ownerAddress,
    mint: address(mint),
    tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
  })

  const signatures = await rpc.getSignaturesForAddress(token, { limit: limit ?? 20 }).send()
  const entries: DecryptActivityResult['entries'] = []

  for (const { signature, err } of signatures) {
    if (err) continue // failed transactions never landed a real transfer
    const tx = await rpc
      .getTransaction(signature, { commitment: 'confirmed', encoding: 'json', maxSupportedTransactionVersion: 0 })
      .send()
    if (!tx) continue

    const accountKeys = tx.transaction.message.accountKeys as unknown as string[]
    const instructions = tx.transaction.message.instructions as unknown as {
      programIdIndex: number
      accounts: number[]
      data: string
    }[]

    // Find this transaction's ConfidentialTransfer instruction (if any) to learn the direction —
    // source/destination token accounts are its first and third accounts (see
    // ConfidentialTransferInstruction's account list in the generated instruction).
    let direction: 'incoming' | 'outgoing' | null = null
    for (const ix of instructions) {
      const programId = accountKeys[ix.programIdIndex]
      if (programId !== TOKEN_2022_PROGRAM_ADDRESS) continue
      const data = base58ToBytes(ix.data)
      if (
        data[0] !== CONFIDENTIAL_TRANSFER_EXTENSION_DISCRIMINATOR ||
        data[1] !== CONFIDENTIAL_TRANSFER_SUB_DISCRIMINATOR
      )
        continue
      const sourceToken = accountKeys[ix.accounts[0]!]
      const destinationToken = accountKeys[ix.accounts[2]!]
      if (sourceToken === token) direction = 'outgoing'
      else if (destinationToken === token) direction = 'incoming'
      break
    }
    if (!direction) continue

    // Find the paired ciphertext-validity proof instruction in the same transaction and decrypt
    // the handle matching our direction (our own ElGamal key never decrypts the other party's
    // handle — that's the whole point of ElGamal's per-recipient handles).
    for (const ix of instructions) {
      const programId = accountKeys[ix.programIdIndex]
      if (programId !== ZK_ELGAMAL_PROOF_PROGRAM_ADDRESS) continue
      const raw = base58ToBytes(ix.data)
      if (raw[0] !== VERIFY_BATCHED_GROUPED_CIPHERTEXT_3_HANDLES_VALIDITY_DISCRIMINATOR) continue
      try {
        const handleIndex = direction === 'outgoing' ? SOURCE_HANDLE_INDEX : DESTINATION_HANDLE_INDEX
        const secretKey = keys.elgamalKeypair.secret()
        const amount = decryptProofInstructionAmount(raw, secretKey, handleIndex)
        entries.push({
          signature,
          direction,
          amount: amount.toString(),
          blockTime: tx.blockTime != null ? Number(tx.blockTime) : null,
        })
      } catch {
        // A proof instruction that doesn't decrypt cleanly with our key isn't ours to show —
        // skip rather than surface a broken entry.
      }
      break
    }
  }

  return { entries } satisfies DecryptActivityResult
})

function base58ToBytes(base58: string): Uint8Array {
  // json-encoded instruction data from getTransaction is base58, not base64 — reuse the same
  // small decode table @solana/kit's base58 codec uses, inlined to avoid a new dependency here.
  const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
  let value = 0n
  for (const char of base58) {
    const index = ALPHABET.indexOf(char)
    if (index === -1) throw new Error(`invalid base58 character: ${char}`)
    value = value * 58n + BigInt(index)
  }
  const bytes: number[] = []
  while (value > 0n) {
    bytes.unshift(Number(value % 256n))
    value /= 256n
  }
  for (const char of base58) {
    if (char !== '1') break
    bytes.unshift(0)
  }
  return new Uint8Array(bytes)
}
