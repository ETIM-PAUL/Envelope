// Entry point bundled by build.ts into a single local HTML file, loaded by rn-confidential's
// hidden WebView. Builds confidential-transfer instructions/proofs and transactions here (where
// WASM works); every signature — the one-time key-derivation signature and every transaction
// signature — round-trips to React Native (MWA) via the host methods in protocol.ts. This bridge
// never receives or stores an MWA-controlled private key, only the derived confidential keys,
// which live in memory for this WebView session only (cleared on reload / the app's "Lock" action).
import {
  address,
  createSolanaRpc,
  getBase58Decoder,
  sequentialInstructionPlan,
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
  decryptConfidentialTransferBalance,
  fetchConfidentialTransferBalance,
  getConfidentialTransferInstructionPlan,
  getCreateConfidentialTransferAccountInstructionPlan,
} from '@solana-program/token-2022/confidential'
import zkInit from '@solana/zk-sdk/web'
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
  const { rpcUrl, mint, owner, destinationOwner, amount } = params as BuildTransferPlanParams
  await wasmInit
  const keys = sessionKeys.get(owner)
  if (!keys) throw new Error(`call deriveKeys("${owner}") before buildTransferPlan`)

  const rpc = createSolanaRpc(rpcUrl)
  const mintAddress = address(mint)
  const ownerAddress = address(owner)
  const destinationAddress = address(destinationOwner)

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

  // Single-signer spike: owner pays their own fees (no relayer yet — see Phase 12).
  const signer = createHostTransactionSigner(ownerAddress)

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
    payer: signer,
    rpc,
  })

  const signedTransactions = await signInstructionPlan(plan, signer, rpc)
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
