// Membership pass pricing on devnet: initializes envelope_stake's PassConfig (admin-only, once).
// Pass payments go to the admin's SKR account as the treasury. Idempotent.
import { address, singleInstructionPlan, sequentialInstructionPlan } from '@solana/kit'
import {
  findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstructionAsync,
  TOKEN_PROGRAM_ADDRESS,
} from '@solana-program/token'
import { envelopeStake } from '../anchor/src/index.ts'
import { sendInstructionPlan } from './lib/executePlan.ts'
import { loadWalletSigner, readDevnetConfig } from './lib/keys.ts'
import { createDevnetClients } from './lib/rpc.ts'

const SKR = 1_000_000n // 6 decimals
const MEMBER_PRICE = 100n * SKR
const BUSINESS_PRICE = 500n * SKR
const PERIOD_SECS = 30n * 24n * 60n * 60n // 30 days

async function main() {
  const clients = createDevnetClients()
  const admin = await loadWalletSigner('admin')
  const skrMint = address((readDevnetConfig() as { mints: { skr: string } }).mints.skr)

  const [passConfigAddress] = await envelopeStake.findPassConfigPda()
  const existing = await envelopeStake.fetchMaybePassConfig(clients.rpc, passConfigAddress)
  if (existing.exists) {
    console.log('pass config already initialized:', existing.data)
    return
  }

  const [treasury] = await findAssociatedTokenPda({
    owner: admin.address,
    mint: skrMint,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  })
  await sendInstructionPlan(
    sequentialInstructionPlan([
      singleInstructionPlan(
        await getCreateAssociatedTokenIdempotentInstructionAsync({ payer: admin, owner: admin.address, mint: skrMint }),
      ),
      singleInstructionPlan(
        await envelopeStake.getInitializePassConfigInstructionAsync({
          admin,
          treasury,
          memberPrice: MEMBER_PRICE,
          businessPrice: BUSINESS_PRICE,
          periodSecs: PERIOD_SECS,
        }),
      ),
    ]),
    admin,
    clients,
  )
  console.log(`pass config: Member ${MEMBER_PRICE / SKR} SKR, Business ${BUSINESS_PRICE / SKR} SKR per 30 days`)
  console.log(`treasury: ${treasury}`)
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
