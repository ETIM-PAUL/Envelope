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
import { BUSINESS_THRESHOLD, COOLDOWN_SECS, MEMBER_THRESHOLD } from './constants'

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
