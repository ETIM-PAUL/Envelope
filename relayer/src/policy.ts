// The relayer must not be drainable — this is the single most security-critical file in the
// service. Every instruction in a transaction the relayer is asked to co-sign and pay for must be
// provably safe before it ever gets a signature. See the plan's "Validation policy" section for
// the exact rules; this is their implementation.
import {
  getCompiledTransactionMessageDecoder,
  decompileTransactionMessage,
  isWritableRole,
  type Transaction,
} from '@solana/kit'
import { SYSTEM_PROGRAM_ADDRESS, getCreateAccountDiscriminatorBytes } from '@solana-program/system'
import {
  TOKEN_PROGRAM_ADDRESS,
  ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
  TRANSFER_DISCRIMINATOR,
  TRANSFER_CHECKED_DISCRIMINATOR,
  getTransferInstructionDataDecoder,
  getTransferCheckedInstructionDataDecoder,
  findAssociatedTokenPda,
} from '@solana-program/token'
import { TOKEN_2022_PROGRAM_ADDRESS } from '@solana-program/token-2022'
import { COMPUTE_BUDGET_PROGRAM_ADDRESS, SET_COMPUTE_UNIT_PRICE_DISCRIMINATOR } from '@solana-program/compute-budget'
import { getSetComputeUnitPriceInstructionDataDecoder } from '@solana-program/compute-budget'
import { ZK_ELGAMAL_PROOF_PROGRAM_ADDRESS } from '@solana-program/zk-elgamal-proof'
import { mints, policyConfig, programs, relayerAddress } from './config.ts'

// Every program the relayer will ever co-sign for. Anything else in the instruction list is an
// automatic rejection, no further inspection needed.
const ALLOWED_PROGRAM_IDS = new Set<string>([
  TOKEN_PROGRAM_ADDRESS,
  TOKEN_2022_PROGRAM_ADDRESS,
  ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
  ZK_ELGAMAL_PROOF_PROGRAM_ADDRESS,
  COMPUTE_BUDGET_PROGRAM_ADDRESS,
  SYSTEM_PROGRAM_ADDRESS,
  programs.envelopeVault,
  programs.envelopeStake,
])

// ZK ElGamal Proof program's `CloseContextState` — discriminator 0 (see @solana-program/
// zk-elgamal-proof's ZkElGamalProofInstruction enum). The relayer may be the writable
// `destination` here (reclaiming rent it originally paid for the context account).
const CLOSE_CONTEXT_STATE_DISCRIMINATOR = 0

// The three VerifyProof discriminators @solana-program/token-2022's getConfidentialTransferInstructionPlan
// uses (confirmed by reading confidentialTransferHelpers.ts, not guessed): VerifyCiphertextCommitmentEquality
// (equality proof), VerifyBatchedGroupedCiphertext3HandlesValidity (ciphertext validity proof, 12 — matches
// the same constant the cbridge decrypts activity with), VerifyBatchedRangeProofU128 (range proof). These
// instructions list the context-state `authority` account (the relayer, since buildTransferPlan's
// `contextStateAuthority` defaults to `payer`) — Solana's compiled-message format has exactly one role per
// address across a whole transaction, so once the relayer is writable anywhere in the tx (it always is, as
// fee payer), every appearance of its address decompiles as writable too, including this one. That's a
// property of the wire format, not of what this instruction does with the account: VerifyProof only writes
// proof data into the context-state account it already rents: it has no path to move the relayer's own
// lamports or tokens, unlike a Token Transfer or System instruction naming the relayer as source.
const CONFIDENTIAL_TRANSFER_VERIFY_DISCRIMINATORS = new Set([3, 12, 7])

export type PolicyViolation = { ok: false; reason: string }
export type PolicyResult = { ok: true; sawFreeTierFeeInstruction: boolean } | PolicyViolation

function violation(reason: string): PolicyViolation {
  return { ok: false, reason }
}

// System's own instruction discriminator is a 4-byte little-endian u32 (unlike the 1-byte
// discriminators Token-2022/ComputeBudget/the ZK proof program use) — compared by exact bytes,
// not just `data[0]`, so this stays correct even if a future instruction's low byte happened to
// coincide with CreateAccount's.
const CREATE_ACCOUNT_DISCRIMINATOR_BYTES = getCreateAccountDiscriminatorBytes()
function isCreateAccountInstruction(data: Uint8Array): boolean {
  if (data.length < CREATE_ACCOUNT_DISCRIMINATOR_BYTES.length) return false
  return CREATE_ACCOUNT_DISCRIMINATOR_BYTES.every((byte, i) => data[i] === byte)
}

// The only (programAddress, instruction-discriminator) pairs where the relayer is allowed to
// appear as a WRITABLE account, beyond being the transaction's fee payer: funding a new proof
// context account (System CreateAccount, as payer) and reclaiming that account's rent (ZK
// ElGamal Proof CloseContextState, as destination). Every other writable appearance of the
// relayer's own address — a Token transfer naming it as source, a System transfer, anything —
// is exactly the drain vector this exists to block.
function isSafeWritableInstruction(programAddress: string, data: Uint8Array): boolean {
  if (programAddress === SYSTEM_PROGRAM_ADDRESS && isCreateAccountInstruction(data)) return true
  if (programAddress === ZK_ELGAMAL_PROOF_PROGRAM_ADDRESS && data[0] === CLOSE_CONTEXT_STATE_DISCRIMINATOR) return true
  if (programAddress === ZK_ELGAMAL_PROOF_PROGRAM_ADDRESS && CONFIDENTIAL_TRANSFER_VERIFY_DISCRIMINATORS.has(data[0]))
    return true
  return false
}

// Checks one transaction's instructions against the allow-list/writable-role/compute-price rules
// and reports whether it carried the free-tier SKR fee instruction — it does NOT enforce the tier
// requirement itself. A confidential transfer spans several transactions (proof-context creation,
// the transfer, context close), and only one of them needs to carry the fee; index.ts's /relay
// handler validates every transaction in a batch first, then enforces "free tier needs the fee
// instruction somewhere in the batch" once, across all of them — not once per transaction.
export async function validateTransaction(transaction: Transaction): Promise<PolicyResult> {
  const compiledMessage = getCompiledTransactionMessageDecoder().decode(transaction.messageBytes)
  if (compiledMessage.version !== 'legacy' && compiledMessage.version !== 0) {
    return violation(`unsupported transaction version: ${String(compiledMessage.version)}`)
  }
  // Address lookup tables add a layer of indirection this policy doesn't resolve — refusing them
  // outright is a simplification, not a gap: every instruction this relayer is meant to carry
  // (wrap, deposit, confidential transfer/proof verification) works fine as a plain static
  // account list.
  if (
    compiledMessage.version === 0 &&
    'addressTableLookups' in compiledMessage &&
    compiledMessage.addressTableLookups?.length
  ) {
    return violation('address lookup tables are not supported')
  }

  const message = decompileTransactionMessage(compiledMessage as Parameters<typeof decompileTransactionMessage>[0])

  if (message.feePayer.address !== relayerAddress) {
    return violation(`fee payer must be the relayer (${relayerAddress}), got ${message.feePayer.address}`)
  }

  let sawFreeTierFeeInstruction = false
  const [relayerSkrAta] = await findAssociatedTokenPda({
    owner: relayerAddress,
    mint: mints.skr,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  })

  for (const instruction of message.instructions) {
    const programAddress = instruction.programAddress
    if (!ALLOWED_PROGRAM_IDS.has(programAddress)) {
      return violation(`program not in allow-list: ${programAddress}`)
    }

    const data = instruction.data instanceof Uint8Array ? instruction.data : new Uint8Array(instruction.data ?? [])

    // System program: only CreateAccount (funding a proof context account) is ever legitimate
    // for a transaction the relayer pays for. Everything else — Transfer, Assign, Allocate — is
    // rejected outright, which is exactly what blocks "SOL transfer from relayer."
    if (programAddress === SYSTEM_PROGRAM_ADDRESS && !isCreateAccountInstruction(data)) {
      return violation('System instructions other than CreateAccount are not allowed')
    }

    // Compute-unit price cap — bounds how much of the relayer's own SOL one relayed transaction
    // can spend on prioritization fees, regardless of what the client requests.
    if (programAddress === COMPUTE_BUDGET_PROGRAM_ADDRESS && data[0] === SET_COMPUTE_UNIT_PRICE_DISCRIMINATOR) {
      const { microLamports } = getSetComputeUnitPriceInstructionDataDecoder().decode(data)
      if (microLamports > policyConfig.maxComputeUnitPriceMicroLamports) {
        return violation(
          `compute unit price ${microLamports} exceeds cap of ${policyConfig.maxComputeUnitPriceMicroLamports}`,
        )
      }
    }

    // Free-tier fee: a classic-Token Transfer/TransferChecked sending at least the configured
    // amount to the relayer's own SKR associated token account.
    if (
      programAddress === TOKEN_PROGRAM_ADDRESS &&
      (data[0] === TRANSFER_DISCRIMINATOR || data[0] === TRANSFER_CHECKED_DISCRIMINATOR)
    ) {
      const amount =
        data[0] === TRANSFER_DISCRIMINATOR
          ? getTransferInstructionDataDecoder().decode(data).amount
          : getTransferCheckedInstructionDataDecoder().decode(data).amount
      const destinationAccount = instruction.accounts?.[data[0] === TRANSFER_DISCRIMINATOR ? 1 : 2]
      if (destinationAccount?.address === relayerSkrAta && amount >= policyConfig.freeTierFeeAmount) {
        sawFreeTierFeeInstruction = true
      }
    }

    // The relayer's own address must never be writable anywhere except the two safe roles above
    // (and the fee-payer slot, which isn't a per-instruction account at all).
    for (const account of instruction.accounts ?? []) {
      if (account.address !== relayerAddress) continue
      if (!isWritableRole(account.role)) continue
      if (isSafeWritableInstruction(programAddress, data)) continue
      return violation(`relayer is writable in a ${programAddress} instruction outside its allowed roles`)
    }
  }

  return { ok: true, sawFreeTierFeeInstruction }
}
