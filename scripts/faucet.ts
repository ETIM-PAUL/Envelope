// Phase 1: mint mock SKR to the demo wallets (alice, bob, carol). USDC is Circle's real
// devnet mint (see setup-mints.ts) — we don't control it, so it can't be minted here; claim it
// per wallet from https://faucet.circle.com instead (20 USDC / 2hr / address, no account needed).
import { address } from '@solana/kit'
import { getMintToATAInstructionPlanAsync } from '@solana-program/token'
import { sendInstructionPlan } from './lib/executePlan.ts'
import { loadWalletSigner, readDevnetConfig } from './lib/keys.ts'
import { createDevnetClients } from './lib/rpc.ts'

const DEMO_WALLETS = ['alice', 'bob', 'carol'] as const
const SKR_AMOUNT = 1_000_000_000n // 1,000 mock SKR @ 6 decimals

async function main() {
  const clients = createDevnetClients()
  const config = readDevnetConfig() as { mints?: { usdc: string; skr: string } }

  if (!config.mints) {
    throw new Error('config/devnet.json has no `mints` — run `npm run devnet:mints` first')
  }

  const admin = await loadWalletSigner('admin')
  const skrMint = address(config.mints.skr)

  for (const name of DEMO_WALLETS) {
    const wallet = await loadWalletSigner(name)

    const skrPlan = await getMintToATAInstructionPlanAsync({
      payer: admin,
      owner: wallet.address,
      mint: skrMint,
      mintAuthority: admin,
      amount: SKR_AMOUNT,
      decimals: 6,
    })

    await sendInstructionPlan(skrPlan, admin, clients)
    console.log(`funded ${name} (${wallet.address}): 1,000 mock SKR`)
    console.log(`  claim devnet USDC manually at https://faucet.circle.com for ${wallet.address}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
