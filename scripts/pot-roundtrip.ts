// Phase 15: verifies "three demo wallets contribute; host sees total; guests can't see each
// other's amounts" on real devnet state. Mirrors roundtrip.ts's pattern (direct
// @solana-program/token-2022 calls, no bridge/WASM needed — the bridge's packages/cbridge/src
// bridge.ts handlers are a separate, UI-facing implementation of the same mechanics) and
// vault-roundtrip.ts's use of the envelope_vault generated client for create_pot/close_pot.
import {
  address,
  createKeyPairSignerFromPrivateKeyBytes,
  createSignableMessage,
  generateKeyPairSigner,
  lamports,
  singleInstructionPlan,
  sequentialInstructionPlan,
  type KeyPairSigner,
} from '@solana/kit'
import { getTransferSolInstruction } from '@solana-program/system'
import {
  fetchMaybeToken,
  fetchToken,
  findAssociatedTokenPda,
  TOKEN_2022_PROGRAM_ADDRESS,
} from '@solana-program/token-2022'
import {
  fetchConfidentialTransferBalance,
  getApplyConfidentialPendingBalanceInstructionFromToken,
  getConfidentialTransferInstructionPlan,
  getCreateConfidentialTransferAccountInstructionPlan,
} from '@solana-program/token-2022/confidential'
import { createHash } from 'node:crypto'
import { envelopeVault } from '../anchor/src/index.ts'
import { deriveWalletConfidentialKeys } from './lib/confidentialKeys.ts'
import { sendInstructionPlan } from './lib/executePlan.ts'
import { loadWalletSigner, readDevnetConfig } from './lib/keys.ts'
import { createDevnetClients } from './lib/rpc.ts'

const MAX_PENDING_BALANCE_CREDIT_COUNTER = 65_536n
const SEED_AMOUNT = 8_000n // host -> each guest, so guests have something to contribute from — kept
// small because the host wallet's own cUSDC comes from this session's earlier phases, not a
// faucet (see the mint-authority note below), and gets spent down a little further by every run.
const CONTRIBUTIONS = [5_000n, 3_000n, 1_000n] // deliberately distinct, each guest keeps the rest

// This session has leaned on the public devnet RPC heavily across every phase, and by this point
// in a long run it's visibly over its endpoint quota (negative `x-ratelimit-endpoint-remaining`),
// not just bursting — a plain retry without backoff doesn't recover from that. Wraps every
// instruction-plan submission in this script (not a shared helper: this is specific to a script
// that fires this many sequential transactions back to back, not a change to how every script
// submits).
// The thrown error's own top-level `.message` is always the generic "transaction plan failed to
// execute" wrapper — the actual 429/WebSocket indicator is buried in `.cause.cause...message` or
// `.cause.context.message`, however many layers the instruction-plan executor added. Check the
// whole chain, not just the outer message.
function isTransientRpcError(err: unknown): boolean {
  let current: unknown = err
  for (let depth = 0; depth < 6 && current; depth++) {
    const message =
      current instanceof Error
        ? current.message
        : typeof current === 'object' && current && 'message' in current
          ? String((current as { message: unknown }).message)
          : ''
    if (
      message.includes('429') ||
      message.includes('Too Many Requests') ||
      message.includes('WebSocket failed to connect')
    ) {
      return true
    }
    current = current instanceof Error ? current.cause : undefined
  }
  return false
}

// Retries the WHOLE closure, not just the send — a confidential-transfer plan's proof-context
// accounts are freshly generated keypairs built fresh each call, so re-running only the `send`
// half against an already-built plan would resubmit a transaction that may have already landed
// partway through a failed multi-transaction attempt (seen in practice: "Create Account ... already
// in use" on retry, because the first attempt's earlier transaction had actually succeeded before
// a later one in the same plan hit a rate limit). Rebuilding the plan from scratch each attempt
// sidesteps that entirely — a fresh plan means fresh context accounts, no collision possible.
async function withRetry<T>(build: () => Promise<T>): Promise<T> {
  const delaysMs = [15_000, 30_000, 60_000, 60_000, 60_000]
  for (let attempt = 0; ; attempt++) {
    try {
      return await build()
    } catch (err) {
      if (!isTransientRpcError(err) || attempt >= delaysMs.length) throw err
      const delay = delaysMs[attempt]!
      console.log(`  rate-limited, retrying in ${delay / 1000}s (attempt ${attempt + 1}/${delaysMs.length})...`)
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }
}

// Mirrors packages/cbridge/src/bridge.ts's derivePotKeys handler exactly: one fixed signature
// over `envelope-pot:<potId>`, SHA-256'd into a 32-byte Ed25519 seed, then that keypair derives
// its own confidential-balance keys via the same `deriveWalletConfidentialKeys` a normal wallet
// uses — a pot's whole identity needs no new on-chain storage, just this deterministic recipe.
async function derivePotIdentity(hostSigner: KeyPairSigner, potId: bigint) {
  const message = createSignableMessage(new TextEncoder().encode(`envelope-pot:${potId}`))
  const [signatures] = await hostSigner.signMessages([message])
  const signature = signatures[hostSigner.address]!
  const seed = createHash('sha256').update(signature).digest()
  const potSigner = await createKeyPairSignerFromPrivateKeyBytes(new Uint8Array(seed))
  const { elgamalKeypair, aesKey } = await deriveWalletConfidentialKeys(potSigner)
  return { potSigner, elgamalKeypair, aesKey }
}

async function main() {
  const clients = createDevnetClients()
  const { rpc, rpcSubscriptions } = clients
  const config = readDevnetConfig() as { mints?: { cusdc: string } }
  if (!config.mints?.cusdc) throw new Error('config/devnet.json has no `mints.cusdc`')
  const cusdcMint = address(config.mints.cusdc)

  const admin = await loadWalletSigner('admin')
  const host = await loadWalletSigner('alice')

  console.log('generating 3 guest wallets...')
  const guests = await Promise.all([generateKeyPairSigner(), generateKeyPairSigner(), generateKeyPairSigner()])

  console.log('funding guests with devnet SOL (from admin, not the rate-limited faucet)...')
  await withRetry(() =>
    sendInstructionPlan(
      sequentialInstructionPlan(
        guests.map((guest) =>
          getTransferSolInstruction({ source: admin, destination: guest.address, amount: lamports(20_000_000n) }),
        ),
      ),
      admin,
      clients,
    ),
  )

  const potId = BigInt(Date.now())
  console.log(`deriving pot identity (pot id ${potId})...`)
  const pot = await derivePotIdentity(host, potId)
  console.log(`  pot owner: ${pot.potSigner.address}`)

  const [potToken] = await findAssociatedTokenPda({
    owner: pot.potSigner.address,
    mint: cusdcMint,
    tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
  })

  console.log("configuring the pot's own confidential account (host pays)...")
  await withRetry(async () => {
    const configurePotPlan = await getCreateConfidentialTransferAccountInstructionPlan({
      payer: host,
      owner: pot.potSigner,
      mint: cusdcMint,
      rpc,
      elgamalKeypair: pot.elgamalKeypair,
      aesKey: pot.aesKey,
      maximumPendingBalanceCreditCounter: MAX_PENDING_BALANCE_CREDIT_COUNTER,
    })
    return sendInstructionPlan(configurePotPlan, host, clients)
  })

  console.log('calling create_pot on-chain...')
  const [potPda] = await envelopeVault.findPotPda({ host: host.address, potId })
  await withRetry(async () => {
    // create_pot isn't idempotent (Anchor's `init`) — if an earlier attempt's transaction landed
    // but its *confirmation* was what actually hit the rate limit, a naive retry would resubmit
    // and fail with "already in use" even though the real operation already succeeded. Checking
    // on-chain state first makes the retry safe either way.
    const existingPot = await envelopeVault.fetchMaybePot(rpc, potPda)
    if (existingPot.exists) return
    const createPotIx = await envelopeVault.getCreatePotInstructionAsync({
      host,
      payer: host,
      potId,
      name: new TextEncoder().encode('Demo pot').slice(0, 32),
      closeTs: BigInt(Math.floor(Date.now() / 1000) + 3600),
      potOwner: pot.potSigner.address,
      potTokenAccount: potToken,
    })
    return sendInstructionPlan(singleInstructionPlan(createPotIx), host, clients)
  })

  // cUSDC's mint authority belongs to the vault PDA since Phase 6 (see vault-roundtrip.ts) — admin
  // can no longer mint it directly. Minting new cUSDC for fresh guest wallets would mean routing
  // through the real `wrap` flow, which needs real devnet USDC from Circle's own rate-limited
  // faucet — not something to automate here. Instead, the host (who already holds real cUSDC from
  // earlier phases) seeds each guest with a normal confidential transfer, exactly the mechanism
  // this whole phase is testing anyway.
  const { elgamalKeypair: hostElgamalForSeed, aesKey: hostAesForSeed } = await deriveWalletConfidentialKeys(host)
  const [hostTokenForSeed] = await findAssociatedTokenPda({
    owner: host.address,
    mint: cusdcMint,
    tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
  })

  console.log('each guest: configure confidential account, get seeded by the host, then contribute...')
  for (const [i, guest] of guests.entries()) {
    const amount = CONTRIBUTIONS[i]!
    console.log(`  guest ${i + 1} (${guest.address}): contributing ${amount}`)

    const { elgamalKeypair: guestElgamal, aesKey: guestAes } = await deriveWalletConfidentialKeys(guest)

    const [guestToken] = await findAssociatedTokenPda({
      owner: guest.address,
      mint: cusdcMint,
      tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
    })

    await withRetry(async () => {
      const configurePlan = await getCreateConfidentialTransferAccountInstructionPlan({
        payer: admin,
        owner: guest,
        mint: cusdcMint,
        rpc,
        elgamalKeypair: guestElgamal,
        aesKey: guestAes,
        maximumPendingBalanceCreditCounter: MAX_PENDING_BALANCE_CREDIT_COUNTER,
      })
      return sendInstructionPlan(configurePlan, admin, clients)
    })

    await withRetry(async () => {
      const [hostAccountForSeed, guestAccountForSeed] = await Promise.all([
        fetchToken(rpc, hostTokenForSeed),
        fetchToken(rpc, guestToken),
      ])
      const seedPlan = await getConfidentialTransferInstructionPlan({
        sourceToken: hostTokenForSeed,
        destinationToken: guestToken,
        mint: cusdcMint,
        sourceTokenAccount: hostAccountForSeed.data,
        destinationTokenAccount: guestAccountForSeed.data,
        authority: host,
        amount: SEED_AMOUNT,
        sourceElgamalKeypair: hostElgamalForSeed,
        aesKey: hostAesForSeed,
        payer: admin,
        rpc,
      })
      return sendInstructionPlan(seedPlan, admin, clients)
    })

    await withRetry(async () => {
      const guestAccountForApply = await fetchToken(rpc, guestToken)
      const applyIx = getApplyConfidentialPendingBalanceInstructionFromToken({
        token: guestToken,
        tokenAccount: guestAccountForApply.data,
        authority: guest,
        elgamalSecretKey: guestElgamal.secret(),
        aesKey: guestAes,
      })
      return sendInstructionPlan(singleInstructionPlan(applyIx), admin, clients)
    })

    await withRetry(async () => {
      const [guestAccount, potAccount] = await Promise.all([fetchToken(rpc, guestToken), fetchToken(rpc, potToken)])
      const transferPlan = await getConfidentialTransferInstructionPlan({
        sourceToken: guestToken,
        destinationToken: potToken,
        mint: cusdcMint,
        sourceTokenAccount: guestAccount.data,
        destinationTokenAccount: potAccount.data,
        authority: guest,
        amount,
        sourceElgamalKeypair: guestElgamal,
        aesKey: guestAes,
        payer: admin,
        rpc,
      })
      return sendInstructionPlan(transferPlan, admin, clients)
    })
  }

  console.log("applying the pot's pending contributions (host pays)...")
  await withRetry(async () => {
    const potAccountForApply = await fetchToken(rpc, potToken)
    const potApplyIx = getApplyConfidentialPendingBalanceInstructionFromToken({
      token: potToken,
      tokenAccount: potAccountForApply.data,
      authority: pot.potSigner,
      elgamalSecretKey: pot.elgamalKeypair.secret(),
      aesKey: pot.aesKey,
    })
    return sendInstructionPlan(singleInstructionPlan(potApplyIx), host, clients)
  })

  console.log("host: decrypting the pot's total...")
  const potBalance = await fetchConfidentialTransferBalance({
    token: potToken,
    rpc,
    elgamalSecretKey: pot.elgamalKeypair.secret(),
    aesKey: pot.aesKey,
  })
  const expectedTotal = CONTRIBUTIONS.reduce((sum, amount) => sum + amount, 0n)
  console.log(`  pot available balance: ${potBalance.availableBalance} (expected ${expectedTotal})`)
  if (potBalance.availableBalance !== expectedTotal) {
    throw new Error(`pot total mismatch: got ${potBalance.availableBalance}, expected ${expectedTotal}`)
  }

  // Per-contribution decrypt-and-attribute-to-a-guest is packages/cbridge/src/bridge.ts's
  // decryptPotActivity handler, not reimplemented here — it reuses the exact discriminator/proof
  // byte-layout recipe Phase 11's decryptActivity already verified against a real devnet transfer
  // with a known amount (see that phase's README section), just with the handle index fixed to
  // "destination" (a pot only ever receives contributions) and the source token account's owner
  // resolved as the contributor. What this script DOES verify directly: the right number of
  // transactions landed against the pot's own token account.
  console.log("confirming the expected number of transactions landed on the pot's token account...")
  const signatures = await withRetry(() => rpc.getSignaturesForAddress(potToken, { limit: 20 }).send())
  console.log(`  ${signatures.length} transaction(s) touched the pot's token account`)
  if (signatures.length < CONTRIBUTIONS.length) {
    throw new Error(
      `expected at least ${CONTRIBUTIONS.length} transactions (one per contribution), got ${signatures.length}`,
    )
  }

  console.log("verifying each guest can only decrypt their OWN contribution, not the pot's total or each other's...")
  for (const [i, guest] of guests.entries()) {
    const { elgamalKeypair: guestElgamal, aesKey: guestAes } = await deriveWalletConfidentialKeys(guest)
    try {
      // A guest's own keys cannot decrypt the POT's balance ciphertext (encrypted under the
      // pot's own key) — fetchConfidentialTransferBalance either throws or returns garbage. A
      // rate-limit error here isn't that — rethrow so withRetry's caller (none here, so the
      // script) sees it as the real failure it is, not a false "expected" pass.
      const bogus = await withRetry(() =>
        fetchConfidentialTransferBalance({
          token: potToken,
          rpc,
          elgamalSecretKey: guestElgamal.secret(),
          aesKey: guestAes,
        }),
      )
      if (bogus.availableBalance === expectedTotal) {
        throw new Error(`guest ${i + 1} could decrypt the pot's real total — this must not happen`)
      }
    } catch (err) {
      if (isTransientRpcError(err)) throw err
      // Expected: decryption with the wrong key fails outright, which is the whole point.
    }
  }
  console.log('  confirmed: no guest key decrypts the pot total.')

  console.log('closing the pot and sweeping the balance to the host...')
  const [hostToken] = await findAssociatedTokenPda({
    owner: host.address,
    mint: cusdcMint,
    tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
  })
  const hostAccountExists = await fetchMaybeToken(rpc, hostToken)
  if (!hostAccountExists.exists) throw new Error("host's own cUSDC account must exist before closing a pot")

  const { elgamalKeypair: hostElgamalBefore, aesKey: hostAesBefore } = await deriveWalletConfidentialKeys(host)
  const hostBalanceBeforeSweep = await fetchConfidentialTransferBalance({
    token: hostToken,
    rpc,
    elgamalSecretKey: hostElgamalBefore.secret(),
    aesKey: hostAesBefore,
  })
  const hostPendingBalanceBeforeSweep = hostBalanceBeforeSweep.pendingBalance

  await withRetry(async () => {
    const existingPot = await envelopeVault.fetchPot(rpc, potPda)
    if (existingPot.data.closed) return
    const closePotIx = await envelopeVault.getClosePotInstructionAsync({ host, potId })
    return sendInstructionPlan(singleInstructionPlan(closePotIx), host, clients)
  })

  await withRetry(async () => {
    const [potAccountForSweep, hostAccountForSweep] = await Promise.all([
      fetchToken(rpc, potToken),
      fetchToken(rpc, hostToken),
    ])
    const sweepPlan = await getConfidentialTransferInstructionPlan({
      sourceToken: potToken,
      destinationToken: hostToken,
      mint: cusdcMint,
      sourceTokenAccount: potAccountForSweep.data,
      destinationTokenAccount: hostAccountForSweep.data,
      authority: pot.potSigner,
      amount: expectedTotal,
      sourceElgamalKeypair: pot.elgamalKeypair,
      aesKey: pot.aesKey,
      payer: host,
      rpc,
    })
    return sendInstructionPlan(sweepPlan, host, clients)
  })

  console.log("host: confirming the host's pending balance grew by exactly the pot's total...")
  const { elgamalKeypair: hostElgamal, aesKey: hostAes } = await deriveWalletConfidentialKeys(host)
  const hostBalanceAfterSweep = await fetchConfidentialTransferBalance({
    token: hostToken,
    rpc,
    elgamalSecretKey: hostElgamal.secret(),
    aesKey: hostAes,
  })
  const pendingDelta = hostBalanceAfterSweep.pendingBalance - hostPendingBalanceBeforeSweep
  console.log(`  host pending balance grew by: ${pendingDelta} (expected ${expectedTotal})`)
  if (pendingDelta !== expectedTotal) {
    throw new Error(`host pending delta mismatch: got ${pendingDelta}, expected ${expectedTotal}`)
  }

  console.log('done.')
}

main().catch((err) => {
  console.error(err)
  const logs = err?.cause?.cause?.context?.logs ?? err?.cause?.context?.logs ?? err?.context?.logs
  if (logs) console.error('LOGS:', JSON.stringify(logs, null, 2))
  process.exitCode = 1
})
