// Confidential SKR end to end on devnet, against the upgraded envelope_vault: SKR -> wrap_asset
// -> public cSKR -> deposit/apply -> confidential transfer alice -> bob -> withdraw ->
// [Approve, unwrap_asset] -> SKR. Checks every balance delta and the supply invariant (cSKR
// supply == SKR held by the vault). Needs `npm run devnet:cskr` first.
import { address, nonDivisibleSequentialInstructionPlan, singleInstructionPlan, type Address } from '@solana/kit'
import {
  findAssociatedTokenPda as findClassicAta,
  getMintToATAInstructionPlanAsync as getClassicMintToAtaPlan,
  TOKEN_PROGRAM_ADDRESS,
} from '@solana-program/token'
import {
  fetchMaybeToken,
  fetchToken,
  findAssociatedTokenPda,
  getApproveInstruction,
  getConfidentialDepositInstruction,
  TOKEN_2022_PROGRAM_ADDRESS,
} from '@solana-program/token-2022'
import {
  fetchConfidentialTransferBalance,
  getApplyConfidentialPendingBalanceInstructionFromToken,
  getConfidentialTransferInstructionPlan,
  getConfidentialWithdrawInstructionPlan,
  getCreateConfidentialTransferAccountInstructionPlan,
} from '@solana-program/token-2022/confidential'
import { envelopeVault } from '../anchor/src/index.ts'
import { deriveWalletConfidentialKeys, type ConfidentialWalletKeys } from './lib/confidentialKeys.ts'
import { sendInstructionPlan } from './lib/executePlan.ts'
import { loadWalletSigner, readDevnetConfig } from './lib/keys.ts'
import { createDevnetClients } from './lib/rpc.ts'

const DECIMALS = 6
const MAX_PENDING_BALANCE_CREDIT_COUNTER = 65_536n
const WRAP_AMOUNT = 10_000_000n // 10 SKR
const TRANSFER_AMOUNT = 4_000_000n // 4 cSKR, alice -> bob
const WITHDRAW_AMOUNT = 6_000_000n // the rest, back to SKR

function check(label: string, actual: bigint, expected: bigint) {
  console.log(`  ${label}: ${actual} (expected ${expected})`)
  if (actual !== expected) throw new Error(`${label} mismatch: got ${actual}, expected ${expected}`)
}

async function main() {
  const clients = createDevnetClients()
  const { rpc } = clients
  const config = readDevnetConfig() as { mints?: { skr: string; cskr?: string } }
  if (!config.mints?.cskr) throw new Error('config/devnet.json has no mints.cskr — run `npm run devnet:cskr` first')
  const skrMint = address(config.mints.skr)
  const cskrMint = address(config.mints.cskr)

  const [admin, alice, bob] = await Promise.all([
    loadWalletSigner('admin'),
    loadWalletSigner('alice'),
    loadWalletSigner('bob'),
  ])
  const [aliceKeys, bobKeys] = await Promise.all([
    deriveWalletConfidentialKeys(alice),
    deriveWalletConfidentialKeys(bob),
  ])

  const [vaultAuthority] = await envelopeVault.findVaultAuthorityPda()
  const [assetVaultAddress] = await envelopeVault.findAssetVaultPda({ underlyingMint: skrMint })
  const assetVault = await envelopeVault.fetchAssetVault(rpc, assetVaultAddress)
  const vaultSkr = assetVault.data.vaultTokenAccount

  const cskrAta = async (owner: Address) =>
    (await findAssociatedTokenPda({ owner, mint: cskrMint, tokenProgram: TOKEN_2022_PROGRAM_ADDRESS }))[0]
  const [aliceCskr, bobCskr] = await Promise.all([cskrAta(alice.address), cskrAta(bob.address)])
  const [aliceSkr] = await findClassicAta({ owner: alice.address, mint: skrMint, tokenProgram: TOKEN_PROGRAM_ADDRESS })

  const privateBalance = (token: Address, keys: ConfidentialWalletKeys) =>
    fetchConfidentialTransferBalance({
      token,
      rpc,
      elgamalSecretKey: keys.elgamalKeypair.secret(),
      aesKey: keys.aesKey,
    })
  const applyPending = async (token: Address, owner: typeof alice, keys: ConfidentialWalletKeys) => {
    const account = await fetchToken(rpc, token)
    const instruction = getApplyConfidentialPendingBalanceInstructionFromToken({
      token,
      tokenAccount: account.data,
      authority: owner,
      elgamalSecretKey: keys.elgamalKeypair.secret(),
      aesKey: keys.aesKey,
    })
    await sendInstructionPlan(singleInstructionPlan(instruction), admin, clients)
  }
  const supplyInvariant = async () => {
    const [supply, vault] = await Promise.all([
      rpc.getTokenSupply(cskrMint).send(),
      rpc.getTokenAccountBalance(vaultSkr).send(),
    ])
    check('cSKR supply vs vault SKR', BigInt(supply.value.amount), BigInt(vault.value.amount))
  }

  for (const [name, owner, keys, token] of [
    ['alice', alice, aliceKeys, aliceCskr],
    ['bob', bob, bobKeys, bobCskr],
  ] as const) {
    if ((await fetchMaybeToken(rpc, token)).exists) continue
    console.log(`configuring ${name}'s confidential cSKR account...`)
    const plan = await getCreateConfidentialTransferAccountInstructionPlan({
      payer: admin,
      owner,
      mint: cskrMint,
      rpc,
      elgamalKeypair: keys.elgamalKeypair,
      aesKey: keys.aesKey,
      maximumPendingBalanceCreditCounter: MAX_PENDING_BALANCE_CREDIT_COUNTER,
    })
    await sendInstructionPlan(plan, admin, clients)
  }

  console.log(`minting ${WRAP_AMOUNT} test SKR to alice...`)
  await sendInstructionPlan(
    await getClassicMintToAtaPlan({
      payer: admin,
      owner: alice.address,
      mint: skrMint,
      mintAuthority: admin,
      amount: WRAP_AMOUNT,
      decimals: DECIMALS,
    }),
    admin,
    clients,
  )

  const aliceBefore = await privateBalance(aliceCskr, aliceKeys)
  const bobBefore = await privateBalance(bobCskr, bobKeys)
  const skrBefore = BigInt((await rpc.getTokenAccountBalance(aliceSkr).send()).value.amount)

  console.log(`step 1: wrap_asset ${WRAP_AMOUNT} SKR -> public cSKR`)
  await sendInstructionPlan(
    singleInstructionPlan(
      await envelopeVault.getWrapAssetInstructionAsync({
        user: alice,
        underlyingMint: skrMint,
        userUnderlying: aliceSkr,
        vaultTokenAccount: vaultSkr,
        confidentialMint: cskrMint,
        userConfidential: aliceCskr,
        amount: WRAP_AMOUNT,
      }),
    ),
    admin,
    clients,
  )
  await supplyInvariant()

  console.log('step 2: deposit public -> pending, apply -> available')
  await sendInstructionPlan(
    singleInstructionPlan(
      getConfidentialDepositInstruction({
        token: aliceCskr,
        mint: cskrMint,
        authority: alice,
        amount: WRAP_AMOUNT,
        decimals: DECIMALS,
      }),
    ),
    admin,
    clients,
  )
  await applyPending(aliceCskr, alice, aliceKeys)
  check(
    'alice private cSKR gain',
    (await privateBalance(aliceCskr, aliceKeys)).availableBalance - aliceBefore.availableBalance,
    WRAP_AMOUNT + aliceBefore.pendingBalance,
  )

  console.log(`step 3: confidential transfer ${TRANSFER_AMOUNT} cSKR alice -> bob`)
  const [aliceAccount, bobAccount] = await Promise.all([fetchToken(rpc, aliceCskr), fetchToken(rpc, bobCskr)])
  await sendInstructionPlan(
    await getConfidentialTransferInstructionPlan({
      sourceToken: aliceCskr,
      destinationToken: bobCskr,
      mint: cskrMint,
      sourceTokenAccount: aliceAccount.data,
      destinationTokenAccount: bobAccount.data,
      authority: alice,
      amount: TRANSFER_AMOUNT,
      sourceElgamalKeypair: aliceKeys.elgamalKeypair,
      aesKey: aliceKeys.aesKey,
      payer: admin,
      rpc,
    }),
    admin,
    clients,
  )
  await applyPending(bobCskr, bob, bobKeys)
  check(
    'bob private cSKR gain',
    (await privateBalance(bobCskr, bobKeys)).availableBalance - bobBefore.availableBalance,
    TRANSFER_AMOUNT + bobBefore.pendingBalance,
  )

  console.log(`step 4: confidential withdraw ${WITHDRAW_AMOUNT}, then [Approve, unwrap_asset] -> SKR`)
  const aliceForWithdraw = await fetchToken(rpc, aliceCskr)
  await sendInstructionPlan(
    await getConfidentialWithdrawInstructionPlan({
      token: aliceCskr,
      mint: cskrMint,
      tokenAccount: aliceForWithdraw.data,
      authority: alice,
      amount: WITHDRAW_AMOUNT,
      decimals: DECIMALS,
      elgamalKeypair: aliceKeys.elgamalKeypair,
      aesKey: aliceKeys.aesKey,
      payer: admin,
      rpc,
    }),
    admin,
    clients,
  )
  await sendInstructionPlan(
    nonDivisibleSequentialInstructionPlan([
      getApproveInstruction(
        { source: aliceCskr, delegate: vaultAuthority, owner: alice, amount: WITHDRAW_AMOUNT },
        { programAddress: TOKEN_2022_PROGRAM_ADDRESS },
      ),
      await envelopeVault.getUnwrapAssetInstructionAsync({
        user: alice,
        underlyingMint: skrMint,
        confidentialMint: cskrMint,
        userConfidential: aliceCskr,
        vaultTokenAccount: vaultSkr,
        userUnderlying: aliceSkr,
        amount: WITHDRAW_AMOUNT,
      }),
    ]),
    admin,
    clients,
  )

  const skrAfter = BigInt((await rpc.getTokenAccountBalance(aliceSkr).send()).value.amount)
  check('alice SKR net change', skrAfter - skrBefore, WITHDRAW_AMOUNT - WRAP_AMOUNT)
  check('alice public cSKR', BigInt((await rpc.getTokenAccountBalance(aliceCskr).send()).value.amount), 0n)
  await supplyInvariant()
  console.log('cSKR round trip OK')
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
