// Confidential SKR: creates the cSKR mint (Token-2022, confidential transfers — same settings as
// cUSDC), hands its mint authority to the envelope_vault PDA, and registers SKR <-> cSKR with
// `initialize_asset` (needs the upgraded vault program). Idempotent: each step is skipped once
// done, so it's safe to re-run after a partial failure. Writes `mints.cskr` to config/devnet.json.
import { writeFileSync } from 'node:fs'
import {
  address,
  createClientWithGetMinimumBalanceFromRpc,
  generateKeyPairSigner,
  singleInstructionPlan,
  type Address,
} from '@solana/kit'
import {
  AuthorityType,
  getCreateMintInstructionPlan as getCreateToken2022MintInstructionPlan,
  getSetAuthorityInstruction,
  TOKEN_2022_PROGRAM_ADDRESS,
} from '@solana-program/token-2022'
import { envelopeVault } from '../anchor/src/index.ts'
import { sendInstructionPlan } from './lib/executePlan.ts'
import { devnetConfigPath, loadWalletSigner, readDevnetConfig } from './lib/keys.ts'
import { createDevnetClients } from './lib/rpc.ts'

const CSKR_DECIMALS = 6 // must match SKR's (initialize_asset checks)
const CSKR_NAME = 'Envelope SKR'
const CSKR_SYMBOL = 'cSKR'
const CSKR_URI = ''

type Mints = { usdc: string; skr: string; cusdc: string; cskr?: string }

async function main() {
  const { rpc, rpcSubscriptions } = createDevnetClients()
  const client = createClientWithGetMinimumBalanceFromRpc(rpc)
  const clients = { rpc, rpcSubscriptions }
  const admin = await loadWalletSigner('admin')
  const [vaultAuthority] = await envelopeVault.findVaultAuthorityPda()

  const config = readDevnetConfig() as { mints?: Mints }
  if (!config.mints) throw new Error('config/devnet.json has no `mints` — run `npm run devnet:mints` first')
  const skrMint = address(config.mints.skr)

  let cskrMint: Address
  if (config.mints.cskr) {
    cskrMint = address(config.mints.cskr)
    console.log(`cSKR mint already recorded: ${cskrMint}`)
  } else {
    const newMint = await generateKeyPairSigner()
    console.log('creating cSKR mint (Token-2022, confidential transfers)...')
    const plan = await getCreateToken2022MintInstructionPlan(client, {
      payer: admin,
      newMint,
      decimals: CSKR_DECIMALS,
      mintAuthority: admin,
      extensions: [
        {
          __kind: 'ConfidentialTransferMint',
          // Document: revoke (set to null) before any mainnet use, as with cUSDC.
          authority: admin.address,
          autoApproveNewAccounts: true,
          auditorElgamalPubkey: null,
        },
        { __kind: 'MetadataPointer', authority: admin.address, metadataAddress: newMint.address },
        {
          __kind: 'TokenMetadata',
          updateAuthority: admin.address,
          mint: newMint.address,
          name: CSKR_NAME,
          symbol: CSKR_SYMBOL,
          uri: CSKR_URI,
          additionalMetadata: new Map(),
        },
      ],
    })
    await sendInstructionPlan(plan, admin, clients)
    cskrMint = newMint.address
    console.log(`  cSKR: ${cskrMint}`)

    console.log('handing cSKR mint authority to the vault PDA...')
    await sendInstructionPlan(
      singleInstructionPlan(
        getSetAuthorityInstruction(
          { owned: cskrMint, owner: admin, authorityType: AuthorityType.MintTokens, newAuthority: vaultAuthority },
          { programAddress: TOKEN_2022_PROGRAM_ADDRESS },
        ),
      ),
      admin,
      clients,
    )

    const latest = readDevnetConfig() as { mints: Mints }
    writeFileSync(
      devnetConfigPath(),
      `${JSON.stringify({ ...latest, mints: { ...latest.mints, cskr: cskrMint } }, null, 2)}\n`,
    )
    console.log(`wrote mints.cskr to ${devnetConfigPath()}`)
  }

  const [assetVaultAddress] = await envelopeVault.findAssetVaultPda({ underlyingMint: skrMint })
  const existing = await envelopeVault.fetchMaybeAssetVault(rpc, assetVaultAddress)
  if (existing.exists) {
    console.log(`SKR asset vault already initialized: ${assetVaultAddress}`)
    return
  }
  console.log('registering SKR <-> cSKR with initialize_asset...')
  await sendInstructionPlan(
    singleInstructionPlan(
      await envelopeVault.getInitializeAssetInstructionAsync({
        admin,
        underlyingMint: skrMint,
        confidentialMint: cskrMint,
      }),
    ),
    admin,
    clients,
  )
  const assetVault = await envelopeVault.fetchAssetVault(rpc, assetVaultAddress)
  console.log(`  asset vault: ${assetVaultAddress}`)
  console.log(`  vault SKR account: ${assetVault.data.vaultTokenAccount}`)
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
