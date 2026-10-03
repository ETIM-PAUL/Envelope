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
  getTransactionDecoder,
  isSolanaError,
  sequentialInstructionPlan,
  setTransactionMessageFeePayerSigner,
  singleInstructionPlan,
  SOLANA_ERROR__ACCOUNTS__ACCOUNT_NOT_FOUND,
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
  getApplyConfidentialPendingBalanceInstructionFromToken,
  getConfidentialTransferInstructionPlan,
  getConfidentialWithdrawInstructionPlan,
  getCreateConfidentialTransferAccountInstructionPlan,
} from '@solana-program/token-2022/confidential'
import zkInit, { BatchedGroupedCiphertext3HandlesValidityProofData, ElGamalCiphertext } from '@solana/zk-sdk/web'
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
  BuildTransferPlanParams,
  BuildTransferPlanResult,
  BuildWithdrawPlanParams,
  BuildWithdrawPlanResult,
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
const wasmInit = zkInit(base64ToBytes(ZK_SDK_WASM_BASE64)).then(() => {
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
  let feePlan: InstructionPlan | null = null
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
    feePlan = singleInstructionPlan(feeIx)
  }

  const signedTransactions = await signInstructionPlan(feePlan ? [feePlan, plan] : [plan], relayerSigner, rpc)
  return { signedTransactions } satisfies BuildTransferPlanResult
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
  const payerSigner = payer ? createHostTransactionSigner(address(payer)) : signer

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
  const { rpcUrl, mint, usdcMint, owner, amount } = params as BuildWithdrawPlanParams
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
  const [userUsdc] = await findClassicAssociatedTokenPda({
    owner: ownerAddress,
    mint: address(usdcMint),
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  })
  const unwrapInstructions = [
    getApproveInstruction(
      { source: token, delegate: vaultAuthority, owner: signer, amount: BigInt(amount) },
      { programAddress: TOKEN_2022_PROGRAM_ADDRESS },
    ),
    await envelopeVault.getUnwrapInstructionAsync({
      user: signer,
      cusdcMint: mintAddress,
      userCusdc: token,
      vaultUsdc: vaultConfig.data.vaultUsdc,
      userUsdc,
      amount: BigInt(amount),
    }),
  ]
  // The final transaction is the one the wallet approves, so the wallet pays for it like any
  // other transaction it signs (the gas tank still signs it too, to close the proof contexts).
  const finalMessages = messages
    .slice(withdrawIndex)
    .map((message) => setTransactionMessageFeePayerSigner(signer, message))
  finalMessages[0] = appendTransactionMessageInstructions(unwrapInstructions, finalMessages[0]!)

  const continuationId = `withdraw-${owner}-${Date.now()}`
  continuations.set(continuationId, finalMessages)
  const signedTransactions = await signPlannedMessages(messages.slice(0, withdrawIndex), rpc)
  return { signedTransactions, continuationId } satisfies BuildWithdrawPlanResult
})

channel.on('signContinuation', async (params) => {
  const { rpcUrl, continuationId } = params as SignContinuationParams
  const messages = continuations.get(continuationId)
  if (!messages) throw new Error('nothing to continue — start the withdraw again')
  const signedTransactions = await signPlannedMessages(messages, createSolanaRpc(rpcUrl))
  return { signedTransactions } satisfies SignContinuationResult
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
  const { rpcUrl, mint, owner, payer } = params as EnsureAccountReadyParams
  await wasmInit
  const keys = sessionKeys.get(owner)
  if (!keys) throw new Error(`call deriveKeys("${owner}") before ensureAccountReady`)

  const rpc = createSolanaRpc(rpcUrl)
  const mintAddress = address(mint)
  const ownerAddress = address(owner)
  const signer = createHostTransactionSigner(ownerAddress)
  const payerSigner = payer ? createHostTransactionSigner(address(payer)) : signer

  const { steps } = await buildEnsureAccountReadySteps(rpc, mintAddress, signer, payerSigner, keys)

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
  const { rpcUrl, mint, host, potOwner, potId, name, closeTs } = params as CreatePotParams
  await wasmInit
  const keys = sessionKeys.get(potOwner)
  if (!keys) throw new Error(`call derivePotKeys/restorePotKeys for "${potOwner}" before createPot`)

  const rpc = createSolanaRpc(rpcUrl)
  const mintAddress = address(mint)
  const hostAddress = address(host)
  const potOwnerAddress = address(potOwner)
  const hostSigner = createHostTransactionSigner(hostAddress)
  const potSigner = createHostTransactionSigner(potOwnerAddress)

  const [potTokenAccount] = await findAssociatedTokenPda({
    owner: potOwnerAddress,
    mint: mintAddress,
    tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
  })

  // Token-account setup first, create_pot last — matches the plan's own ordering ("derive pot key
  // → create + configure pot account → create_pot"), though the two are independent on-chain
  // (create_pot just records `potTokenAccount` as a Pubkey field, it doesn't verify the account
  // exists yet).
  const { steps } = await buildEnsureAccountReadySteps(rpc, mintAddress, potSigner, hostSigner, keys)

  const createPotInstruction = await envelopeVault.getCreatePotInstructionAsync({
    host: hostSigner,
    potId: BigInt(potId),
    name: encodePotName(name),
    closeTs: BigInt(closeTs),
    potOwner: potOwnerAddress,
    potTokenAccount,
  })

  const signedTransactions = await signInstructionPlan(
    sequentialInstructionPlan([...steps, createPotInstruction]),
    hostSigner,
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
  const { rpcUrl, mint, host, potOwner, potId } = params as ClosePotParams
  await wasmInit
  const keys = sessionKeys.get(potOwner)
  if (!keys) throw new Error(`call derivePotKeys/restorePotKeys for "${potOwner}" before closePot`)

  const rpc = createSolanaRpc(rpcUrl)
  const mintAddress = address(mint)
  const hostAddress = address(host)
  const potOwnerAddress = address(potOwner)
  const hostSigner = createHostTransactionSigner(hostAddress)
  const potSigner = createHostTransactionSigner(potOwnerAddress)

  const closePotInstruction = await envelopeVault.getClosePotInstructionAsync({
    host: hostSigner,
    potId: BigInt(potId),
  })

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

  const balance = await fetchConfidentialTransferBalance({
    token: potToken,
    rpc,
    elgamalSecretKey: keys.elgamalKeypair.secret(),
    aesKey: keys.aesKey,
  })

  const plan: (Instruction | InstructionPlan)[] = [closePotInstruction]

  if (balance.availableBalance > 0n) {
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
      payer: hostSigner,
      rpc,
    })
    plan.push(sweepPlan)
  }

  const signedTransactions = await signInstructionPlan(sequentialInstructionPlan(plan), hostSigner, rpc)
  return { signedTransactions } satisfies ClosePotResult
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
      break
    }
    if (!sourceToken) continue
    if (sourceToken === potToken) continue // the close-time sweep is pot -> host, not a contribution

    let amount: bigint | null = null
    for (const ix of instructions) {
      const programId = accountKeys[ix.programIdIndex]
      if (programId !== ZK_ELGAMAL_PROOF_PROGRAM_ADDRESS) continue
      const raw = base58ToBytes(ix.data)
      if (raw[0] !== VERIFY_BATCHED_GROUPED_CIPHERTEXT_3_HANDLES_VALIDITY_DISCRIMINATOR) continue
      try {
        amount = decryptProofInstructionAmount(raw, keys.elgamalKeypair.secret(), DESTINATION_HANDLE_INDEX)
      } catch {
        // Not decryptable with our key — not actually ours, skip.
      }
      break
    }
    if (amount === null) continue

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
