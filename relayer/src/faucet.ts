// Devnet SKR faucet: hands out the mock SKR token from the relayer's own stock, so trying out the
// staking tiers doesn't need anyone running a script with the admin (mint-authority) key — that
// key never leaves the operator's machine. Limits, per wallet: up to `dailyLimit` in any rolling
// 24 hours, and never past `maxHeld` SKR *held* — wallet balance plus staked, so staking what you
// claimed and claiming again can't climb past the cap.
//
// The claim ledger is a small JSON file, not in-memory like rate-limit.ts/push-store.ts: losing it
// on restart would hand everyone a fresh daily allowance.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstructionAsync,
  getTransferCheckedInstruction,
  TOKEN_PROGRAM_ADDRESS,
} from '@solana-program/token'
import {
  appendTransactionMessageInstructions,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  getSignatureFromTransaction,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  type Address,
} from '@solana/kit'
import { envelopeStake } from '../../anchor/src/index.ts'
import { faucetConfig, mints, relayerSigner, rpc } from './config.ts'
import { confirmSignature } from './confirm.ts'

const SKR_DECIMALS = 6
const WINDOW_MS = 24 * 60 * 60 * 1000

type Claim = { at: number; amount: string }

const ledgerPath =
  process.env.FAUCET_LEDGER_PATH ?? join(dirname(fileURLToPath(import.meta.url)), '..', '.data', 'faucet-claims.json')

function loadLedger(): Record<string, Claim[]> {
  try {
    return JSON.parse(readFileSync(ledgerPath, 'utf8')) as Record<string, Claim[]>
  } catch {
    return {}
  }
}

const ledger = loadLedger()

function saveLedger(): void {
  mkdirSync(dirname(ledgerPath), { recursive: true })
  writeFileSync(ledgerPath, JSON.stringify(ledger))
}

function recentClaims(wallet: string, now: number): Claim[] {
  return (ledger[wallet] ?? []).filter((claim) => now - claim.at < WINDOW_MS)
}

async function skrHeld(wallet: Address): Promise<bigint> {
  const [ata] = await findAssociatedTokenPda({ owner: wallet, mint: mints.skr, tokenProgram: TOKEN_PROGRAM_ADDRESS })
  const [stakePositionAddress] = await envelopeStake.findStakePositionPda({ user: wallet })
  const [balance, stakePosition] = await Promise.all([
    rpc
      .getTokenAccountBalance(ata)
      .send()
      .then((result) => BigInt(result.value.amount))
      .catch(() => 0n), // no SKR account yet
    envelopeStake.fetchMaybeStakePosition(rpc, stakePositionAddress),
  ])
  return balance + (stakePosition.exists ? stakePosition.data.amount : 0n)
}

export type FaucetStatus = {
  held: string
  claimedToday: string
  dailyLimit: string
  maxHeld: string
  available: string // what a claim right now would give
  nextClaimAt: number | null // when the daily allowance next frees up, if it's what's in the way
}

export async function getFaucetStatus(wallet: Address): Promise<FaucetStatus> {
  const now = Date.now()
  const claims = recentClaims(wallet, now)
  const claimedToday = claims.reduce((sum, claim) => sum + BigInt(claim.amount), 0n)
  const held = await skrHeld(wallet)
  const dailyLeft = faucetConfig.dailyLimit - claimedToday
  const roomLeft = faucetConfig.maxHeld - held
  const available = [dailyLeft, roomLeft].reduce((a, b) => (a < b ? a : b))
  const oldest = claims.length > 0 ? Math.min(...claims.map((claim) => claim.at)) : null
  return {
    held: held.toString(),
    claimedToday: claimedToday.toString(),
    dailyLimit: faucetConfig.dailyLimit.toString(),
    maxHeld: faucetConfig.maxHeld.toString(),
    available: (available > 0n ? available : 0n).toString(),
    nextClaimAt: dailyLeft <= 0n && oldest !== null ? oldest + WINDOW_MS : null,
  }
}

// One claim at a time per wallet: two quick taps must not both read "500 left" and both pay out.
const inFlight = new Set<string>()

export class FaucetRefusal extends Error {}

export async function claimFromFaucet(wallet: Address): Promise<{ amount: string; signature: string }> {
  if (inFlight.has(wallet)) throw new FaucetRefusal('a claim for this wallet is already in progress')
  inFlight.add(wallet)
  try {
    const status = await getFaucetStatus(wallet)
    const amount = BigInt(status.available)
    if (amount <= 0n) {
      throw new FaucetRefusal(
        BigInt(status.held) >= faucetConfig.maxHeld
          ? `you already hold the maximum of ${faucetConfig.maxHeld / 10n ** BigInt(SKR_DECIMALS)} SKR`
          : `you've claimed today's ${faucetConfig.dailyLimit / 10n ** BigInt(SKR_DECIMALS)} SKR`,
      )
    }

    const [source] = await findAssociatedTokenPda({
      owner: relayerSigner.address,
      mint: mints.skr,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    })
    const stock = await rpc
      .getTokenAccountBalance(source)
      .send()
      .then((result) => BigInt(result.value.amount))
      .catch(() => 0n)
    if (stock < amount) throw new FaucetRefusal('the faucet is out of SKR right now')

    const [destination] = await findAssociatedTokenPda({
      owner: wallet,
      mint: mints.skr,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    })
    const instructions = [
      await getCreateAssociatedTokenIdempotentInstructionAsync({
        payer: relayerSigner,
        owner: wallet,
        mint: mints.skr,
      }),
      getTransferCheckedInstruction({
        source,
        mint: mints.skr,
        destination,
        authority: relayerSigner,
        amount,
        decimals: SKR_DECIMALS,
      }),
    ]
    const { value: latestBlockhash } = await rpc.getLatestBlockhash().send()
    const transaction = await signTransactionMessageWithSigners(
      pipe(
        createTransactionMessage({ version: 0 }),
        (m) => appendTransactionMessageInstructions(instructions, m),
        (m) => setTransactionMessageFeePayerSigner(relayerSigner, m),
        (m) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
      ),
    )
    const signature = getSignatureFromTransaction(transaction)
    await rpc.sendTransaction(getBase64EncodedWireTransaction(transaction), { encoding: 'base64' }).send()
    await confirmSignature(signature)

    ledger[wallet] = [...recentClaims(wallet, Date.now()), { at: Date.now(), amount: amount.toString() }]
    saveLedger()
    return { amount: amount.toString(), signature }
  } finally {
    inFlight.delete(wallet)
  }
}
