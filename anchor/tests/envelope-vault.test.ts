import { findAssociatedTokenPda, getBurnCheckedInstruction, TOKEN_PROGRAM_ADDRESS } from '@solana-program/token'
import {
  AuthorityType,
  getApproveInstruction,
  getCreateAssociatedTokenIdempotentInstructionAsync,
  getSetAuthorityInstruction,
} from '@solana-program/token-2022'
import { TOKEN_2022_PROGRAM_ADDRESS } from '@solana-program/token-2022'
import { generateKeyPairSigner, type Address, type KeyPairSigner } from '@solana/kit'
import { beforeAll, describe, expect, it } from 'vitest'
import { envelopeStake, envelopeVault } from '../src'
import { createFundedSigner } from './create-funded-signer'
import { BUSINESS_THRESHOLD, COOLDOWN_SECS, MEMBER_THRESHOLD } from './lib/constants'
import { createMint, mintTo } from './lib/mints'
import { ensureStakePool } from './lib/setup-stake-pool'
import { testAdminSigner } from './lib/test-admin'
import { createTestClients, sendInstructions } from './send-instruction'

const rpcUrl = process.env.ANCHOR_PROVIDER_URL!
const { rpc, rpcSubscriptions, sendAndConfirm } = createTestClients(rpcUrl)
const clients = { rpc, rpcSubscriptions, sendAndConfirm }

// Free tier's daily limit is deliberately low so the limit/reset tests don't need unrealistic
// amounts; Business's is u64::MAX so the same Config also supports the overflow test (Config is
// a program-wide singleton — there's only one set of limits for the whole suite).
const FREE_LIMIT = 100_000_000n // 100 USDC
const MEMBER_LIMIT = 10_000_000_000n // 10,000 USDC
const BUSINESS_LIMIT = 18_446_744_073_709_551_615n // u64::MAX

// A runtime `Config` field (not a Cargo feature), so no second build of the program is needed —
// see `seconds_per_day` in state.rs/initialize.rs. Real time still has to pass for "resets next
// day" to be observable against a live validator; 20s (not just a couple) leaves headroom for
// other tests that run several sequential on-chain instructions against the same user within one
// "day" — too short a day risks an unrelated test flaking from an unintended rollover mid-test.
const SECONDS_PER_DAY = 20n

describe('envelope_vault', () => {
  let admin: KeyPairSigner
  let usdcMint: KeyPairSigner
  let cusdcMint: KeyPairSigner
  let skrMint: Address
  let configAddress: Address
  let vaultAuthority: Address
  let vaultUsdc: Address

  beforeAll(async () => {
    admin = await createFundedSigner({ rpc, rpcSubscriptions, signer: await testAdminSigner() })
    ;({ skrMint } = await ensureStakePool(clients, admin))

    usdcMint = await createMint(clients, admin, { decimals: 6 })
    cusdcMint = await createMint(clients, admin, { decimals: 6, token2022: true })

    ;[configAddress] = await envelopeVault.findConfigPda()
    ;[vaultAuthority] = await envelopeVault.findVaultAuthorityPda()

    const existingConfig = await envelopeVault.fetchMaybeConfig(rpc, configAddress)
    if (!existingConfig.exists) {
      const initInstruction = await envelopeVault.getInitializeInstructionAsync({
        admin,
        usdcMint: usdcMint.address,
        cusdcMint: cusdcMint.address,
        limits: [FREE_LIMIT, MEMBER_LIMIT, BUSINESS_LIMIT],
        secondsPerDay: SECONDS_PER_DAY,
      })
      // Phase 6: hand cUSDC's mint authority to the VaultAuth PDA — `wrap` mints as that PDA.
      const setAuthorityInstruction = getSetAuthorityInstruction(
        {
          owned: cusdcMint.address,
          owner: admin,
          authorityType: AuthorityType.MintTokens,
          newAuthority: vaultAuthority,
        },
        { programAddress: TOKEN_2022_PROGRAM_ADDRESS },
      )
      await sendInstructions({
        instructions: [initInstruction, setAuthorityInstruction],
        payer: admin,
        rpc,
        sendAndConfirm,
      })
    }

    const config = await envelopeVault.fetchConfig(rpc, configAddress)
    vaultUsdc = config.data.vaultUsdc
  })

  async function userUsdcAddress(user: KeyPairSigner) {
    const [ata] = await findAssociatedTokenPda({
      owner: user.address,
      mint: usdcMint.address,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    })
    return ata
  }

  async function userCusdcAddress(owner: Address) {
    const [ata] = await findAssociatedTokenPda({
      owner,
      mint: cusdcMint.address,
      tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
    })
    return ata
  }

  async function ensureCusdcAta(user: KeyPairSigner) {
    // wrap's `userCusdc` isn't `init_if_needed` (only the vault ever mints there via `wrap`
    // itself, so the ATA must already exist) — create it directly. Can't do this via a
    // zero-amount mint-to: admin isn't cUSDC's mint authority once `vaultAuthority` is (see
    // beforeAll's SetAuthority step), and doesn't need to be just to create an ATA.
    const instruction = await getCreateAssociatedTokenIdempotentInstructionAsync({
      payer: admin,
      owner: user.address,
      mint: cusdcMint.address,
    })
    await sendInstructions({ instructions: instruction, payer: admin, rpc, sendAndConfirm })
  }

  async function freshFreeUser(usdcAmount: bigint) {
    const user = await createFundedSigner({ rpc, rpcSubscriptions })
    await mintTo(clients, admin, usdcMint.address, user.address, usdcAmount)
    await ensureCusdcAta(user)
    return user
  }

  async function wrapInstruction(user: KeyPairSigner, amount: bigint) {
    return envelopeVault.getWrapInstructionAsync({
      user,
      userUsdc: await userUsdcAddress(user),
      vaultUsdc,
      cusdcMint: cusdcMint.address,
      userCusdc: await userCusdcAddress(user.address),
      amount,
    })
  }

  async function supplyInvariantHolds() {
    const [supply, vault] = await Promise.all([
      rpc.getTokenSupply(cusdcMint.address).send(),
      rpc.getTokenAccountBalance(vaultUsdc).send(),
    ])
    expect(supply.value.amount).toEqual(vault.value.amount)
  }

  it('rejects a wrap that would overflow the daily-total accumulator', async () => {
    // Business tier's limit is u64::MAX, so the limit check itself never blocks this — only
    // `checked_add` in the daily-total accumulation can. Needs a Business-tier user.
    //
    // `usdcMint`/`vaultUsdc` are shared with every other test in this file (Config is a
    // program-wide singleton — there's only one), and the mint's own supply field is a u64 too,
    // so this can't just mint a hardcoded near-u64::MAX amount: depending on test order, other
    // tests' circulating supply could already be nonzero, overflowing the *mint* instead of
    // exercising `UserDaily.deposited_today`'s overflow check. Instead: read the mint's current
    // supply, mint exactly enough to leave 1 unit of headroom below u64::MAX (so the second wrap
    // below is what overflows, not the mint itself), and fully unwrap back out afterward so the
    // mint is left exactly as this test found it, order-independent either way.
    const U64_MAX = 18_446_744_073_709_551_615n
    const currentSupply = (await rpc.getTokenSupply(cusdcMint.address).send()).value.amount
    const bigAmount = U64_MAX - BigInt(currentSupply) - 1n

    const user = await createFundedSigner({ rpc, rpcSubscriptions })
    await ensureCusdcAta(user)
    await mintTo(clients, admin, usdcMint.address, user.address, bigAmount)

    await mintTo(clients, admin, skrMint, user.address, BUSINESS_THRESHOLD)
    const [userSkr] = await findAssociatedTokenPda({
      owner: user.address,
      mint: skrMint,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    })
    const pool = await envelopeStake.fetchPool(rpc, (await envelopeStake.findPoolPda())[0])
    await sendInstructions({
      instructions: await envelopeStake.getStakeInstructionAsync({
        user,
        userSkr,
        vaultSkr: pool.data.vaultSkr,
        amount: BUSINESS_THRESHOLD,
      }),
      payer: user,
      rpc,
      sendAndConfirm,
    })

    await sendInstructions({ instructions: await wrapInstruction(user, bigAmount), payer: user, rpc, sendAndConfirm })

    // deposited_today (u64::MAX - currentSupply - 1) + 2 overflows u64 — rejected before any
    // limit check (Business's limit is u64::MAX, so the limit check alone would allow it).
    await expect(
      sendInstructions({ instructions: await wrapInstruction(user, 2n), payer: user, rpc, sendAndConfirm }),
    ).rejects.toThrow()

    // Unwind: leave the shared mint/vault exactly as found, for whichever test runs next.
    // `unwrap` only *redistributes* USDC between `vaultUsdc` and `userUsdc` — it never burns any
    // (only wrap/unwrap's cUSDC side is mint/burn) — so `usdcMint`'s own total supply would stay
    // permanently inflated by `bigAmount` without an explicit burn here too, and the next mint
    // into it (any other test's `freshFreeUser`) would overflow *that* mint's u64 supply field.
    const userCusdc = await userCusdcAddress(user.address)
    const userUsdc = await userUsdcAddress(user)
    const approve = getApproveInstruction(
      { source: userCusdc, delegate: vaultAuthority, owner: user, amount: bigAmount },
      { programAddress: TOKEN_2022_PROGRAM_ADDRESS },
    )
    const unwrap = await envelopeVault.getUnwrapInstructionAsync({
      user,
      cusdcMint: cusdcMint.address,
      userCusdc,
      vaultUsdc,
      userUsdc,
      amount: bigAmount,
    })
    await sendInstructions({ instructions: [approve, unwrap], payer: user, rpc, sendAndConfirm })

    const burnUsdc = getBurnCheckedInstruction({
      account: userUsdc,
      mint: usdcMint.address,
      authority: user,
      amount: bigAmount,
      decimals: 6,
    })
    await sendInstructions({ instructions: burnUsdc, payer: user, rpc, sendAndConfirm })
  })

  it('wraps and unwraps USDC 1:1, keeping the supply invariant', async () => {
    const user = await freshFreeUser(50_000_000n)
    await sendInstructions({ instructions: await wrapInstruction(user, 30_000_000n), payer: user, rpc, sendAndConfirm })

    const userUsdc = await userUsdcAddress(user)
    const userCusdc = await userCusdcAddress(user.address)
    const cusdcBalance = await rpc.getTokenAccountBalance(userCusdc).send()
    expect(cusdcBalance.value.amount).toEqual('30000000')
    await supplyInvariantHolds()

    // Unwrap 10 back: needs a top-level Approve(vaultAuthority, amount) first (CPI Guard note).
    const approve = getApproveInstruction(
      { source: userCusdc, delegate: vaultAuthority, owner: user, amount: 10_000_000n },
      { programAddress: TOKEN_2022_PROGRAM_ADDRESS },
    )
    const unwrap = await envelopeVault.getUnwrapInstructionAsync({
      user,
      cusdcMint: cusdcMint.address,
      userCusdc,
      vaultUsdc,
      userUsdc,
      amount: 10_000_000n,
    })
    await sendInstructions({ instructions: [approve, unwrap], payer: user, rpc, sendAndConfirm })

    const usdcBalance = await rpc.getTokenAccountBalance(userUsdc).send()
    expect(usdcBalance.value.amount).toEqual('30000000') // 50 - 30 wrapped + 10 unwrapped
    await supplyInvariantHolds()
  })

  it('rejects unwrap without a prior delegate approval', async () => {
    const user = await freshFreeUser(10_000_000n)
    await sendInstructions({ instructions: await wrapInstruction(user, 5_000_000n), payer: user, rpc, sendAndConfirm })

    const unwrap = await envelopeVault.getUnwrapInstructionAsync({
      user,
      cusdcMint: cusdcMint.address,
      userCusdc: await userCusdcAddress(user.address),
      vaultUsdc,
      userUsdc: await userUsdcAddress(user),
      amount: 1_000_000n,
    })
    await expect(sendInstructions({ instructions: unwrap, payer: user, rpc, sendAndConfirm })).rejects.toThrow()
  })

  it('rejects unwrap for more than the approved delegate amount', async () => {
    const user = await freshFreeUser(10_000_000n)
    await sendInstructions({ instructions: await wrapInstruction(user, 5_000_000n), payer: user, rpc, sendAndConfirm })

    const userCusdc = await userCusdcAddress(user.address)
    const approve = getApproveInstruction(
      { source: userCusdc, delegate: vaultAuthority, owner: user, amount: 1_000_000n },
      { programAddress: TOKEN_2022_PROGRAM_ADDRESS },
    )
    const unwrap = await envelopeVault.getUnwrapInstructionAsync({
      user,
      cusdcMint: cusdcMint.address,
      userCusdc,
      vaultUsdc,
      userUsdc: await userUsdcAddress(user),
      amount: 2_000_000n, // more than approved
    })
    await expect(
      sendInstructions({ instructions: [approve, unwrap], payer: user, rpc, sendAndConfirm }),
    ).rejects.toThrow()
  })

  it('enforces the Free-tier daily wrap limit', async () => {
    const user = await freshFreeUser(FREE_LIMIT + 10_000_000n)
    await sendInstructions({ instructions: await wrapInstruction(user, FREE_LIMIT), payer: user, rpc, sendAndConfirm })

    await expect(
      sendInstructions({ instructions: await wrapInstruction(user, 1n), payer: user, rpc, sendAndConfirm }),
    ).rejects.toThrow()
  })

  it('rejects a fake StakePosition (wrong seeds / owner)', async () => {
    const user = await freshFreeUser(10_000_000n)
    // A real system account, not envelope_stake's PDA — wrong owner entirely.
    const fakeStakePosition = await generateKeyPairSigner()
    const instruction = await envelopeVault.getWrapInstructionAsync({
      user,
      userUsdc: await userUsdcAddress(user),
      vaultUsdc,
      cusdcMint: cusdcMint.address,
      userCusdc: await userCusdcAddress(user.address),
      stakePosition: fakeStakePosition.address,
      amount: 1_000_000n,
    })
    await expect(sendInstructions({ instructions: instruction, payer: user, rpc, sendAndConfirm })).rejects.toThrow()
  })

  it('rejects a wrong vault_usdc account', async () => {
    const user = await freshFreeUser(10_000_000n)
    const wrongVault = await userUsdcAddress(user) // the user's own USDC ATA, not the vault's
    const instruction = await envelopeVault.getWrapInstructionAsync({
      user,
      userUsdc: await userUsdcAddress(user),
      vaultUsdc: wrongVault,
      cusdcMint: cusdcMint.address,
      userCusdc: await userCusdcAddress(user.address),
      amount: 1_000_000n,
    })
    await expect(sendInstructions({ instructions: instruction, payer: user, rpc, sendAndConfirm })).rejects.toThrow()
  })

  it('rejects a wrong cusdc_mint', async () => {
    const user = await freshFreeUser(10_000_000n)
    const wrongMint = await createMint(clients, admin, { decimals: 6, token2022: true })
    const instruction = await envelopeVault.getWrapInstructionAsync({
      user,
      userUsdc: await userUsdcAddress(user),
      vaultUsdc,
      cusdcMint: wrongMint.address,
      userCusdc: await userCusdcAddress(user.address),
      amount: 1_000_000n,
    })
    await expect(sendInstructions({ instructions: instruction, payer: user, rpc, sendAndConfirm })).rejects.toThrow()
  })

  it('tier drops to Free the instant an unstake is requested, even mid-cooldown', async () => {
    const user = await freshFreeUser(MEMBER_LIMIT + 10_000_000n)

    // Stake enough SKR to qualify for Member tier.
    await mintTo(clients, admin, skrMint, user.address, MEMBER_THRESHOLD)
    const [userSkr] = await findAssociatedTokenPda({
      owner: user.address,
      mint: skrMint,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    })
    const pool = await envelopeStake.fetchPool(rpc, (await envelopeStake.findPoolPda())[0])
    const stakeInstruction = await envelopeStake.getStakeInstructionAsync({
      user,
      userSkr,
      vaultSkr: pool.data.vaultSkr,
      amount: MEMBER_THRESHOLD,
    })
    await sendInstructions({ instructions: stakeInstruction, payer: user, rpc, sendAndConfirm })

    // As a Member, a wrap above the Free limit (but within the Member limit) should succeed.
    const aboveFreeLimit = FREE_LIMIT + 1_000_000n
    await sendInstructions({
      instructions: await wrapInstruction(user, aboveFreeLimit),
      payer: user,
      rpc,
      sendAndConfirm,
    })

    // Request unstake: tier drops to Free immediately, before the cooldown even elapses.
    const requestUnstake = await envelopeStake.getRequestUnstakeInstructionAsync({ user })
    await sendInstructions({ instructions: requestUnstake, payer: user, rpc, sendAndConfirm })

    // Same day's UserDaily already holds `aboveFreeLimit` (> FREE_LIMIT), so even wrapping 1 more
    // unit must fail now — both because the tier-appropriate limit is Free's, and because the
    // running total already exceeds it.
    await expect(
      sendInstructions({ instructions: await wrapInstruction(user, 1n), payer: user, rpc, sendAndConfirm }),
    ).rejects.toThrow()
  })

  // `Config.secondsPerDay` was set above (see `SECONDS_PER_DAY`), so real time still has to pass
  // but not a real 86,400s day. See Anchor.toml for why `--hookTimeout`/`--testTimeout` are raised
  // suite-wide.
  it('resets the daily limit on the next day', async () => {
    const user = await freshFreeUser(FREE_LIMIT + 10_000_000n)
    await sendInstructions({ instructions: await wrapInstruction(user, FREE_LIMIT), payer: user, rpc, sendAndConfirm })
    await expect(
      sendInstructions({ instructions: await wrapInstruction(user, 1n), payer: user, rpc, sendAndConfirm }),
    ).rejects.toThrow()

    await new Promise((resolve) => setTimeout(resolve, Number(SECONDS_PER_DAY) * 1000 + 2_000))

    // A new day: the same user can wrap up to the limit again.
    await sendInstructions({ instructions: await wrapInstruction(user, 1_000_000n), payer: user, rpc, sendAndConfirm })
  }, 40_000)
  // A second wrappable asset (e.g. SKR <-> cSKR) via `initialize_asset` / `wrap_asset` /
  // `unwrap_asset`. Fresh mints per run: the AssetVault PDA is seeded by the underlying mint.
  describe('asset vaults', () => {
    let underlyingMint: KeyPairSigner
    let confidentialMint: KeyPairSigner
    let vaultTokenAccount: Address

    async function setMintAuthorityToVault(mint: Address) {
      await sendInstructions({
        instructions: getSetAuthorityInstruction(
          { owned: mint, owner: admin, authorityType: AuthorityType.MintTokens, newAuthority: vaultAuthority },
          { programAddress: TOKEN_2022_PROGRAM_ADDRESS },
        ),
        payer: admin,
        rpc,
        sendAndConfirm,
      })
    }

    beforeAll(async () => {
      underlyingMint = await createMint(clients, admin, { decimals: 6 })
      confidentialMint = await createMint(clients, admin, { decimals: 6, token2022: true })
      await setMintAuthorityToVault(confidentialMint.address)
      await sendInstructions({
        instructions: await envelopeVault.getInitializeAssetInstructionAsync({
          admin,
          underlyingMint: underlyingMint.address,
          confidentialMint: confidentialMint.address,
        }),
        payer: admin,
        rpc,
        sendAndConfirm,
      })
      const [assetVaultAddress] = await envelopeVault.findAssetVaultPda({ underlyingMint: underlyingMint.address })
      vaultTokenAccount = (await envelopeVault.fetchAssetVault(rpc, assetVaultAddress)).data.vaultTokenAccount
    })

    async function assetUser(amount: bigint) {
      const user = await createFundedSigner({ rpc, rpcSubscriptions })
      await mintTo(clients, admin, underlyingMint.address, user.address, amount)
      await sendInstructions({
        instructions: await getCreateAssociatedTokenIdempotentInstructionAsync({
          payer: admin,
          owner: user.address,
          mint: confidentialMint.address,
        }),
        payer: admin,
        rpc,
        sendAndConfirm,
      })
      const [userUnderlying] = await findAssociatedTokenPda({
        owner: user.address,
        mint: underlyingMint.address,
        tokenProgram: TOKEN_PROGRAM_ADDRESS,
      })
      const [userConfidential] = await findAssociatedTokenPda({
        owner: user.address,
        mint: confidentialMint.address,
        tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
      })
      return { user, userUnderlying, userConfidential }
    }

    function wrapAsset(u: Awaited<ReturnType<typeof assetUser>>, amount: bigint) {
      return envelopeVault.getWrapAssetInstructionAsync({
        user: u.user,
        underlyingMint: underlyingMint.address,
        userUnderlying: u.userUnderlying,
        vaultTokenAccount,
        confidentialMint: confidentialMint.address,
        userConfidential: u.userConfidential,
        amount,
      })
    }

    function unwrapAsset(u: Awaited<ReturnType<typeof assetUser>>, amount: bigint) {
      return envelopeVault.getUnwrapAssetInstructionAsync({
        user: u.user,
        underlyingMint: underlyingMint.address,
        confidentialMint: confidentialMint.address,
        userConfidential: u.userConfidential,
        vaultTokenAccount,
        userUnderlying: u.userUnderlying,
        amount,
      })
    }

    async function assetSupplyInvariantHolds() {
      const [supply, vault] = await Promise.all([
        rpc.getTokenSupply(confidentialMint.address).send(),
        rpc.getTokenAccountBalance(vaultTokenAccount).send(),
      ])
      expect(supply.value.amount).toEqual(vault.value.amount)
    }

    it('wraps and unwraps 1:1, keeping the supply invariant', async () => {
      const u = await assetUser(50_000_000n)
      await sendInstructions({ instructions: await wrapAsset(u, 30_000_000n), payer: u.user, rpc, sendAndConfirm })
      expect((await rpc.getTokenAccountBalance(u.userConfidential).send()).value.amount).toEqual('30000000')
      await assetSupplyInvariantHolds()

      const approve = getApproveInstruction(
        { source: u.userConfidential, delegate: vaultAuthority, owner: u.user, amount: 10_000_000n },
        { programAddress: TOKEN_2022_PROGRAM_ADDRESS },
      )
      await sendInstructions({
        instructions: [approve, await unwrapAsset(u, 10_000_000n)],
        payer: u.user,
        rpc,
        sendAndConfirm,
      })
      expect((await rpc.getTokenAccountBalance(u.userUnderlying).send()).value.amount).toEqual('30000000')
      await assetSupplyInvariantHolds()
    })

    it('has no tier limit: a Free-tier user can wrap more than the USDC Free limit', async () => {
      const u = await assetUser(FREE_LIMIT * 3n)
      await sendInstructions({ instructions: await wrapAsset(u, FREE_LIMIT * 3n), payer: u.user, rpc, sendAndConfirm })
      await assetSupplyInvariantHolds()
    })

    it('rejects unwrap_asset without a prior delegate approval', async () => {
      const u = await assetUser(10_000_000n)
      await sendInstructions({ instructions: await wrapAsset(u, 5_000_000n), payer: u.user, rpc, sendAndConfirm })
      await expect(
        sendInstructions({ instructions: await unwrapAsset(u, 1_000_000n), payer: u.user, rpc, sendAndConfirm }),
      ).rejects.toThrow()
    })

    it('rejects wrap_asset into a different confidential mint (cUSDC)', async () => {
      const u = await assetUser(10_000_000n)
      const instruction = await envelopeVault.getWrapAssetInstructionAsync({
        user: u.user,
        underlyingMint: underlyingMint.address,
        userUnderlying: u.userUnderlying,
        vaultTokenAccount,
        confidentialMint: cusdcMint.address,
        userConfidential: await userCusdcAddress(u.user.address),
        amount: 1_000_000n,
      })
      await expect(
        sendInstructions({ instructions: instruction, payer: u.user, rpc, sendAndConfirm }),
      ).rejects.toThrow()
    })

    it('rejects initialize_asset from anyone but the admin', async () => {
      const outsider = await createFundedSigner({ rpc, rpcSubscriptions })
      const otherUnderlying = await createMint(clients, admin, { decimals: 6 })
      const otherConfidential = await createMint(clients, admin, { decimals: 6, token2022: true })
      await setMintAuthorityToVault(otherConfidential.address)
      const instruction = await envelopeVault.getInitializeAssetInstructionAsync({
        admin: outsider,
        underlyingMint: otherUnderlying.address,
        confidentialMint: otherConfidential.address,
      })
      await expect(
        sendInstructions({ instructions: instruction, payer: outsider, rpc, sendAndConfirm }),
      ).rejects.toThrow()
    })

    it('rejects initialize_asset when the vault cannot mint the confidential mint', async () => {
      const otherUnderlying = await createMint(clients, admin, { decimals: 6 })
      const adminMinted = await createMint(clients, admin, { decimals: 6, token2022: true }) // authority stays admin
      const instruction = await envelopeVault.getInitializeAssetInstructionAsync({
        admin,
        underlyingMint: otherUnderlying.address,
        confidentialMint: adminMinted.address,
      })
      await expect(sendInstructions({ instructions: instruction, payer: admin, rpc, sendAndConfirm })).rejects.toThrow()
    })

    it('rejects initialize_asset when decimals differ', async () => {
      const otherUnderlying = await createMint(clients, admin, { decimals: 6 })
      const wrongDecimals = await createMint(clients, admin, { decimals: 9, token2022: true })
      await setMintAuthorityToVault(wrongDecimals.address)
      const instruction = await envelopeVault.getInitializeAssetInstructionAsync({
        admin,
        underlyingMint: otherUnderlying.address,
        confidentialMint: wrongDecimals.address,
      })
      await expect(sendInstructions({ instructions: instruction, payer: admin, rpc, sendAndConfirm })).rejects.toThrow()
    })
  })
})
