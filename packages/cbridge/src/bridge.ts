// Entry point bundled by build.ts into a single local HTML file, loaded by rn-confidential's
// hidden WebView. Builds confidential-transfer instructions/proofs and transactions here (where
// WASM works); every signature — the one-time key-derivation signature and every transaction
// signature — round-trips to React Native (MWA) via the host methods in protocol.ts. This bridge
// never receives or stores an MWA-controlled private key, only the derived confidential keys,
// which live in memory for this WebView session only (cleared on reload / the app's "Lock" action).
import './installEd25519.ts'
import {
  address,
  appendTransactionMessageInstructions,
  createKeyPairSignerFromPrivateKeyBytes,
  createNoopSigner,
  createSignableMessage,
  createSolanaRpc,
  getBase58Decoder,
  getBase64EncodedWireTransaction,
  getCompiledTransactionMessageDecoder,
  getSignersFromTransactionMessage,
  getTransactionDecoder,
  getTransactionMessageSize,
  partiallySignTransaction,
  isTransactionModifyingSigner,
  isSolanaError,
  sequentialInstructionPlan,
  singleInstructionPlan,
  SOLANA_ERROR__ACCOUNTS__ACCOUNT_NOT_FOUND,
  some,
  unwrapOption,
  type Address,
  type Blockhash,
  type Instruction,
  type InstructionPlan,
  type KeyPairSigner,
  type MessagePartialSigner,
  type ReadonlyUint8Array,
  type SignatureDictionary,
  type Transaction,
  type TransactionModifyingSigner,
  type TransactionSigner,
  type TransactionWithinSizeLimit,
  type TransactionWithLifetime,
} from '@solana/kit'
import {
  ExtensionType,
  fetchMaybeToken,
  fetchToken,
  findAssociatedTokenPda,
  getApproveInstruction,
  getCloseAccountInstruction,
  getEnableCpiGuardInstruction,
  getReallocateInstruction,
  TOKEN_2022_PROGRAM_ADDRESS,
} from '@solana-program/token-2022'
import {
  findAssociatedTokenPda as findClassicAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstruction as getCreateClassicAtaIdempotentInstruction,
  getTransferInstruction as getClassicTransferInstruction,
  TOKEN_PROGRAM_ADDRESS,
} from '@solana-program/token'
import {
  decryptConfidentialTransferBalance,
  fetchConfidentialTransferBalance,
  getApplyConfidentialPendingBalanceInstructionFromToken,
  getConfidentialTransferInstructionPlan,
  getConfidentialWithdrawInstructionPlan,
  getCreateConfidentialTransferAccountInstructionPlan,
  getEmptyConfidentialTransferAccountInstructionPlan,
} from '@solana-program/token-2022/confidential'
import zkInit, {
  AeCiphertext,
  BatchedGroupedCiphertext3HandlesValidityProofData,
  ElGamalCiphertext,
} from '@solana/zk-sdk/web'
import { ristretto255 } from '@noble/curves/ed25519.js'
import type { AeKey, ElGamalKeypair } from '@solana/zk-sdk/web'
// Cross-workspace relative import (same pattern relayer/src/tier.ts already uses for the same
// generated client) — esbuild (this package's bundler) resolves it fine, unlike Metro.
import { envelopeVault } from '../../../anchor/src/index.ts'
import { ZK_SDK_WASM_BASE64 } from './generated/wasmBase64.ts'
import { deriveWalletConfidentialKeys } from './confidentialKeys.ts'
import { getTransferSolInstruction } from '@solana-program/system'
import { RpcChannel } from './rpcChannel.ts'
import { planMessages, signInstructionPlan, signPlannedMessages, type PlannedMessage } from './signPlan.ts'
import type {
  ApplyPendingBalanceParams,
  ApplyPendingBalanceResult,
  BuildBatchTransferPlanParams,
  CosignWithGasTankParams,
  CosignWithGasTankResult,
  GasTankAddressParams,
  GasTankAddressResult,
  BuildBatchTransferPlanResult,
  BuildTransferPlanParams,
  BuildTransferPlanResult,
  BuildWithdrawPlanParams,
  BuildWithdrawPlanResult,
  ClaimGiftParams,
  ClaimGiftResult,
  CloseGiftParams,
  CloseGiftResult,
  CreateGiftParams,
  CreateGiftResult,
  OpenGiftParams,
  OpenGiftResult,
  ClosePotParams,
  ClosePotResult,
  CreatePotParams,
  CreatePotResult,
  DecryptAvailableParams,
  DecryptAvailableResult,
  DecryptPotActivityParams,
  DecryptPotActivityResult,
  DeriveKeysParams,
  DeriveKeysResult,
  DerivePotKeysParams,
  DerivePotKeysResult,
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
  PotContribution,
  RestoreKeysParams,
  RestoreKeysResult,
  RestorePotKeysParams,
  RestorePotKeysResult,
  SignMessageResult,
  EnsureGasTankParams,
  EnsureGasTankResult,
  SignContinuationParams,
  SignContinuationResult,
  SignTransactionsResult,
} from './protocol.ts'

// Matches roundtrip.ts's MAX_PENDING_BALANCE_CREDIT_COUNTER — how many unapplied confidential
// deposits/transfers an account can queue before `applyPendingBalance` must run before another
// lands. 65,536 is the standard default across the ecosystem's confidential-transfer tooling.
const MAX_PENDING_BALANCE_CREDIT_COUNTER = 65_536n

// cUSDC's decimals (Phase 1's setup-mints.ts) — only needed by the two methods that bridge
// between the confidential and public balances (buildWithdrawPlan here; wrap/Deposit are built
// in RN directly, with their own copy of this same constant).
const CUSDC_DECIMALS = 6

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
const wasmInit = zkInit({ module_or_path: base64ToBytes(ZK_SDK_WASM_BASE64) }).then(() => {
  wasmReady = true
})

const channel = new RpcChannel((text) => window.ReactNativeWebView?.postMessage(text), 'bridge')
window.addEventListener('message', (event) => channel.receive(String(event.data)))
// Android WebViews deliver postMessage on `document`, not `window` — listen on both.
document.addEventListener('message', (event) => channel.receive(String((event as MessageEvent).data)))

const sessionKeys = new Map<string, { elgamalKeypair: ElGamalKeypair; aesKey: AeKey }>()

// Each wallet's "gas tank": a keypair the bridge controls, used to pay for and sign transactions
// that don't need the wallet's own authority — the proof-context setup a withdraw needs before
// the withdraw itself. Those can then be signed and sent instantly instead of waiting on a wallet
// approval, which matters because a wallet approval (Solflare: ~6s to open, then the user's
// review) can outlast a blockhash (~36s on devnet at times), and the setup is several transactions
// that Solflare can't even simulate in advance. Derived from the same derivation signature as the
// confidential keys (domain-separated), so it's recoverable on any device and never stored; it
// only ever holds a small float of SOL the wallet tops up (see ensureGasTank).
const gasTanks = new Map<string, KeyPairSigner>()

async function deriveGasTank(derivationSignature: Uint8Array): Promise<KeyPairSigner> {
  const domain = new TextEncoder().encode('envelope-gas-tank:')
  const input = new Uint8Array(domain.length + derivationSignature.length)
  input.set(domain)
  input.set(derivationSignature, domain.length)
  const seed = new Uint8Array(await crypto.subtle.digest('SHA-256', input))
  return createKeyPairSignerFromPrivateKeyBytes(seed)
}

// Enough for one withdraw's proof contexts (rent, refunded when they close) plus its transaction
// fees, with room to spare; topped up to the higher figure so it isn't needed every time.
const GAS_TANK_MINIMUM_LAMPORTS = 10_000_000n // 0.01 SOL
const GAS_TANK_TOP_UP_TO_LAMPORTS = 25_000_000n // 0.025 SOL

// Phase 15: a pot's own Ed25519 signing identity, kept separately from `sessionKeys` (which only
// ever holds confidential-balance encryption keys, never a signing key — the wallet's own signing
// always stays in MWA). A pot's signer DOES live here, since it's derived entirely in-bridge and
// MWA has no way to sign for an address it doesn't control. `createHostTransactionSigner`/
// `createHostMessageSigner` check this map first before assuming an address needs an MWA round trip.
const potSigners = new Map<string, KeyPairSigner>()

// Second halves of staged plans (see BuildWithdrawPlanParams), kept until the host asks for them.
// In-memory only, like the session keys: a reload simply means starting the withdraw over.
const continuations = new Map<string, PlannedMessage[]>()

// One fixed MWA signature over this per-pot message is the only secret a pot's whole identity
// (signing key + confidential-balance keys) is derived from — SHA-256 of the signature gives a
// deterministic 32-byte Ed25519 seed. Never the wallet's own derivation message
// (`solana-conf-bal/v1`): that's wallet-scoped and would collide across every pot a host creates.
function potDerivationMessage(potId: string): Uint8Array {
  return new TextEncoder().encode(`envelope-pot:${potId}`)
}

async function derivePotSignerFromSignature(signature: Uint8Array): Promise<KeyPairSigner> {
  const signatureCopy = Uint8Array.from(signature)
  const seed = new Uint8Array(await crypto.subtle.digest('SHA-256', signatureCopy))
  return createKeyPairSignerFromPrivateKeyBytes(seed)
}

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

// A *modifying* signer, not a partial one: real wallets rewrite what they sign (Solflare appends
// ComputeBudget priority-fee instructions to every transaction), so a bare signature returned
// for our original message would fail on-chain signature verification — the transaction the
// wallet hands back is adopted whole. signPlan.ts sends every transaction a flow needs from the
// wallet through one call here, so the user sees one approval screen per flow.
function createHostTransactionSigner(owner: Address): TransactionSigner {
  const potSigner = potSigners.get(owner)
  if (potSigner) return potSigner

  const signer: TransactionModifyingSigner = {
    address: owner,
    async modifyAndSignTransactions(transactions) {
      const { signedTransactionsBase64 } = await channel.call<SignTransactionsResult>('signTransactions', {
        address: owner,
        transactionsBase64: transactions.map((transaction) => getBase64EncodedWireTransaction(transaction)),
      })
      if (signedTransactionsBase64.length !== transactions.length) {
        throw new Error('The wallet returned a different number of transactions than it was asked to sign.')
      }
      return signedTransactionsBase64.map((signedBase64, i) => {
        const walletTransaction = getTransactionDecoder().decode(base64ToBytes(signedBase64))
        if (!walletTransaction.signatures[owner]) {
          throw new Error('The wallet returned a transaction without signing it.')
        }
        // The host restamps each transaction with a blockhash fetched once the wallet session is
        // open (src/features/wallet/use-wallet-signing.ts), so the returned blockhash is the one
        // that counts. Its exact last-valid height isn't known here; nothing downstream uses it —
        // the host just submits, and an expired submission is retried from scratch.
        const original = (transactions[i] as Partial<TransactionWithLifetime>).lifetimeConstraint
        const blockhash = getCompiledTransactionMessageDecoder().decode(walletTransaction.messageBytes)
          .lifetimeToken as Blockhash
        return {
          ...walletTransaction,
          lifetimeConstraint: {
            blockhash,
            lastValidBlockHeight: original && 'lastValidBlockHeight' in original ? original.lastValidBlockHeight : 0n,
          },
        } as Transaction & TransactionWithinSizeLimit & TransactionWithLifetime
      })
    },
  }
  return signer
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
  gasTanks.set(owner, await deriveGasTank(signature))
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
  gasTanks.set(owner, await deriveGasTank(signature))
  const elgamalPubkeyBase58 = getBase58Decoder().decode(keys.elgamalKeypair.pubkey().toBytes())
  return { elgamalPubkeyBase58 } satisfies RestoreKeysResult
})

channel.on('derivePotKeys', async (params) => {
  const { owner, potId } = params as DerivePotKeysParams
  await wasmInit
  const hostAddress = address(owner)
  let signature: Uint8Array | undefined
  const hostSigner = createHostMessageSigner(hostAddress, (sig) => {
    signature = sig
  })
  await hostSigner.signMessages([createSignableMessage(potDerivationMessage(potId))])
  if (!signature) throw new Error('derivePotKeys: no derivation signature captured')

  const potSigner = await derivePotSignerFromSignature(signature)
  potSigners.set(potSigner.address, potSigner)
  const keys = await deriveWalletConfidentialKeys(potSigner)
  sessionKeys.set(potSigner.address, keys)

  const elgamalPubkeyBase58 = getBase58Decoder().decode(keys.elgamalKeypair.pubkey().toBytes())
  return {
    potOwnerAddress: potSigner.address,
    elgamalPubkeyBase58,
    signatureBase64: bytesToBase64(signature),
  } satisfies DerivePotKeysResult
})

channel.on('restorePotKeys', async (params) => {
  const { signatureBase64 } = params as RestorePotKeysParams
  await wasmInit
  const signature = base64ToBytes(signatureBase64)

  const potSigner = await derivePotSignerFromSignature(signature)
  potSigners.set(potSigner.address, potSigner)
  const keys = await deriveWalletConfidentialKeys(potSigner)
  sessionKeys.set(potSigner.address, keys)

  const elgamalPubkeyBase58 = getBase58Decoder().decode(keys.elgamalKeypair.pubkey().toBytes())
  return { potOwnerAddress: potSigner.address, elgamalPubkeyBase58 } satisfies RestorePotKeysResult
})

channel.on('lockKeys', async (_params) => {
  void (_params as LockKeysParams)
  sessionKeys.clear()
  return { ok: true } satisfies LockKeysResult
})

// Free-tier senders (owner asked the relayer's GET /tier/:wallet) prepend a small, separate SKR
// fee transaction — same owner-signs/relayer-noop-payer pattern, built and signed here (not in
// React Native) so it reuses the exact same MWA round-trip and never needs its own Solana
// instruction-building code on the native side. Signed in the same call as the transfer(s) so the
// wallet shows one approval for everything.
async function buildFeePlan(
  ownerAddress: Address,
  relayerAddress: Address,
  feeInstruction: NonNullable<BuildTransferPlanParams['feeInstruction']>,
  signer: TransactionSigner,
): Promise<InstructionPlan> {
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
  return singleInstructionPlan(
    getClassicTransferInstruction({
      source: ownerSkrAta,
      destination: relayerSkrAta,
      authority: signer,
      amount: BigInt(feeInstruction.amount),
    }),
  )
}

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

  // Free-tier senders (owner asked the relayer's GET /tier/:wallet) prepend a small, separate SKR
  // fee transaction — same owner-signs/relayer-noop-payer pattern, built and signed here (not in
  // React Native) so it reuses the exact same MWA round-trip and never needs its own Solana
  // instruction-building code on the native side. Signed in the same signInstructionPlan call as
  // the transfer so the wallet shows one approval for both, and each gets its own nonce.
  const feePlan = feeInstruction ? await buildFeePlan(ownerAddress, relayerAddress, feeInstruction, signer) : null

  // Two stages (see BuildTransferPlanResult): every transaction before the first one the wallet
  // must sign is proof setup — signed now (relayer slot left empty, one-time keypairs sign here)
  // and relayed first, with no approval. The rest — the transfer itself (and the free-tier fee) —
  // waits as a continuation, signed only once the setup has landed, so the wallet's approval and
  // the relay happen back to back on a fresh blockhash instead of the transfer waiting behind
  // every proof transaction's submission and confirmation (which outlasted its blockhash), and
  // so the wallet can simulate it against proof accounts that already exist.
  const transferMessages = await planMessages(plan, relayerSigner)
  const firstWalletIndex = transferMessages.findIndex((message) =>
    getSignersFromTransactionMessage(message).some(isTransactionModifyingSigner),
  )
  const setupMessages = firstWalletIndex === -1 ? transferMessages : transferMessages.slice(0, firstWalletIndex)
  const finalMessages = [
    ...(feePlan ? await planMessages(feePlan, relayerSigner) : []),
    ...(firstWalletIndex === -1 ? [] : transferMessages.slice(firstWalletIndex)),
  ]

  const continuationId = `transfer-${owner}-${Date.now()}`
  // Fee and transfer as one transaction where they fit: one thing for the wallet to show.
  continuations.set(continuationId, packMessages(finalMessages))
  const signedTransactions = await signPlannedMessages(setupMessages, rpc)
  return { signedTransactions, continuationId } satisfies BuildTransferPlanResult
})

// See BuildBatchTransferPlanParams. Each transfer's proofs are computed from the source balance
// the previous transfer leaves behind: its encrypted available balance minus that transfer's
// source-side ciphertexts (exactly what Token-2022 computes on-chain), and a fresh AES encryption
// of the remaining amount (any encryption of the right amount works — only the equality proof's
// ciphertext has to match the chain bit for bit).
channel.on('buildBatchTransferPlan', async (params) => {
  const { rpcUrl, mint, owner, transfers, feePayer, feeInstruction } = params as BuildBatchTransferPlanParams
  await wasmInit
  const keys = sessionKeys.get(owner)
  if (!keys) throw new Error(`call deriveKeys("${owner}") before buildBatchTransferPlan`)
  if (transfers.length === 0) throw new Error('no transfers to send')

  const rpc = createSolanaRpc(rpcUrl)
  const mintAddress = address(mint)
  const ownerAddress = address(owner)
  const relayerAddress = address(feePayer)
  const signer = createHostTransactionSigner(ownerAddress)
  const relayerSigner = createNoopSigner(relayerAddress)

  const [sourceToken] = await findAssociatedTokenPda({
    owner: ownerAddress,
    mint: mintAddress,
    tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
  })
  let sourceState = (await fetchToken(rpc, sourceToken)).data
  let remaining = keys.aesKey.decrypt(
    AeCiphertext.fromBytes(new Uint8Array(confidentialAccountOf(sourceState).decryptableAvailableBalance))!,
  )
  const total = transfers.reduce((sum, transfer) => sum + BigInt(transfer.amount), 0n)
  if (total > remaining) throw new Error('insufficient private balance for this batch')

  const setupMessages: PlannedMessage[] = []
  const finalMessages: PlannedMessage[] = feeInstruction
    ? await planMessages(await buildFeePlan(ownerAddress, relayerAddress, feeInstruction, signer), relayerSigner)
    : []

  for (const { destinationOwner, amount } of transfers) {
    const [destinationToken] = await findAssociatedTokenPda({
      owner: address(destinationOwner),
      mint: mintAddress,
      tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
    })
    const destinationAccount = await fetchToken(rpc, destinationToken)
    const plan = await getConfidentialTransferInstructionPlan({
      sourceToken,
      destinationToken,
      mint: mintAddress,
      sourceTokenAccount: sourceState,
      destinationTokenAccount: destinationAccount.data,
      authority: signer,
      amount: BigInt(amount),
      sourceElgamalKeypair: keys.elgamalKeypair,
      aesKey: keys.aesKey,
      payer: relayerSigner,
      rpc,
    })
    const messages = await planMessages(plan, relayerSigner)
    const firstWalletIndex = messages.findIndex((message) =>
      getSignersFromTransactionMessage(message).some(isTransactionModifyingSigner),
    )
    if (firstWalletIndex <= 0) throw new Error('unexpected transfer plan shape')
    const setup = messages.slice(0, firstWalletIndex)
    setupMessages.push(...setup)
    finalMessages.push(...messages.slice(firstWalletIndex))

    // Advance the source balance to what this transfer leaves behind, for the next one's proofs.
    const validityProof = setup
      .flatMap((message) => message.instructions)
      .find(
        (instruction) =>
          instruction.programAddress === ZK_ELGAMAL_PROOF_PROGRAM_ADDRESS &&
          instruction.data?.[0] === VERIFY_BATCHED_GROUPED_CIPHERTEXT_3_HANDLES_VALIDITY_DISCRIMINATOR,
      )
    if (!validityProof?.data) throw new Error('transfer plan has no ciphertext validity proof')
    const [sourceLo, sourceHi] = proofInstructionCiphertexts(new Uint8Array(validityProof.data), SOURCE_HANDLE_INDEX)
    remaining -= BigInt(amount)
    sourceState = withAvailableBalance(
      sourceState,
      subtractWithLoHiCiphertexts(
        new Uint8Array(confidentialAccountOf(sourceState).availableBalance),
        sourceLo,
        sourceHi,
        TRANSFER_AMOUNT_LO_BIT_LENGTH,
      ),
      keys.aesKey.encrypt(remaining).toBytes(),
    )
  }

  // The transfers go into as few transactions as fit. Each one's proofs assume the balance the one
  // before leaves, so a wallet simulating them as separate transactions (against the chain as it
  // is now) sees every transfer after the first fail ("Simulation failed"), even though they land
  // fine in order. Inside one transaction the simulation runs them in order and passes.
  const continuationId = `batch-${owner}-${Date.now()}`
  const packed = packMessages(finalMessages)
  continuations.set(continuationId, packed)
  const transfersPerTransaction = packed.map(
    (message) =>
      message.instructions.filter(
        (instruction) =>
          instruction.programAddress === TOKEN_2022_PROGRAM_ADDRESS &&
          instruction.data?.[0] === CONFIDENTIAL_TRANSFER_EXTENSION_DISCRIMINATOR &&
          instruction.data?.[1] === CONFIDENTIAL_TRANSFER_SUB_DISCRIMINATOR,
      ).length,
  )
  const signedTransactions = await signPlannedMessages(setupMessages, rpc)
  return { signedTransactions, continuationId, transfersPerTransaction } satisfies BuildBatchTransferPlanResult
})

// Leaves room under the 1232-byte limit for what wallets add while signing (Solflare appends
// compute-budget instructions).
const PACKED_MESSAGE_BUDGET = 1232 - 100

// Merges consecutive messages (same fee payer) into as few as fit the budget, in order.
function packMessages(messages: PlannedMessage[]): PlannedMessage[] {
  const packed: PlannedMessage[] = []
  for (const message of messages) {
    const last = packed[packed.length - 1]
    if (last && last.feePayer.address === message.feePayer.address) {
      const merged = appendTransactionMessageInstructions(message.instructions, last)
      if (getTransactionMessageSize(merged) <= PACKED_MESSAGE_BUDGET) {
        packed[packed.length - 1] = merged
        continue
      }
    }
    packed.push(message)
  }
  return packed
}

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

  try {
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
  } catch (err) {
    // The wallet's confidential token account doesn't exist yet (never enabled, or the enable
    // transaction hasn't landed) — a normal pre-setup state, not a failure to surface as an error.
    if (isSolanaError(err, SOLANA_ERROR__ACCOUNTS__ACCOUNT_NOT_FOUND)) {
      return { availableBalance: '0', pendingBalance: '0' } satisfies DecryptAvailableResult
    }
    throw err
  }
})

channel.on('applyPendingBalance', async (params) => {
  const { rpcUrl, mint, owner, payer } = params as ApplyPendingBalanceParams
  await wasmInit
  const keys = sessionKeys.get(owner)
  if (!keys) throw new Error(`call deriveKeys("${owner}") before applyPendingBalance`)

  const rpc = createSolanaRpc(rpcUrl)
  const mintAddress = address(mint)
  const ownerAddress = address(owner)
  const signer = createHostTransactionSigner(ownerAddress)
  // A pot's apply is paid on the host's behalf: by the host's gas tank when it has one, so the
  // pot's own keypair (no approval needed) is the only signer and closing a pot needs no extra
  // wallet approval for it.
  const payerSigner = payer ? (gasTanks.get(payer) ?? createHostTransactionSigner(address(payer))) : signer

  const [token] = await findAssociatedTokenPda({
    owner: ownerAddress,
    mint: mintAddress,
    tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
  })

  let tokenAccount
  try {
    tokenAccount = await fetchToken(rpc, token)
  } catch (err) {
    // No confidential token account yet (never enabled) — nothing to apply, not a failure.
    if (isSolanaError(err, SOLANA_ERROR__ACCOUNTS__ACCOUNT_NOT_FOUND)) {
      return { signedTransactions: [] } satisfies ApplyPendingBalanceResult
    }
    throw err
  }

  const balance = await fetchConfidentialTransferBalance({
    token,
    rpc,
    elgamalSecretKey: keys.elgamalKeypair.secret(),
    aesKey: keys.aesKey,
  })
  if (balance.pendingBalance === 0n) {
    return { signedTransactions: [] } satisfies ApplyPendingBalanceResult
  }

  const instruction = getApplyConfidentialPendingBalanceInstructionFromToken({
    token,
    tokenAccount: tokenAccount.data,
    authority: signer,
    elgamalSecretKey: keys.elgamalKeypair.secret(),
    aesKey: keys.aesKey,
  })
  const signedTransactions = await signInstructionPlan(singleInstructionPlan(instruction), payerSigner, rpc)
  return { signedTransactions } satisfies ApplyPendingBalanceResult
})

// The wallet's gas tank address, so the app can check its balance and ask the relayer to refuel
// it with SKR (POST /fuel).
channel.on('gasTankAddress', async (params) => {
  const { owner } = params as GasTankAddressParams
  const gasTank = gasTanks.get(owner)
  if (!gasTank) throw new Error(`call deriveKeys("${owner}") before gasTankAddress`)
  return { address: gasTank.address } satisfies GasTankAddressResult
})

// Adds the gas tank's signature to transactions the app built with the tank as fee payer and/or
// rent payer (deposits, membership passes) — after the wallet has signed, since wallets can
// rewrite the message they sign (Solflare adds compute-budget instructions).
channel.on('cosignWithGasTank', async (params) => {
  const { owner, transactionsBase64 } = params as CosignWithGasTankParams
  const gasTank = gasTanks.get(owner)
  if (!gasTank) throw new Error(`call deriveKeys("${owner}") before cosignWithGasTank`)
  const signed = await Promise.all(
    transactionsBase64.map(async (base64) => {
      const transaction = getTransactionDecoder().decode(base64ToBytes(base64))
      return getBase64EncodedWireTransaction(await partiallySignTransaction([gasTank.keyPair], transaction))
    }),
  )
  return { transactionsBase64: signed } satisfies CosignWithGasTankResult
})

channel.on('ensureGasTank', async (params) => {
  const { rpcUrl, owner } = params as EnsureGasTankParams
  const gasTank = gasTanks.get(owner)
  if (!gasTank) throw new Error(`call deriveKeys("${owner}") before ensureGasTank`)
  const rpc = createSolanaRpc(rpcUrl)
  const { value: balance } = await rpc.getBalance(gasTank.address).send()
  if (balance >= GAS_TANK_MINIMUM_LAMPORTS) return { signedTransactions: [] } satisfies EnsureGasTankResult

  const signer = createHostTransactionSigner(address(owner))
  const topUp = getTransferSolInstruction({
    source: signer,
    destination: gasTank.address,
    amount: GAS_TANK_TOP_UP_TO_LAMPORTS - balance,
  })
  return {
    signedTransactions: await signInstructionPlan(singleInstructionPlan(topUp), signer, rpc),
  } satisfies EnsureGasTankResult
})

channel.on('buildWithdrawPlan', async (params) => {
  const { rpcUrl, mint, underlyingMint, owner, amount } = params as BuildWithdrawPlanParams
  await wasmInit
  const keys = sessionKeys.get(owner)
  if (!keys) throw new Error(`call deriveKeys("${owner}") before buildWithdrawPlan`)

  const gasTank = gasTanks.get(owner)
  if (!gasTank) throw new Error(`call deriveKeys("${owner}") before buildWithdrawPlan`)

  const rpc = createSolanaRpc(rpcUrl)
  const mintAddress = address(mint)
  const ownerAddress = address(owner)
  const signer = createHostTransactionSigner(ownerAddress)

  const [token] = await findAssociatedTokenPda({
    owner: ownerAddress,
    mint: mintAddress,
    tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
  })
  const tokenAccount = await fetchToken(rpc, token)

  // The gas tank pays for — and, as context-state authority, later closes — the proof contexts;
  // the wallet is only the withdraw's authority (and the final transaction's fee payer, below).
  const plan = await getConfidentialWithdrawInstructionPlan({
    token,
    mint: mintAddress,
    tokenAccount: tokenAccount.data,
    authority: signer,
    amount: BigInt(amount),
    decimals: CUSDC_DECIMALS,
    elgamalKeypair: keys.elgamalKeypair,
    aesKey: keys.aesKey,
    payer: gasTank,
    rpc,
  })
  const messages = await planMessages(plan, gasTank)

  // Everything up to the transaction carrying the ConfidentialWithdraw instruction is proof setup
  // (create + verify the equality and range proof contexts); that one transaction and anything
  // after it depends on the setup having landed (see BuildWithdrawPlanParams).
  const withdrawIndex = messages.findIndex((message) =>
    message.instructions.some(
      (instruction) =>
        instruction.programAddress === TOKEN_2022_PROGRAM_ADDRESS &&
        instruction.data?.[0] === CONFIDENTIAL_TRANSFER_EXTENSION_DISCRIMINATOR &&
        instruction.data?.[1] === CONFIDENTIAL_WITHDRAW_SUB_DISCRIMINATOR,
    ),
  )
  if (withdrawIndex <= 0) throw new Error('unexpected withdraw plan shape')

  const [configAddress] = await envelopeVault.findConfigPda()
  const [vaultAuthority] = await envelopeVault.findVaultAuthorityPda()
  const vaultConfig = await envelopeVault.fetchConfig(rpc, configAddress)
  const underlyingMintAddress = address(underlyingMint)
  const [userUnderlying] = await findClassicAssociatedTokenPda({
    owner: ownerAddress,
    mint: underlyingMintAddress,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  })
  // USDC <-> cUSDC is the vault's original pair (`unwrap`, Config's own fields); any other asset
  // (SKR <-> cSKR) is registered as an AssetVault and goes through `unwrap_asset`.
  const isUsdc = underlyingMintAddress === vaultConfig.data.usdcMint
  if (isUsdc && mintAddress !== vaultConfig.data.cusdcMint) throw new Error('mint is not cUSDC')
  const unwrapInstruction = isUsdc
    ? await envelopeVault.getUnwrapInstructionAsync({
        user: signer,
        cusdcMint: mintAddress,
        userCusdc: token,
        vaultUsdc: vaultConfig.data.vaultUsdc,
        userUsdc: userUnderlying,
        amount: BigInt(amount),
      })
    : await (async () => {
        const [assetVaultAddress] = await envelopeVault.findAssetVaultPda({ underlyingMint: underlyingMintAddress })
        const assetVault = await envelopeVault.fetchAssetVault(rpc, assetVaultAddress)
        if (assetVault.data.confidentialMint !== mintAddress) throw new Error('mint does not match this asset')
        return envelopeVault.getUnwrapAssetInstructionAsync({
          user: signer,
          underlyingMint: underlyingMintAddress,
          confidentialMint: mintAddress,
          userConfidential: token,
          vaultTokenAccount: assetVault.data.vaultTokenAccount,
          userUnderlying,
          amount: BigInt(amount),
        })
      })()
  const unwrapInstructions = [
    // The wallet may never have held the underlying token (someone who only ever *received* cSKR,
    // say): create its account if missing, paid by the gas tank.
    getCreateClassicAtaIdempotentInstruction({
      payer: gasTank,
      ata: userUnderlying,
      owner: ownerAddress,
      mint: underlyingMintAddress,
    }),
    getApproveInstruction(
      { source: token, delegate: vaultAuthority, owner: signer, amount: BigInt(amount) },
      { programAddress: TOKEN_2022_PROGRAM_ADDRESS },
    ),
    unwrapInstruction,
  ]
  // The final transaction is the one the wallet approves; the gas tank pays its fee too (it also
  // signs to close the proof contexts), so a withdraw needs no SOL in the wallet (SKR fuel).
  const finalMessages = messages.slice(withdrawIndex)
  finalMessages[0] = appendTransactionMessageInstructions(unwrapInstructions, finalMessages[0]!)

  const continuationId = `withdraw-${owner}-${Date.now()}`
  continuations.set(continuationId, finalMessages)
  const signedTransactions = await signPlannedMessages(messages.slice(0, withdrawIndex), rpc)
  return { signedTransactions, continuationId } satisfies BuildWithdrawPlanResult
})

channel.on('signContinuation', async (params) => {
  const { rpcUrl, continuationId, from = 0, count } = params as SignContinuationParams
  const messages = continuations.get(continuationId)
  if (!messages) throw new Error('nothing to continue — start the withdraw again')
  const slice = messages.slice(from, count === undefined ? undefined : from + count)
  const signedTransactions = await signPlannedMessages(slice, createSolanaRpc(rpcUrl))
  return { signedTransactions, total: messages.length } satisfies SignContinuationResult
})

function hasExtension(extensions: { __kind: string }[] | undefined, kind: string): boolean {
  return extensions?.some((extension) => extension.__kind === kind) ?? false
}

function hasCpiGuardEnabled(extensions: { __kind: string; lockCpi?: boolean }[] | undefined): boolean {
  return extensions?.some((extension) => extension.__kind === 'CpiGuard' && extension.lockCpi === true) ?? false
}

// Shared by ensureAccountReady and createPot's pot-account setup — `owner` is the account's
// confidential-transfer authority (signs every step), `payer` covers rent/fees (defaults to the
// same signer; a pot passes its host instead, since the pot itself never holds SOL).
async function buildEnsureAccountReadySteps(
  rpc: ReturnType<typeof createSolanaRpc>,
  mintAddress: Address,
  owner: TransactionSigner,
  payer: TransactionSigner,
  keys: { elgamalKeypair: ElGamalKeypair; aesKey: AeKey },
): Promise<{ token: Address; steps: (Instruction | InstructionPlan)[] }> {
  const [token] = await findAssociatedTokenPda({
    owner: owner.address,
    mint: mintAddress,
    tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
  })
  const existing = await fetchMaybeToken(rpc, token)
  const extensions = existing.exists ? (unwrapOption(existing.data.extensions) ?? undefined) : undefined

  const steps: (Instruction | InstructionPlan)[] = []

  if (!hasExtension(extensions, 'ConfidentialTransferAccount')) {
    steps.push(
      await getCreateConfidentialTransferAccountInstructionPlan({
        payer,
        owner,
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
          payer,
          owner,
          newExtensionTypes: [ExtensionType.CpiGuard],
        }),
      )
    }
    steps.push(getEnableCpiGuardInstruction({ token, owner }))
  }

  return { token, steps }
}

channel.on('ensureAccountReady', async (params) => {
  const { rpcUrl, mint, extraMints, owner, payer, payWithGasTank } = params as EnsureAccountReadyParams
  await wasmInit
  const keys = sessionKeys.get(owner)
  if (!keys) throw new Error(`call deriveKeys("${owner}") before ensureAccountReady`)

  const rpc = createSolanaRpc(rpcUrl)
  const ownerAddress = address(owner)
  const signer = createHostTransactionSigner(ownerAddress)
  const gasTank = gasTanks.get(owner)
  if (payWithGasTank && !gasTank) throw new Error(`call deriveKeys("${owner}") before ensureAccountReady`)
  // SKR fuel: the gas tank pays the accounts' rent and the fees; the wallet only authorizes.
  const payerSigner = payWithGasTank ? gasTank! : payer ? createHostTransactionSigner(address(payer)) : signer

  // Every token's setup in one plan, so the wallet approves them all in a single request.
  const steps = []
  for (const tokenMint of [mint, ...(extraMints ?? [])]) {
    steps.push(...(await buildEnsureAccountReadySteps(rpc, address(tokenMint), signer, payerSigner, keys)).steps)
  }

  if (steps.length === 0) {
    return { alreadyReady: true, signedTransactions: [] } satisfies EnsureAccountReadyResult
  }

  const signedTransactions = await signInstructionPlan(sequentialInstructionPlan(steps), payerSigner, rpc)
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

  // No confidential token account yet means this is the first-ever deposit (the account gets
  // created earlier in this same transaction) — starts from a zero balance, not a fetch error.
  let current = { availableBalance: 0n, pendingBalance: 0n, pendingBalanceCreditCounter: 0n }
  try {
    const tokenAccount = await fetchToken(rpc, token)
    current = decryptConfidentialTransferBalance({
      tokenAccount: tokenAccount.data,
      elgamalSecretKey: keys.elgamalKeypair.secret(),
      aesKey: keys.aesKey,
    })
  } catch (err) {
    if (!isSolanaError(err, SOLANA_ERROR__ACCOUNTS__ACCOUNT_NOT_FOUND)) throw err
  }

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
const CONFIDENTIAL_WITHDRAW_SUB_DISCRIMINATOR = 6 // ...and its "Withdraw" sub-instruction
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

// ElGamal ciphertext arithmetic, as @solana-program/token-2022 does it internally (its
// confidentialTransferArithmetic.ts — not exported): `left - (lo + hi << bitLength)`, applied to the
// commitment and the handle alike. @solana/zk-sdk doesn't expose ciphertext arithmetic yet.
function ciphertextPoints(ciphertext: Uint8Array) {
  return {
    commitment: ristretto255.Point.fromBytes(ciphertext.slice(0, 32)),
    handle: ristretto255.Point.fromBytes(ciphertext.slice(32, 64)),
  }
}

function subtractWithLoHiCiphertexts(left: Uint8Array, lo: Uint8Array, hi: Uint8Array, bitLength: bigint): Uint8Array {
  const scale = 1n << bitLength
  const [l, a, b] = [ciphertextPoints(left), ciphertextPoints(lo), ciphertextPoints(hi)]
  const result = new Uint8Array(64)
  result.set(l.commitment.subtract(a.commitment.add(b.commitment.multiply(scale))).toBytes(), 0)
  result.set(l.handle.subtract(a.handle.add(b.handle.multiply(scale))).toBytes(), 32)
  return result
}

type TokenAccountData = Awaited<ReturnType<typeof fetchToken>>['data']

function confidentialAccountOf(account: TokenAccountData) {
  const extension = (unwrapOption(account.extensions) ?? []).find(
    (candidate) => candidate.__kind === 'ConfidentialTransferAccount',
  )
  if (extension?.__kind !== 'ConfidentialTransferAccount') {
    throw new Error('account has no confidential transfer extension')
  }
  return extension
}

// The same account, as it will be once a transfer from it lands (see buildBatchTransferPlan).
function withAvailableBalance(
  account: TokenAccountData,
  availableBalance: Uint8Array,
  decryptableAvailableBalance: Uint8Array,
): TokenAccountData {
  const extensions = (unwrapOption(account.extensions) ?? []).map((extension) =>
    extension.__kind === 'ConfidentialTransferAccount'
      ? { ...extension, availableBalance, decryptableAvailableBalance }
      : extension,
  )
  return { ...account, extensions: some(extensions) }
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

// One handle's lo/hi ciphertexts (64 bytes each: commitment + that handle) from a ciphertext-validity
// proof instruction's raw data (including its 1-byte discriminator prefix).
function proofInstructionCiphertexts(instructionData: Uint8Array, handleIndex: number): [Uint8Array, Uint8Array] {
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

// Decrypts one handle (source or destination) of a ciphertext-validity proof instruction's amount,
// given that instruction's raw data (including its 1-byte discriminator prefix).
function decryptProofInstructionAmount(
  instructionData: Uint8Array,
  secretKey: ElGamalSecretKeyLike,
  handleIndex: number,
): bigint {
  const [handleLo, handleHi] = proofInstructionCiphertexts(instructionData, handleIndex)
  const ciphertextLo = ElGamalCiphertext.fromBytes(handleLo)
  const ciphertextHi = ElGamalCiphertext.fromBytes(handleHi)
  if (!ciphertextLo || !ciphertextHi) throw new Error('invalid ciphertext bytes in proof instruction')
  const amountLo = secretKey.decrypt(ciphertextLo)
  const amountHi = secretKey.decrypt(ciphertextHi)
  return combineAmounts(amountLo, amountHi, TRANSFER_AMOUNT_LO_BIT_LENGTH)
}

type ElGamalSecretKeyLike = { decrypt(ciphertext: ElGamalCiphertext): bigint }

type RawInstruction = { programIdIndex: number; accounts: number[]; data: string }

// A ConfidentialTransfer instruction's account list: [source, mint, destination, equality proof,
// ciphertext-validity proof, range proof, ...] — each proof slot being either a proof context
// account or the instructions sysvar (proof inline in the same transaction).
const TRANSFER_VALIDITY_PROOF_ACCOUNT_INDEX = 4

// The ciphertext-validity proof's raw instruction data (the per-party encrypted amount handles
// live in it, nowhere else). Older plans verified it inline in the transfer transaction itself;
// @solana-program/token-2022's current getConfidentialTransferInstructionPlan instead verifies it
// into a proof context account in an earlier transaction, and the transfer only references (then
// closes) that account — so look there: the account's history still lists that verification
// even after it's closed. Confirmed against real devnet transfers: the transfer transaction holds
// only Token2022[27,7] + CloseContextState×3, while the validity account's history holds the
// VerifyBatchedGroupedCiphertext3HandlesValidity (12) instruction.
async function findValidityProofData(
  rpc: ReturnType<typeof createSolanaRpc>,
  transferSignature: string,
  accountKeys: string[],
  instructions: RawInstruction[],
  transferInstruction: RawInstruction,
): Promise<Uint8Array | null> {
  const isValidityProof = (keys: string[], ix: RawInstruction): Uint8Array | null => {
    if (keys[ix.programIdIndex] !== ZK_ELGAMAL_PROOF_PROGRAM_ADDRESS) return null
    const raw = base58ToBytes(ix.data)
    return raw[0] === VERIFY_BATCHED_GROUPED_CIPHERTEXT_3_HANDLES_VALIDITY_DISCRIMINATOR ? raw : null
  }

  for (const ix of instructions) {
    const inline = isValidityProof(accountKeys, ix)
    if (inline) return inline
  }

  const contextAccount = accountKeys[transferInstruction.accounts[TRANSFER_VALIDITY_PROOF_ACCOUNT_INDEX]!]
  if (!contextAccount) return null
  const history = await rpc.getSignaturesForAddress(address(contextAccount), { limit: 5 }).send()
  for (const { signature, err } of history) {
    if (err || signature === transferSignature) continue
    const tx = await rpc
      .getTransaction(signature, { commitment: 'confirmed', encoding: 'json', maxSupportedTransactionVersion: 0 })
      .send()
    if (!tx) continue
    const keys = tx.transaction.message.accountKeys as unknown as string[]
    for (const ix of tx.transaction.message.instructions as unknown as RawInstruction[]) {
      const proof = isValidityProof(keys, ix)
      if (proof) return proof
    }
  }
  return null
}

channel.on('decryptActivity', async (params) => {
  const { rpcUrl, mint, owner, limit, known } = params as DecryptActivityParams
  const alreadyKnown = new Set(known ?? [])
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
    if (alreadyKnown.has(signature)) continue
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
    let transferInstruction: RawInstruction | null = null
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
      transferInstruction = ix
      break
    }
    if (!direction || !transferInstruction) continue

    // Decrypt the handle matching our direction (our own ElGamal key never decrypts the other
    // party's handle — that's the whole point of ElGamal's per-recipient handles).
    const proofData = await findValidityProofData(rpc, signature, accountKeys, instructions, transferInstruction)
    if (!proofData) continue
    try {
      const handleIndex = direction === 'outgoing' ? SOURCE_HANDLE_INDEX : DESTINATION_HANDLE_INDEX
      const amount = decryptProofInstructionAmount(proofData, keys.elgamalKeypair.secret(), handleIndex)
      entries.push({
        signature,
        direction,
        amount: amount.toString(),
        blockTime: tx.blockTime != null ? Number(tx.blockTime) : null,
      })
    } catch {
      // A proof that doesn't decrypt cleanly with our key isn't ours to show — skip rather than
      // surface a broken entry.
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

// Rust's `name: [u8; 32]`, UTF-8, zero-padded — truncates rather than throwing on an over-long
// name (the create-pot screen should keep users under this anyway; this is the last line of
// defense, not the primary validation).
function encodePotName(name: string): Uint8Array {
  const encoded = new TextEncoder().encode(name)
  const padded = new Uint8Array(32)
  padded.set(encoded.subarray(0, 32))
  return padded
}

channel.on('createPot', async (params) => {
  const { rpcUrl, mint, extraMints, host, potOwner, potId, name, closeTs } = params as CreatePotParams
  await wasmInit
  const keys = sessionKeys.get(potOwner)
  if (!keys) throw new Error(`call derivePotKeys/restorePotKeys for "${potOwner}" before createPot`)

  const rpc = createSolanaRpc(rpcUrl)
  const mintAddress = address(mint)
  const hostAddress = address(host)
  const potOwnerAddress = address(potOwner)
  const hostSigner = createHostTransactionSigner(hostAddress)
  const potSigner = createHostTransactionSigner(potOwnerAddress)
  const gasTank = gasTanks.get(host)
  if (!gasTank) throw new Error(`call deriveKeys("${host}") before createPot`)

  const [potTokenAccount] = await findAssociatedTokenPda({
    owner: potOwnerAddress,
    mint: mintAddress,
    tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
  })

  // The pot's own keypair (held here, no approval) authorizes its token-account setup and the gas
  // tank pays for it, so the wallet signs exactly one transaction: create_pot. A single approval
  // covering the whole setup took long enough to outlast its blockhash. The two halves are
  // independent on-chain (create_pot just records `potTokenAccount` as a Pubkey field, it doesn't
  // verify the account exists), so create_pot goes first: it's sent the moment the wallet
  // returns, before its blockhash has aged any further.
  // One confidential account per token the pot accepts (see CreatePotParams.extraMints) — which
  // of them exist is what tells guests which tokens they can contribute.
  const steps = []
  for (const potMint of [mintAddress, ...(extraMints ?? []).map((extra) => address(extra))]) {
    steps.push(...(await buildEnsureAccountReadySteps(rpc, potMint, potSigner, gasTank, keys)).steps)
  }

  // The gas tank pays the pot record's rent and the transaction fee (SKR fuel keeps it topped
  // up), so the wallet only signs as host and never needs SOL for a pot.
  const createPotInstruction = await envelopeVault.getCreatePotInstructionAsync({
    host: hostSigner,
    payer: gasTank,
    potId: BigInt(potId),
    name: encodePotName(name),
    closeTs: BigInt(closeTs),
    potOwner: potOwnerAddress,
    potTokenAccount,
  })

  const signedTransactions = await signPlannedMessages(
    [
      ...(await planMessages(singleInstructionPlan(createPotInstruction), gasTank)),
      ...(steps.length > 0 ? await planMessages(sequentialInstructionPlan(steps), gasTank) : []),
    ],
    rpc,
  )
  return { signedTransactions } satisfies CreatePotResult
})

// Contract: call applyPendingBalance({ owner: potOwner, payer: host }) first if the pot has any
// pending balance, and let it land, before calling this — the sweep transfer below reads the
// pot's *available* balance from current on-chain state to build its proofs, which only reflects
// contributions that have already been applied. Bundling "apply" and "sweep" into one client call
// would build the sweep's proofs against stale (pre-apply) on-chain state, since apply itself
// hasn't landed yet when the sweep is built — the same multi-transaction landing-order problem
// Phase 13's relayer fix addressed, avoided here by keeping the two as separate calls instead.
channel.on('closePot', async (params) => {
  const { rpcUrl, mints, host, potOwner, potId } = params as ClosePotParams
  await wasmInit
  const keys = sessionKeys.get(potOwner)
  if (!keys) throw new Error(`call derivePotKeys/restorePotKeys for "${potOwner}" before closePot`)

  const rpc = createSolanaRpc(rpcUrl)
  const hostAddress = address(host)
  const potOwnerAddress = address(potOwner)
  const hostSigner = createHostTransactionSigner(hostAddress)
  const potSigner = createHostTransactionSigner(potOwnerAddress)
  const gasTank = gasTanks.get(host)
  if (!gasTank) throw new Error(`call deriveKeys("${host}") before closePot`)

  const closePotInstruction = await envelopeVault.getClosePotInstructionAsync({
    host: hostSigner,
    potId: BigInt(potId),
  })

  // The wallet signs only close_pot; each sweep back to the host is authorized by the pot's own
  // keypair and paid for by the gas tank, so its proof transactions need no approval and are
  // signed with a fresh blockhash right after the wallet returns.
  const messages = await planMessages(singleInstructionPlan(closePotInstruction), gasTank)

  for (const mint of mints) {
    const mintAddress = address(mint)
    const [potToken] = await findAssociatedTokenPda({
      owner: potOwnerAddress,
      mint: mintAddress,
      tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
    })
    const [hostToken] = await findAssociatedTokenPda({
      owner: hostAddress,
      mint: mintAddress,
      tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
    })
    // A token the pot never accepted has no account: nothing to sweep.
    if (!(await fetchMaybeToken(rpc, potToken)).exists) continue

    const balance = await fetchConfidentialTransferBalance({
      token: potToken,
      rpc,
      elgamalSecretKey: keys.elgamalKeypair.secret(),
      aesKey: keys.aesKey,
    })
    if (balance.availableBalance === 0n) continue

    const [potAccount, hostAccount] = await Promise.all([fetchToken(rpc, potToken), fetchToken(rpc, hostToken)])
    const sweepPlan = await getConfidentialTransferInstructionPlan({
      sourceToken: potToken,
      destinationToken: hostToken,
      mint: mintAddress,
      sourceTokenAccount: potAccount.data,
      destinationTokenAccount: hostAccount.data,
      authority: potSigner,
      amount: balance.availableBalance,
      sourceElgamalKeypair: keys.elgamalKeypair,
      aesKey: keys.aesKey,
      payer: gasTank,
      rpc,
    })
    messages.push(...(await planMessages(sweepPlan, gasTank)))
  }

  const signedTransactions = await signPlannedMessages(messages, rpc)
  return { signedTransactions } satisfies ClosePotResult
})

// --- Gift links (see CreateGiftParams) ---

// A gift's whole identity — signing key and confidential keys — comes from its 32-byte secret,
// domain-separated so it can never collide with a wallet's or a pot's derivation.
async function deriveGiftSigner(secret: Uint8Array): Promise<KeyPairSigner> {
  const domain = new TextEncoder().encode('envelope-gift:')
  const input = new Uint8Array(domain.length + secret.length)
  input.set(domain)
  input.set(secret, domain.length)
  const seed = new Uint8Array(await crypto.subtle.digest('SHA-256', input))
  return createKeyPairSignerFromPrivateKeyBytes(seed)
}

// Registers the gift's keypair like a pot's (potSigners: signed here, never sent to a wallet).
async function openGiftKeys(secretBase58: string) {
  const secret = base58ToBytes(secretBase58)
  if (secret.length !== 32) throw new Error('this is not a valid gift link')
  const signer = await deriveGiftSigner(secret)
  potSigners.set(signer.address, signer)
  let keys = sessionKeys.get(signer.address)
  if (!keys) {
    keys = await deriveWalletConfidentialKeys(signer)
    sessionKeys.set(signer.address, keys)
  }
  return { signer, keys }
}

function giftKeysFor(giftOwner: string) {
  const signer = potSigners.get(giftOwner)
  const keys = sessionKeys.get(giftOwner)
  if (!signer || !keys) throw new Error('open the gift (openGift) first')
  return { signer, keys }
}

channel.on('createGift', async (params) => {
  const { rpcUrl, mint, sender } = params as CreateGiftParams
  await wasmInit
  const gasTank = gasTanks.get(sender)
  if (!gasTank) throw new Error(`call deriveKeys("${sender}") before createGift`)

  const secret = getBase58Decoder().decode(crypto.getRandomValues(new Uint8Array(32)))
  const { signer, keys } = await openGiftKeys(secret)
  const rpc = createSolanaRpc(rpcUrl)
  // The gift's own keypair authorizes its account setup and the sender's gas tank pays the rent:
  // no wallet approval. The funds follow as an ordinary private send.
  const { steps } = await buildEnsureAccountReadySteps(rpc, address(mint), signer, gasTank, keys)
  const signedTransactions = await signInstructionPlan(sequentialInstructionPlan(steps), gasTank, rpc)
  return { secret, giftOwnerAddress: signer.address, signedTransactions } satisfies CreateGiftResult
})

channel.on('openGift', async (params) => {
  const { rpcUrl, mints, secret } = params as OpenGiftParams
  await wasmInit
  const { signer, keys } = await openGiftKeys(secret)
  const rpc = createSolanaRpc(rpcUrl)
  const balances = await Promise.all(
    mints.map(async (mint) => {
      const [token] = await findAssociatedTokenPda({
        owner: signer.address,
        mint: address(mint),
        tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
      })
      const account = await fetchMaybeToken(rpc, token)
      if (!account.exists) return { mint, exists: false, available: '0', pending: '0' }
      try {
        const balance = decryptConfidentialTransferBalance({
          tokenAccount: account.data,
          elgamalSecretKey: keys.elgamalKeypair.secret(),
          aesKey: keys.aesKey,
        })
        return {
          mint,
          exists: true,
          available: balance.availableBalance.toString(),
          pending: balance.pendingBalance.toString(),
        }
      } catch {
        // The account exists but its confidential setup hasn't landed: nothing in it yet.
        return { mint, exists: true, available: '0', pending: '0' }
      }
    }),
  )
  return { giftOwnerAddress: signer.address, balances } satisfies OpenGiftResult
})

channel.on('claimGift', async (params) => {
  const { rpcUrl, mint, giftOwner, claimer } = params as ClaimGiftParams
  await wasmInit
  const { signer, keys } = giftKeysFor(giftOwner)
  const gasTank = gasTanks.get(claimer)
  if (!gasTank) throw new Error(`call deriveKeys("${claimer}") before claimGift`)

  const rpc = createSolanaRpc(rpcUrl)
  const mintAddress = address(mint)
  const [giftToken] = await findAssociatedTokenPda({
    owner: signer.address,
    mint: mintAddress,
    tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
  })
  const [claimerToken] = await findAssociatedTokenPda({
    owner: address(claimer),
    mint: mintAddress,
    tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
  })
  const [giftAccount, claimerAccount] = await Promise.all([fetchToken(rpc, giftToken), fetchToken(rpc, claimerToken)])
  const { availableBalance } = decryptConfidentialTransferBalance({
    tokenAccount: giftAccount.data,
    elgamalSecretKey: keys.elgamalKeypair.secret(),
    aesKey: keys.aesKey,
  })
  if (availableBalance === 0n) return { amount: '0', signedTransactions: [] } satisfies ClaimGiftResult

  // Authorized by the gift's own keypair, paid by the claimer's gas tank: no approval, no SOL.
  const plan = await getConfidentialTransferInstructionPlan({
    sourceToken: giftToken,
    destinationToken: claimerToken,
    mint: mintAddress,
    sourceTokenAccount: giftAccount.data,
    destinationTokenAccount: claimerAccount.data,
    authority: signer,
    amount: availableBalance,
    sourceElgamalKeypair: keys.elgamalKeypair,
    aesKey: keys.aesKey,
    payer: gasTank,
    rpc,
  })
  const signedTransactions = await signPlannedMessages(await planMessages(plan, gasTank), rpc)
  return { amount: availableBalance.toString(), signedTransactions } satisfies ClaimGiftResult
})

channel.on('closeGift', async (params) => {
  const { rpcUrl, mint, giftOwner, claimer } = params as CloseGiftParams
  await wasmInit
  const { signer, keys } = giftKeysFor(giftOwner)
  const gasTank = gasTanks.get(claimer)
  if (!gasTank) throw new Error(`call deriveKeys("${claimer}") before closeGift`)

  const rpc = createSolanaRpc(rpcUrl)
  const [giftToken] = await findAssociatedTokenPda({
    owner: signer.address,
    mint: address(mint),
    tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
  })
  const giftAccount = await fetchMaybeToken(rpc, giftToken)
  if (!giftAccount.exists) return { signedTransactions: [] } satisfies CloseGiftResult

  // EmptyAccount proves the (now zero) available balance is zero; only then can it close. The
  // rent goes to the claimer's gas tank — the sender's tank paid it, but the claim is the end of
  // the gift and the claimer is the one paying for these transactions.
  const plan = sequentialInstructionPlan([
    await getEmptyConfidentialTransferAccountInstructionPlan({
      token: giftToken,
      tokenAccount: giftAccount.data,
      authority: signer,
      elgamalKeypair: keys.elgamalKeypair,
      payer: gasTank,
      rpc,
    }),
    getCloseAccountInstruction({ account: giftToken, destination: gasTank.address, owner: signer }),
  ])
  const signedTransactions = await signPlannedMessages(await planMessages(plan, gasTank), rpc)
  return { signedTransactions } satisfies CloseGiftResult
})

channel.on('decryptPotActivity', async (params) => {
  const { rpcUrl, mint, potOwner, limit } = params as DecryptPotActivityParams
  await wasmInit
  const keys = sessionKeys.get(potOwner)
  if (!keys) throw new Error(`call derivePotKeys/restorePotKeys for "${potOwner}" before decryptPotActivity`)

  const rpc = createSolanaRpc(rpcUrl)
  const [potToken] = await findAssociatedTokenPda({
    owner: address(potOwner),
    mint: address(mint),
    tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
  })

  const signatures = await rpc.getSignaturesForAddress(potToken, { limit: limit ?? 50 }).send()
  const contributions: PotContribution[] = []

  for (const { signature, err } of signatures) {
    if (err) continue
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

    // A pot only ever receives contributions (never sends, until the host-signed close-time
    // sweep, which this same loop would otherwise misattribute as a self-contribution) — find an
    // incoming ConfidentialTransfer naming our own token account as the destination.
    let sourceToken: string | null = null
    let transferInstruction: RawInstruction | null = null
    for (const ix of instructions) {
      const programId = accountKeys[ix.programIdIndex]
      if (programId !== TOKEN_2022_PROGRAM_ADDRESS) continue
      const data = base58ToBytes(ix.data)
      if (
        data[0] !== CONFIDENTIAL_TRANSFER_EXTENSION_DISCRIMINATOR ||
        data[1] !== CONFIDENTIAL_TRANSFER_SUB_DISCRIMINATOR
      )
        continue
      const destinationToken = accountKeys[ix.accounts[2]!]
      if (destinationToken !== potToken) continue
      sourceToken = accountKeys[ix.accounts[0]!] ?? null
      transferInstruction = ix
      break
    }
    if (!sourceToken) continue
    if (sourceToken === potToken) continue // the close-time sweep is pot -> host, not a contribution

    if (!transferInstruction) continue
    const proofData = await findValidityProofData(rpc, signature, accountKeys, instructions, transferInstruction)
    if (!proofData) continue
    let amount: bigint
    try {
      amount = decryptProofInstructionAmount(proofData, keys.elgamalKeypair.secret(), DESTINATION_HANDLE_INDEX)
    } catch {
      continue // Not decryptable with our key — not actually ours, skip.
    }

    const contributorAccount = await fetchMaybeToken(rpc, address(sourceToken))
    if (!contributorAccount.exists) continue

    contributions.push({
      signature,
      contributor: contributorAccount.data.owner,
      amount: amount.toString(),
      blockTime: tx.blockTime != null ? Number(tx.blockTime) : null,
    })
  }

  return { contributions } satisfies DecryptPotActivityResult
})
