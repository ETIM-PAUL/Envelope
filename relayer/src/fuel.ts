// SKR fuel: refills a wallet's gas tank (the device-derived account that pays rent and network
// fees for withdrawals, pots, account setup and deposits) so the wallet never needs SOL. See
// config.ts's fuelConfig for the limits.
//
// Two shapes, decided by tier:
//  - included (Member/Business): the relayer sends the SOL itself, no wallet involved.
//  - paid (Free): /fuel returns an unsigned transaction — [SKR transfer owner -> relayer,
//    SOL transfer relayer -> tank], relayer as fee payer — the wallet signs it (and may add
//    compute-budget instructions, as Solflare does), and /fuel/submit co-signs it only after
//    checking it still pays exactly what was quoted, to exactly the tank that was quoted.
//
// A wallet's tank is bound on its first refill (trust on first use): the app derives it
// deterministically from the wallet, so it never legitimately changes, and binding stops a wallet
// from steering free refills to arbitrary addresses.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  appendTransactionMessageInstructions,
  compileTransaction,
  createNoopSigner,
  createTransactionMessage,
  decompileTransactionMessage,
  getBase64EncodedWireTransaction,
  getCompiledTransactionMessageDecoder,
  getSignatureFromTransaction,
  isWritableRole,
  partiallySignTransaction,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  type Address,
  type Transaction,
} from '@solana/kit'
import {
  getTransferSolInstruction,
  getTransferSolInstructionDataDecoder,
  SYSTEM_PROGRAM_ADDRESS,
  TRANSFER_SOL_DISCRIMINATOR,
} from '@solana-program/system'
import {
  findAssociatedTokenPda,
  getTransferCheckedInstruction,
  getTransferCheckedInstructionDataDecoder,
  TOKEN_PROGRAM_ADDRESS,
  TRANSFER_CHECKED_DISCRIMINATOR,
} from '@solana-program/token'
import {
  COMPUTE_BUDGET_PROGRAM_ADDRESS,
  getSetComputeUnitPriceInstructionDataDecoder,
  SET_COMPUTE_UNIT_PRICE_DISCRIMINATOR,
} from '@solana-program/compute-budget'
import {
  fuelConfig,
  mints,
  policyConfig,
  relayerAddress,
  relayerCryptoKeyPair,
  relayerSigner,
  rpc,
  tierPerks,
} from './config.ts'
import { confirmSignature } from './confirm.ts'
import { getTierForWallet } from './tier.ts'

const SKR_DECIMALS = 6
const DAY_MS = 24 * 60 * 60 * 1000
const QUOTE_TTL_MS = 2 * 60 * 1000

export class FuelRefusal extends Error {}

type Ledger = Record<string, { tank: string; refills: number[] }>

const ledgerPath =
  process.env.FUEL_LEDGER_PATH ?? join(dirname(fileURLToPath(import.meta.url)), '..', '.data', 'fuel.json')

function loadLedger(): Ledger {
  try {
    return JSON.parse(readFileSync(ledgerPath, 'utf8')) as Ledger
  } catch {
    return {}
  }
}
const ledger = loadLedger()
function saveLedger(): void {
  mkdirSync(dirname(ledgerPath), { recursive: true })
  writeFileSync(ledgerPath, JSON.stringify(ledger))
}

function refillsToday(owner: string, now: number): number[] {
  return (ledger[owner]?.refills ?? []).filter((at) => now - at < DAY_MS)
}

// One refill in flight per wallet, and quotes waiting for the wallet's signature.
const inFlight = new Set<string>()
const quotes = new Map<string, { tank: Address; lamports: bigint; priceSkr: bigint; expiresAt: number }>()

export type FuelResult =
  | { status: 'not-needed'; balance: string }
  | { status: 'sent'; signature: string; lamports: string }
  | { status: 'quote'; transaction: string; lamports: string; priceSkr: string }

// Checks everything that doesn't depend on the transaction: the tank binding, that it's actually
// low, and the daily cap. Returns how much SOL it needs.
async function checkRefill(owner: Address, tank: Address): Promise<bigint | null> {
  const bound = ledger[owner]?.tank
  if (bound && bound !== tank) throw new FuelRefusal('this wallet refuels a different gas tank')
  if (tank === owner || tank === relayerAddress) throw new FuelRefusal('not a gas tank')

  const { value: balance } = await rpc.getBalance(tank).send()
  if (balance >= fuelConfig.refillBelowLamports) return null
  if (refillsToday(owner, Date.now()).length >= fuelConfig.maxRefillsPerDay) {
    throw new FuelRefusal(`at most ${fuelConfig.maxRefillsPerDay} refills a day — try again tomorrow`)
  }
  return fuelConfig.topUpToLamports - balance
}

function recordRefill(owner: Address, tank: Address): void {
  ledger[owner] = { tank, refills: [...refillsToday(owner, Date.now()), Date.now()] }
  saveLedger()
}

export async function requestFuel(owner: Address, tank: Address): Promise<FuelResult> {
  if (inFlight.has(owner)) throw new FuelRefusal('a refill for this wallet is already in progress')
  inFlight.add(owner)
  try {
    const lamports = await checkRefill(owner, tank)
    if (lamports === null) return { status: 'not-needed', balance: String((await rpc.getBalance(tank).send()).value) }

    const tier = await getTierForWallet(rpc, owner)
    const { value: latestBlockhash } = await rpc.getLatestBlockhash().send()
    // A wallet's first refill is free on every tier: a brand-new user has neither SOL nor SKR yet,
    // and couldn't otherwise even set up their private accounts. (Mainnet would gate this, e.g.
    // on the Seeker Genesis Token, so new wallets can't farm it.)
    const welcome = !ledger[owner]

    if (tierPerks[tier].fuelIncluded || welcome) {
      // Included: no wallet signature needed, the relayer just sends it.
      const transaction = await signTransactionMessageWithSigners(
        pipe(
          createTransactionMessage({ version: 0 }),
          (m) =>
            appendTransactionMessageInstructions(
              [getTransferSolInstruction({ source: relayerSigner, destination: tank, amount: lamports })],
              m,
            ),
          (m) => setTransactionMessageFeePayerSigner(relayerSigner, m),
          (m) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
        ),
      )
      const signature = getSignatureFromTransaction(transaction)
      await rpc.sendTransaction(getBase64EncodedWireTransaction(transaction), { encoding: 'base64' }).send()
      await confirmSignature(signature)
      recordRefill(owner, tank)
      return { status: 'sent', signature, lamports: lamports.toString() }
    }

    // Paid: the wallet signs first (it may add compute-budget instructions); /fuel/submit verifies.
    const [ownerSkr] = await findAssociatedTokenPda({ owner, mint: mints.skr, tokenProgram: TOKEN_PROGRAM_ADDRESS })
    const [relayerSkr] = await findAssociatedTokenPda({
      owner: relayerAddress,
      mint: mints.skr,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    })
    const skrBalance = await rpc
      .getTokenAccountBalance(ownerSkr)
      .send()
      .then((result) => BigInt(result.value.amount))
      .catch(() => 0n)
    if (skrBalance < fuelConfig.priceSkr) {
      throw new FuelRefusal(`not enough SKR for fuel (${fuelConfig.priceSkr / 1_000_000n} SKR)`)
    }
    const ownerSigner = createNoopSigner(owner)
    const transaction = compileTransaction(
      pipe(
        createTransactionMessage({ version: 0 }),
        (m) =>
          appendTransactionMessageInstructions(
            [
              getTransferCheckedInstruction({
                source: ownerSkr,
                mint: mints.skr,
                destination: relayerSkr,
                authority: ownerSigner,
                amount: fuelConfig.priceSkr,
                decimals: SKR_DECIMALS,
              }),
              getTransferSolInstruction({
                source: createNoopSigner(relayerAddress),
                destination: tank,
                amount: lamports,
              }),
            ],
            m,
          ),
        (m) => setTransactionMessageFeePayerSigner(createNoopSigner(relayerAddress), m),
        (m) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
      ),
    )
    quotes.set(owner, { tank, lamports, priceSkr: fuelConfig.priceSkr, expiresAt: Date.now() + QUOTE_TTL_MS })
    return {
      status: 'quote',
      transaction: getBase64EncodedWireTransaction(transaction),
      lamports: lamports.toString(),
      priceSkr: fuelConfig.priceSkr.toString(),
    }
  } finally {
    inFlight.delete(owner)
  }
}

// The paid shape, signed by the wallet: co-signed and sent only if it does exactly what was
// quoted — pays the SKR price to the relayer, and moves the quoted SOL to the quoted tank and
// nowhere else. Compute-budget price instructions (wallets add them) are allowed under the cap.
export async function submitFuel(owner: Address, transaction: Transaction): Promise<string> {
  const quote = quotes.get(owner)
  if (!quote || quote.expiresAt < Date.now()) throw new FuelRefusal('no current fuel quote — ask again')
  if (inFlight.has(owner)) throw new FuelRefusal('a refill for this wallet is already in progress')
  inFlight.add(owner)
  try {
    const compiled = getCompiledTransactionMessageDecoder().decode(transaction.messageBytes)
    if ('addressTableLookups' in compiled && compiled.addressTableLookups?.length) {
      throw new FuelRefusal('address lookup tables are not supported')
    }
    const message = decompileTransactionMessage(compiled as Parameters<typeof decompileTransactionMessage>[0])
    if (message.feePayer.address !== relayerAddress) throw new FuelRefusal('fee payer must be the relayer')

    const [ownerSkr] = await findAssociatedTokenPda({ owner, mint: mints.skr, tokenProgram: TOKEN_PROGRAM_ADDRESS })
    const [relayerSkr] = await findAssociatedTokenPda({
      owner: relayerAddress,
      mint: mints.skr,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    })

    let paid = 0n
    let solTransfers = 0
    for (const instruction of message.instructions) {
      const data = instruction.data instanceof Uint8Array ? instruction.data : new Uint8Array(instruction.data ?? [])
      const accounts = instruction.accounts ?? []
      if (instruction.programAddress === COMPUTE_BUDGET_PROGRAM_ADDRESS) {
        if (data[0] === SET_COMPUTE_UNIT_PRICE_DISCRIMINATOR) {
          const { microLamports } = getSetComputeUnitPriceInstructionDataDecoder().decode(data)
          if (microLamports > policyConfig.maxComputeUnitPriceMicroLamports)
            throw new FuelRefusal('priority fee too high')
        }
        continue
      }
      if (instruction.programAddress === TOKEN_PROGRAM_ADDRESS && data[0] === TRANSFER_CHECKED_DISCRIMINATOR) {
        const { amount } = getTransferCheckedInstructionDataDecoder().decode(data)
        if (
          accounts[0]?.address !== ownerSkr ||
          accounts[1]?.address !== mints.skr ||
          accounts[2]?.address !== relayerSkr
        ) {
          throw new FuelRefusal('unexpected token transfer')
        }
        paid += amount
        continue
      }
      if (instruction.programAddress === SYSTEM_PROGRAM_ADDRESS) {
        // Only a plain Transfer (u32 discriminator) — nothing else the System program can do.
        if (
          data.length < 4 ||
          new DataView(data.buffer, data.byteOffset, 4).getUint32(0, true) !== TRANSFER_SOL_DISCRIMINATOR
        ) {
          throw new FuelRefusal('unexpected System instruction')
        }
        const { amount } = getTransferSolInstructionDataDecoder().decode(data)
        if (
          accounts[0]?.address !== relayerAddress ||
          accounts[1]?.address !== quote.tank ||
          amount !== quote.lamports
        ) {
          throw new FuelRefusal('the SOL transfer does not match the quote')
        }
        solTransfers++
        continue
      }
      throw new FuelRefusal(`unexpected instruction for ${instruction.programAddress}`)
    }
    if (solTransfers !== 1) throw new FuelRefusal('expected exactly one SOL transfer')
    if (paid < quote.priceSkr) throw new FuelRefusal('the SKR payment is short')
    // The relayer must not be writable anywhere but as fee payer and SOL source.
    for (const instruction of message.instructions) {
      if (instruction.programAddress === SYSTEM_PROGRAM_ADDRESS) continue
      for (const account of instruction.accounts ?? []) {
        if (account.address === relayerAddress && isWritableRole(account.role)) {
          throw new FuelRefusal('the relayer is writable outside the SOL transfer')
        }
      }
    }

    const cosigned = await partiallySignTransaction([relayerCryptoKeyPair], transaction)
    const signature = getSignatureFromTransaction(cosigned)
    await rpc.sendTransaction(getBase64EncodedWireTransaction(cosigned), { encoding: 'base64' }).send()
    await confirmSignature(signature)
    quotes.delete(owner)
    recordRefill(owner, quote.tank)
    return signature
  } finally {
    inFlight.delete(owner)
  }
}
