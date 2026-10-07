import {
  type Address,
  type KeyPairSigner,
  type Rpc,
  type RpcSubscriptions,
  type SolanaRpcApi,
  type SolanaRpcSubscriptionsApi,
  type sendAndConfirmTransactionFactory,
} from '@solana/kit'
import { envelopeStake } from '../../src'
import { sendInstructions } from '../send-instruction'
import { createMint } from './mints'
import {
  getCreateAssociatedTokenIdempotentInstructionAsync,
  findAssociatedTokenPda,
  TOKEN_PROGRAM_ADDRESS,
} from '@solana-program/token'
import {
  BUSINESS_THRESHOLD,
  COOLDOWN_SECS,
  MEMBER_THRESHOLD,
  PASS_BUSINESS_PRICE,
  PASS_MEMBER_PRICE,
  PASS_PERIOD_SECS,
} from './constants'

type Clients = {
  rpc: Rpc<SolanaRpcApi>
  rpcSubscriptions: RpcSubscriptions<SolanaRpcSubscriptionsApi>
  sendAndConfirm: ReturnType<typeof sendAndConfirmTransactionFactory>
}

// The stake `Pool` is a program-wide singleton (`initialize` is admin-only-once), and both
// envelope-stake.test.ts and envelope-vault.test.ts need it on the one validator this test suite
// shares. Idempotent: whichever file's `beforeAll` runs first creates the SKR mint and
// initializes the pool; the other discovers both from the already-initialized `Pool` account
// instead of creating its own (mint identity matters — the pool is only ever configured with
// one). Combined with `--no-file-parallelism` (see Anchor.toml) as the real race guard, this is
// belt-and-suspenders, not a substitute for it.
export async function ensureStakePool(
  clients: Clients,
  admin: KeyPairSigner,
): Promise<{ poolAddress: Address; skrMint: Address }> {
  const { rpc, rpcSubscriptions, sendAndConfirm } = clients
  const [poolAddress] = await envelopeStake.findPoolPda()
  const existing = await envelopeStake.fetchMaybePool(rpc, poolAddress)
  if (existing.exists) {
    return { poolAddress, skrMint: existing.data.skrMint }
  }

  const skrMint = await createMint({ rpc, rpcSubscriptions }, admin, { decimals: 6 })
  const instruction = await envelopeStake.getInitializeInstructionAsync({
    admin,
    skrMint: skrMint.address,
    memberThreshold: MEMBER_THRESHOLD,
    businessThreshold: BUSINESS_THRESHOLD,
    cooldownSecs: COOLDOWN_SECS,
  })
  await sendInstructions({ instructions: instruction, payer: admin, rpc, sendAndConfirm })
  return { poolAddress, skrMint: skrMint.address }
}

// The pass config is a singleton too (see ensureStakePool for why idempotent). Pass payments go
// to the admin's own SKR account — the test treasury.
export async function ensurePassConfig(
  clients: Clients,
  admin: KeyPairSigner,
  skrMint: Address,
): Promise<{ treasury: Address }> {
  const { rpc, sendAndConfirm } = clients
  const [passConfigAddress] = await envelopeStake.findPassConfigPda()
  const existing = await envelopeStake.fetchMaybePassConfig(rpc, passConfigAddress)
  if (existing.exists) return { treasury: existing.data.treasury }

  const [treasury] = await findAssociatedTokenPda({
    owner: admin.address,
    mint: skrMint,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  })
  await sendInstructions({
    instructions: [
      await getCreateAssociatedTokenIdempotentInstructionAsync({ payer: admin, owner: admin.address, mint: skrMint }),
      await envelopeStake.getInitializePassConfigInstructionAsync({
        admin,
        treasury,
        memberPrice: PASS_MEMBER_PRICE,
        businessPrice: PASS_BUSINESS_PRICE,
        periodSecs: PASS_PERIOD_SECS,
      }),
    ],
    payer: admin,
    rpc,
    sendAndConfirm,
  })
  return { treasury }
}
