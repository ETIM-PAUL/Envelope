// Statements: selective disclosure without sharing a key. The owner picks what to reveal (a
// token's balance, chosen transfers, or both); for each amount the phone adds a ciphertext-
// commitment equality proof that the on-chain ciphertext under the owner's ElGamal key holds
// exactly that amount. Anyone can check a statement against the chain (verifyStatement); nothing
// in it lets them read anything else.
//
// The commitment uses a zero opening (amount·G), so a verifier recomputes it from the stated
// amount alone: the amount is being revealed anyway, so there's nothing for the commitment to
// hide, and @solana/zk-sdk can't serialize a random opening.
//
// Used by the bridge (buildStatement, which proves) and by the verify page and tests (which check);
// callers initialize @solana/zk-sdk's wasm first.
import { address, getBase58Encoder, type Address, type Rpc, type SolanaRpcApi } from '@solana/kit'
import {
  fetchMaybeMint,
  fetchMaybeToken,
  findAssociatedTokenPda,
  TOKEN_2022_PROGRAM_ADDRESS,
} from '@solana-program/token-2022'
import {
  CiphertextCommitmentEqualityProofData,
  ElGamalCiphertext,
  PedersenCommitment,
  PedersenOpening,
  type ElGamalKeypair,
} from '@solana/zk-sdk/web'
import {
  CONFIDENTIAL_TRANSFER_EXTENSION_DISCRIMINATOR,
  CONFIDENTIAL_TRANSFER_SUB_DISCRIMINATOR,
  DESTINATION_HANDLE_INDEX,
  SOURCE_HANDLE_INDEX,
  TRANSFER_AMOUNT_LO_BIT_LENGTH,
  TRANSFER_VALIDITY_PROOF_ACCOUNT_INDEX,
  VERIFY_BATCHED_GROUPED_CIPHERTEXT_3_HANDLES_VALIDITY_DISCRIMINATOR,
  ZK_ELGAMAL_PROOF_PROGRAM_ADDRESS,
  proofInstructionCiphertexts,
  proofInstructionPubkey,
} from './transferData.ts'

import { STATEMENT_KIND, STATEMENT_MAX_TRANSFERS, STATEMENT_VERSION, type Statement } from './protocol.ts'

export { STATEMENT_KIND, STATEMENT_MAX_TRANSFERS, STATEMENT_VERSION, type Statement }

// ---------- proving and checking one amount ----------

const LO_MASK = (1n << TRANSFER_AMOUNT_LO_BIT_LENGTH) - 1n

function zeroCommitment(amount: bigint): Uint8Array {
  return PedersenCommitment.from(amount, PedersenOpening.zero()).toBytes()
}

function equal(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((value, i) => value === b[i])
}

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function fromBase64(text: string): Uint8Array {
  const binary = atob(text)
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

/** A proof that `ciphertext` (64 bytes) under `keypair`'s public key holds `amount`. */
export function proveAmount(keypair: ElGamalKeypair, ciphertext: Uint8Array, amount: bigint): string {
  const parsed = ElGamalCiphertext.fromBytes(ciphertext)
  if (!parsed) throw new Error('not an ElGamal ciphertext')
  const opening = PedersenOpening.zero()
  const proof = new CiphertextCommitmentEqualityProofData(
    keypair,
    parsed,
    PedersenCommitment.from(amount, opening),
    opening,
    amount,
  )
  proof.verify() // a wrong amount fails here, on the phone, rather than at the verifier
  return toBase64(proof.toBytes())
}

/** Why `proof` doesn't show that `ciphertext` under `pubkey` holds `amount`, or null if it does. */
export function checkAmount(proof: string, pubkey: Uint8Array, ciphertext: Uint8Array, amount: bigint): string | null {
  let data: CiphertextCommitmentEqualityProofData
  try {
    data = CiphertextCommitmentEqualityProofData.fromBytes(fromBase64(proof))
    data.verify()
  } catch {
    return 'the proof is malformed or invalid'
  }
  // The context is what the proof is about: [ElGamal pubkey 32][ciphertext 64][commitment 32].
  const context = data.context().toBytes()
  if (!equal(context.slice(0, 32), pubkey)) return "the proof wasn't made with this account's key"
  if (!equal(context.slice(32, 96), ciphertext)) return 'the proof is about a different ciphertext'
  if (!equal(context.slice(96, 128), zeroCommitment(amount))) return 'the amount does not match the proof'
  return null
}

// ---------- reading the chain ----------

type RawInstruction = { programIdIndex: number; accounts: number[]; data: string }
type RawTransaction = {
  slot: bigint | number
  blockTime: bigint | number | null
  meta: { err: unknown } | null
  transaction: { message: { accountKeys: string[]; instructions: RawInstruction[] } }
}

const INSTRUCTIONS_SYSVAR = 'Sysvar1nstructions1111111111111111111111111'
const base58 = getBase58Encoder()

async function getRawTransaction(rpc: Rpc<SolanaRpcApi>, signature: string): Promise<RawTransaction | null> {
  const tx = await rpc
    .getTransaction(signature as never, {
      commitment: 'confirmed',
      encoding: 'json',
      maxSupportedTransactionVersion: 0,
    })
    .send()
  return tx as unknown as RawTransaction | null
}

function isValidityProof(keys: string[], ix: RawInstruction): Uint8Array | null {
  if (keys[ix.programIdIndex] !== ZK_ELGAMAL_PROOF_PROGRAM_ADDRESS) return null
  const data = new Uint8Array(base58.encode(ix.data))
  return data[0] === VERIFY_BATCHED_GROUPED_CIPHERTEXT_3_HANDLES_VALIDITY_DISCRIMINATOR ? data : null
}

export type StatementAccount = {
  token: Address
  elgamalPubkey: Uint8Array
  availableBalance: Uint8Array
  pendingCredits: bigint
  decimals: number
}

/** The owner's confidential token account for `mint`, as the chain has it now. */
export async function readStatementAccount(
  rpc: Rpc<SolanaRpcApi>,
  owner: string,
  mint: string,
): Promise<StatementAccount> {
  const [token] = await findAssociatedTokenPda({
    owner: address(owner),
    mint: address(mint),
    tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
  })
  const [account, mintAccount] = await Promise.all([fetchMaybeToken(rpc, token), fetchMaybeMint(rpc, address(mint))])
  if (!account.exists) throw new Error('this wallet has no private balance for this token')
  if (!mintAccount.exists) throw new Error('the token does not exist')
  const extension = (account.data.extensions.__option === 'Some' ? account.data.extensions.value : []).find(
    (candidate) => candidate.__kind === 'ConfidentialTransferAccount',
  )
  if (extension?.__kind !== 'ConfidentialTransferAccount') throw new Error('this account has no private balance')
  return {
    token,
    elgamalPubkey: new Uint8Array(base58.encode(extension.elgamalPubkey)),
    availableBalance: new Uint8Array(extension.availableBalance),
    pendingCredits: BigInt(extension.pendingBalanceCreditCounter),
    decimals: mintAccount.data.decimals,
  }
}

export type TransferOnChain = {
  direction: 'incoming' | 'outgoing'
  counterpartyToken: string
  blockTime: number | null
  lo: Uint8Array // the owner's handle of the amount's low 16 bits
  hi: Uint8Array // ...and of its high 32 bits
}

/**
 * The `index`th private transfer in `signature` that moves money in or out of `token`, with the
 * ciphertexts of its amount under the owner's key, or why there is none. The amount's ciphertexts
 * live in a ciphertext-validity proof: in the same transaction, or verified earlier into a proof
 * context account that the transfer then consumes. Only a verification that wrote into that very
 * account, before the transfer, counts.
 */
export async function readTransfer(
  rpc: Rpc<SolanaRpcApi>,
  signature: string,
  index: number,
  token: string,
  elgamalPubkey: Uint8Array,
): Promise<TransferOnChain | string> {
  const tx = await getRawTransaction(rpc, signature)
  if (!tx) return 'transaction not found'
  if (tx.meta?.err) return 'the transaction failed'
  const keys = tx.transaction.message.accountKeys
  const instructions = tx.transaction.message.instructions

  const transfers = instructions.filter((ix) => {
    if (keys[ix.programIdIndex] !== TOKEN_2022_PROGRAM_ADDRESS) return false
    const data = base58.encode(ix.data)
    return (
      data[0] === CONFIDENTIAL_TRANSFER_EXTENSION_DISCRIMINATOR && data[1] === CONFIDENTIAL_TRANSFER_SUB_DISCRIMINATOR
    )
  })
  const transfer = transfers[index]
  if (!transfer) return 'no such private transfer in the transaction'
  const source = keys[transfer.accounts[0]!]!
  const destination = keys[transfer.accounts[2]!]!
  const direction = source === token ? 'outgoing' : destination === token ? 'incoming' : null
  if (!direction) return "the transfer doesn't involve this account"
  const handleIndex = direction === 'outgoing' ? SOURCE_HANDLE_INDEX : DESTINATION_HANDLE_INDEX

  let proofData: Uint8Array | null = null
  const contextAccount = keys[transfer.accounts[TRANSFER_VALIDITY_PROOF_ACCOUNT_INDEX]!]
  if (!contextAccount) return 'the transfer has no ciphertext-validity proof'
  if (contextAccount === INSTRUCTIONS_SYSVAR) {
    for (const ix of instructions) proofData ??= isValidityProof(keys, ix)
  } else {
    const slot = BigInt(tx.slot)
    const history = await rpc.getSignaturesForAddress(address(contextAccount), { limit: 10 }).send()
    const earlier = history
      .filter((entry) => !entry.err && entry.signature !== signature && BigInt(entry.slot) <= slot)
      .sort((a, b) => Number(BigInt(b.slot) - BigInt(a.slot)))
    for (const entry of earlier) {
      const candidate = await getRawTransaction(rpc, entry.signature)
      if (!candidate) continue
      const candidateKeys = candidate.transaction.message.accountKeys
      for (const ix of candidate.transaction.message.instructions) {
        const data = isValidityProof(candidateKeys, ix)
        // The verification must store its context in the account the transfer consumed.
        if (data && candidateKeys[ix.accounts[0]!] === contextAccount) proofData = data
      }
      if (proofData) break
    }
  }
  if (!proofData) return "the transfer's ciphertexts couldn't be found on-chain"
  if (!equal(proofInstructionPubkey(proofData, handleIndex), elgamalPubkey)) {
    return "the transfer wasn't encrypted to this account's key"
  }
  const [lo, hi] = proofInstructionCiphertexts(proofData, handleIndex)
  return {
    direction,
    counterpartyToken: direction === 'outgoing' ? destination : source,
    blockTime: tx.blockTime != null ? Number(tx.blockTime) : null,
    lo,
    hi,
  }
}

export function splitAmount(amount: bigint): { lo: bigint; hi: bigint } {
  return { lo: amount & LO_MASK, hi: amount >> TRANSFER_AMOUNT_LO_BIT_LENGTH }
}

// ---------- verifying a whole statement ----------

export type ItemStatus = 'proven' | 'changed' | 'invalid'

export type StatementReport = {
  ok: boolean // every item proven
  owner: string
  mint: string
  decimals: number | null
  error?: string // the statement couldn't be checked at all
  pendingCredits?: boolean // the account has incoming funds not in its available balance
  balance?: { status: ItemStatus; amount: string; reason?: string }
  transfers: {
    signature: string
    index: number
    amount: string
    status: ItemStatus
    reason?: string
    direction?: 'incoming' | 'outgoing'
    counterparty?: string
    blockTime?: number | null
  }[]
}

const ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/
const SIGNATURE = /^[1-9A-HJ-NP-Za-km-z]{64,90}$/
const AMOUNT = /^\d{1,20}$/

/** What's wrong with `value` as a statement, or null if it's well-formed. */
export function statementShapeError(value: unknown): string | null {
  const s = value as Statement
  if (!s || typeof s !== 'object' || s.kind !== STATEMENT_KIND) return 'not an Envelope statement'
  if (s.v !== STATEMENT_VERSION) return `unsupported statement version ${String(s.v)}`
  if (!ADDRESS.test(s.owner ?? '') || !ADDRESS.test(s.mint ?? '')) return 'bad wallet or token address'
  if (!s.balance && !s.transfers?.length) return 'the statement is empty'
  if (s.balance && (!AMOUNT.test(s.balance.amount) || typeof s.balance.proof !== 'string')) return 'bad balance entry'
  const transfers = s.transfers ?? []
  if (transfers.length > STATEMENT_MAX_TRANSFERS) return 'too many transfers'
  for (const t of transfers) {
    const ok =
      SIGNATURE.test(t.signature ?? '') &&
      Number.isInteger(t.index) &&
      t.index >= 0 &&
      t.index < 16 &&
      AMOUNT.test(t.amount ?? '') &&
      typeof t.lo === 'string' &&
      typeof t.hi === 'string'
    if (!ok) return 'bad transfer entry'
  }
  return null
}

/** Checks every figure in `statement` against the chain. Never trusts anything but the proofs. */
export async function verifyStatement(rpc: Rpc<SolanaRpcApi>, statement: Statement): Promise<StatementReport> {
  const report: StatementReport = {
    ok: false,
    owner: statement.owner,
    mint: statement.mint,
    decimals: null,
    transfers: [],
  }
  const shapeError = statementShapeError(statement)
  if (shapeError) return { ...report, error: shapeError }

  let account: StatementAccount
  try {
    account = await readStatementAccount(rpc, statement.owner, statement.mint)
  } catch (e) {
    return { ...report, error: e instanceof Error ? e.message : String(e) }
  }
  report.decimals = account.decimals
  report.pendingCredits = account.pendingCredits > 0n

  if (statement.balance) {
    const amount = BigInt(statement.balance.amount)
    const reason = checkAmount(statement.balance.proof, account.elgamalPubkey, account.availableBalance, amount)
    if (!reason) {
      report.balance = { status: 'proven', amount: statement.balance.amount }
    } else if (reason === 'the proof is about a different ciphertext') {
      // A valid proof about an earlier state of the balance: it can't be checked any more.
      report.balance = {
        status: 'changed',
        amount: statement.balance.amount,
        reason: 'the balance has changed since this statement was made',
      }
    } else {
      report.balance = { status: 'invalid', amount: statement.balance.amount, reason }
    }
  }

  for (const t of statement.transfers ?? []) {
    const entry: StatementReport['transfers'][number] = {
      signature: t.signature,
      index: t.index,
      amount: t.amount,
      status: 'invalid',
    }
    report.transfers.push(entry)
    let onChain: TransferOnChain | string
    try {
      onChain = await readTransfer(rpc, t.signature, t.index, account.token, account.elgamalPubkey)
    } catch (e) {
      entry.reason = e instanceof Error ? e.message : String(e)
      continue
    }
    if (typeof onChain === 'string') {
      entry.reason = onChain
      continue
    }
    entry.direction = onChain.direction
    entry.blockTime = onChain.blockTime
    entry.counterparty = onChain.counterpartyToken
    try {
      const other = await fetchMaybeToken(rpc, address(onChain.counterpartyToken))
      if (other.exists) entry.counterparty = other.data.owner
    } catch {
      // The other side's account may be closed (a gift, a pot): show its token account instead.
    }
    const { lo, hi } = splitAmount(BigInt(t.amount))
    const reason =
      checkAmount(t.lo, account.elgamalPubkey, onChain.lo, lo) ??
      checkAmount(t.hi, account.elgamalPubkey, onChain.hi, hi)
    if (reason) entry.reason = reason
    else entry.status = 'proven'
  }

  report.ok =
    (!report.balance || report.balance.status === 'proven') && report.transfers.every((t) => t.status === 'proven')
  return report
}

// ---------- links ----------

export function encodeStatement(statement: Statement): string {
  const bytes = new TextEncoder().encode(JSON.stringify(statement))
  return toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function decodeStatement(encoded: string): unknown {
  const bytes = fromBase64(encoded.replace(/-/g, '+').replace(/_/g, '/'))
  return JSON.parse(new TextDecoder().decode(bytes))
}
