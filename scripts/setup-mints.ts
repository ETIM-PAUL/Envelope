// Phase 1: point config/devnet.json at Circle's real devnet USDC mint, create the mock SKR
// mint, and create cUSDC (Token-2022, confidential-transfer enabled). Addresses are written
// to config/devnet.json.
import { writeFileSync } from 'node:fs'
import { address, createClientWithGetMinimumBalanceFromRpc, generateKeyPairSigner } from '@solana/kit'
import { getCreateMintInstructionPlan as getCreateClassicMintInstructionPlan } from '@solana-program/token'
import { getCreateMintInstructionPlan as getCreateToken2022MintInstructionPlan } from '@solana-program/token-2022'
import { sendInstructionPlan } from './lib/executePlan.ts'
import { loadWalletSigner, devnetConfigPath, readDevnetConfig } from './lib/keys.ts'
import { createDevnetClients } from './lib/rpc.ts'

// Circle's real devnet USDC mint — not ours, so we don't create or mint it. Fund wallets via
// https://faucet.circle.com (20 USDC / 2hr / address). Verified on-chain (spl-token mint, 6
// decimals, Circle-owned mint/freeze authorities): https://developers.circle.com/stablecoins/quickstart-transfer-10-usdc-on-solana
const CIRCLE_DEVNET_USDC_MINT = address('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU')

// Real SKR (Solana Mobile's Seeker token) uses 6 decimals — matched here for the mock.
// SKR only exists on mainnet (tied to real value and Solana Mobile's own Guardian staking),
// so there's no devnet/testnet equivalent to point at; we mint our own for devnet testing.
// https://www.coingecko.com/en/coins/seeker
const SKR_DECIMALS = 6
const CUSDC_DECIMALS = 6

const CUSDC_NAME = 'Envelope USD'
const CUSDC_SYMBOL = 'cUSDC'
const CUSDC_LOGO_URI =
  'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png'

async function main() {
  const { rpc, rpcSubscriptions } = createDevnetClients()
  const client = createClientWithGetMinimumBalanceFromRpc(rpc)
  const clients = { rpc, rpcSubscriptions }

  const admin = await loadWalletSigner('admin')

  const [skrMint, cusdcMint] = await Promise.all([generateKeyPairSigner(), generateKeyPairSigner()])

  console.log(`Circle devnet USDC (not created, already exists): ${CIRCLE_DEVNET_USDC_MINT}`)

  console.log('creating mock SKR mint...')
  const skrPlan = await getCreateClassicMintInstructionPlan(client, {
    payer: admin,
    newMint: skrMint,
    decimals: SKR_DECIMALS,
    mintAuthority: admin.address,
  })
  await sendInstructionPlan(skrPlan, admin, clients)
  console.log(`  mock SKR: ${skrMint.address}`)

  console.log('creating cUSDC mint (Token-2022, confidential transfers)...')
  const cusdcPlan = await getCreateToken2022MintInstructionPlan(client, {
    payer: admin,
    newMint: cusdcMint,
    decimals: CUSDC_DECIMALS,
    // Mint authority stays with admin until Phase 6 hands it to the envelope_vault PDA.
    mintAuthority: admin,
    extensions: [
      {
        __kind: 'ConfidentialTransferMint',
        // Authority to approve new confidential accounts and update this config.
        // Document: revoke (set to null) before any mainnet use.
        authority: admin.address,
        autoApproveNewAccounts: true,
        auditorElgamalPubkey: null,
      },
      {
        __kind: 'MetadataPointer',
        authority: admin.address,
        // Self-hosted metadata: the TokenMetadata extension lives on the mint account itself.
        metadataAddress: cusdcMint.address,
      },
      {
        __kind: 'TokenMetadata',
        updateAuthority: admin.address,
        mint: cusdcMint.address,
        name: CUSDC_NAME,
        symbol: CUSDC_SYMBOL,
        uri: CUSDC_LOGO_URI,
        additionalMetadata: new Map(),
      },
    ],
  })
  await sendInstructionPlan(cusdcPlan, admin, clients)
  console.log(`  cUSDC: ${cusdcMint.address}`)

  const config = readDevnetConfig()
  const updated = {
    ...config,
    mints: {
      usdc: CIRCLE_DEVNET_USDC_MINT,
      skr: skrMint.address,
      cusdc: cusdcMint.address,
    },
  }
  writeFileSync(devnetConfigPath(), `${JSON.stringify(updated, null, 2)}\n`)
  console.log(`wrote ${devnetConfigPath()}`)
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
