import { findAssociatedTokenPda, TOKEN_PROGRAM_ADDRESS } from '@solana-program/token'
import { type Address, type KeyPairSigner } from '@solana/kit'
import { beforeAll, describe, expect, it } from 'vitest'
import { envelopeStake } from '../src'
import { createFundedSigner } from './create-funded-signer'
import { COOLDOWN_SECS, PASS_BUSINESS_PRICE, PASS_MEMBER_PRICE, PASS_PERIOD_SECS } from './lib/constants'
import { CONSTRAINT_SEEDS, expectProgramError } from './lib/expect-program-error'
import { mintTo } from './lib/mints'
import { ensurePassConfig, ensureStakePool } from './lib/setup-stake-pool'
import { testAdminSigner } from './lib/test-admin'
import { createTestClients, sendInstructions } from './send-instruction'

const rpcUrl = process.env.ANCHOR_PROVIDER_URL!
const { rpc, rpcSubscriptions, sendAndConfirm } = createTestClients(rpcUrl)
const clients = { rpc, rpcSubscriptions, sendAndConfirm }

describe('envelope_stake', () => {
  let admin: KeyPairSigner
  let skrMint: Address
  let poolAddress: Address

  beforeAll(async () => {
    admin = await createFundedSigner({ rpc, rpcSubscriptions, signer: await testAdminSigner() })
    ;({ poolAddress, skrMint } = await ensureStakePool(clients, admin))
  })

  async function vaultSkrAddress() {
    const pool = await envelopeStake.fetchPool(rpc, poolAddress)
    return pool.data.vaultSkr
  }

  async function userSkrAddress(user: KeyPairSigner) {
    const [ata] = await findAssociatedTokenPda({
      owner: user.address,
      mint: skrMint,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    })
    return ata
  }

  async function stakeAsFreshUser(amount: bigint) {
    const user = await createFundedSigner({ rpc, rpcSubscriptions })
    await mintTo(clients, admin, skrMint, user.address, amount)
    const instruction = await envelopeStake.getStakeInstructionAsync({
      user,
      userSkr: await userSkrAddress(user),
      vaultSkr: await vaultSkrAddress(),
      amount,
    })
    await sendInstructions({ instructions: instruction, payer: user, rpc, sendAndConfirm })
    return user
  }

  it('stakes SKR and increases the position amount', async () => {
    const amount = 2_000_000_000n
    const user = await stakeAsFreshUser(amount)

    const [stakePositionAddress] = await envelopeStake.findStakePositionPda({ user: user.address })
    const position = await envelopeStake.fetchStakePosition(rpc, stakePositionAddress)
    expect(position.data.amount).toEqual(amount)
    expect(position.data.unlockRequestedAt).toEqual(0n)
  })

  it('increases amount across repeated stakes', async () => {
    const user = await stakeAsFreshUser(1_000_000_000n)
    await mintTo(clients, admin, skrMint, user.address, 500_000_000n)
    const instruction = await envelopeStake.getStakeInstructionAsync({
      user,
      userSkr: await userSkrAddress(user),
      vaultSkr: await vaultSkrAddress(),
      amount: 500_000_000n,
    })
    await sendInstructions({ instructions: instruction, payer: user, rpc, sendAndConfirm })

    const [stakePositionAddress] = await envelopeStake.findStakePositionPda({ user: user.address })
    const position = await envelopeStake.fetchStakePosition(rpc, stakePositionAddress)
    expect(position.data.amount).toEqual(1_500_000_000n)
  })

  // Audit lead (THREAT_MODEL.md): `init_if_needed` on `stake_position`. The test above shows an
  // existing position is added to, not re-created; this one shows nobody else can reach it.
  it("init_if_needed on stake_position: rejects staking into another wallet's position", async () => {
    const alice = await stakeAsFreshUser(1_000_000_000n)
    const [aliceStake] = await envelopeStake.findStakePositionPda({ user: alice.address })

    const bob = await createFundedSigner({ rpc, rpcSubscriptions })
    await mintTo(clients, admin, skrMint, bob.address, 1_000_000n)
    const instruction = await envelopeStake.getStakeInstructionAsync({
      user: bob,
      userSkr: await userSkrAddress(bob),
      vaultSkr: await vaultSkrAddress(),
      stakePosition: aliceStake,
      amount: 1_000_000n,
    })
    await expectProgramError(
      sendInstructions({ instructions: instruction, payer: bob, rpc, sendAndConfirm }),
      CONSTRAINT_SEEDS,
    )
    const position = await envelopeStake.fetchStakePosition(rpc, aliceStake)
    expect(position.data.user).toEqual(alice.address)
    expect(position.data.amount).toEqual(1_000_000_000n)
  })

  it('rejects staking zero', async () => {
    const user = await createFundedSigner({ rpc, rpcSubscriptions })
    await mintTo(clients, admin, skrMint, user.address, 1n)
    const instruction = await envelopeStake.getStakeInstructionAsync({
      user,
      userSkr: await userSkrAddress(user),
      vaultSkr: await vaultSkrAddress(),
      amount: 0n,
    })
    await expect(sendInstructions({ instructions: instruction, payer: user, rpc, sendAndConfirm })).rejects.toThrow()
  })

  it('request_unstake starts the cooldown; withdraw_unstaked enforces it', async () => {
    const amount = 3_000_000_000n
    const user = await stakeAsFreshUser(amount)
    const [stakePositionAddress] = await envelopeStake.findStakePositionPda({ user: user.address })
    const userSkr = await userSkrAddress(user)

    // Cooldown not started yet: withdraw must fail.
    const earlyWithdraw = await envelopeStake.getWithdrawUnstakedInstructionAsync({
      user,
      vaultSkr: await vaultSkrAddress(),
      userSkr,
    })
    await expect(sendInstructions({ instructions: earlyWithdraw, payer: user, rpc, sendAndConfirm })).rejects.toThrow()

    const requestInstruction = await envelopeStake.getRequestUnstakeInstructionAsync({ user })
    await sendInstructions({ instructions: requestInstruction, payer: user, rpc, sendAndConfirm })

    const afterRequest = await envelopeStake.fetchStakePosition(rpc, stakePositionAddress)
    expect(afterRequest.data.unlockRequestedAt).not.toEqual(0n)

    // Cooldown started but not elapsed yet: withdraw must still fail.
    const tooSoon = await envelopeStake.getWithdrawUnstakedInstructionAsync({
      user,
      vaultSkr: await vaultSkrAddress(),
      userSkr,
    })
    await expect(sendInstructions({ instructions: tooSoon, payer: user, rpc, sendAndConfirm })).rejects.toThrow()

    // A second request_unstake while one is already pending must fail.
    await expect(
      sendInstructions({ instructions: requestInstruction, payer: user, rpc, sendAndConfirm }),
    ).rejects.toThrow()

    // Staking more while an unstake is pending must fail.
    await mintTo(clients, admin, skrMint, user.address, 1_000_000n)
    const stakeWhilePending = await envelopeStake.getStakeInstructionAsync({
      user,
      userSkr,
      vaultSkr: await vaultSkrAddress(),
      amount: 1_000_000n,
    })
    await expect(
      sendInstructions({ instructions: stakeWhilePending, payer: user, rpc, sendAndConfirm }),
    ).rejects.toThrow()

    await new Promise((resolve) => setTimeout(resolve, (Number(COOLDOWN_SECS) + 2) * 1000))

    const withdraw = await envelopeStake.getWithdrawUnstakedInstructionAsync({
      user,
      vaultSkr: await vaultSkrAddress(),
      userSkr,
    })
    await sendInstructions({ instructions: withdraw, payer: user, rpc, sendAndConfirm })

    const afterWithdraw = await envelopeStake.fetchStakePosition(rpc, stakePositionAddress)
    expect(afterWithdraw.data.amount).toEqual(0n)
    expect(afterWithdraw.data.unlockRequestedAt).toEqual(0n)
  }, 30_000)
  describe('membership pass', () => {
    let treasury: Address

    beforeAll(async () => {
      ;({ treasury } = await ensurePassConfig(clients, admin, skrMint))
    })

    async function passUser(skrAmount: bigint) {
      const user = await createFundedSigner({ rpc, rpcSubscriptions })
      await mintTo(clients, admin, skrMint, user.address, skrAmount)
      return user
    }

    async function buyPass(user: KeyPairSigner, tier: number, periods: number, payer: KeyPairSigner = user) {
      await sendInstructions({
        instructions: await envelopeStake.getBuyPassInstructionAsync({
          user,
          payer,
          userSkr: await userSkrAddress(user),
          treasury,
          tier,
          periods,
        }),
        payer,
        rpc,
        sendAndConfirm,
      })
    }

    async function passOf(user: KeyPairSigner) {
      const [passAddress] = await envelopeStake.findPassPda({ user: user.address })
      return (await envelopeStake.fetchPass(rpc, passAddress)).data
    }

    const balance = async (account: Address) => BigInt((await rpc.getTokenAccountBalance(account).send()).value.amount)
    const nowSecs = () => BigInt(Math.floor(Date.now() / 1000))

    it('buys a Member pass: SKR goes to the treasury, the pass runs one period', async () => {
      const user = await passUser(PASS_MEMBER_PRICE * 2n)
      const treasuryBefore = await balance(treasury)
      await buyPass(user, 1, 1)
      expect((await balance(treasury)) - treasuryBefore).toEqual(PASS_MEMBER_PRICE)
      expect(await balance(await userSkrAddress(user))).toEqual(PASS_MEMBER_PRICE)
      const pass = await passOf(user)
      expect(pass.tier).toEqual(1)
      expect(pass.user).toEqual(user.address)
      expect(pass.expiresAt).toBeGreaterThan(nowSecs())
      expect(pass.expiresAt).toBeLessThanOrEqual(nowSecs() + PASS_PERIOD_SECS + 2n)
    })

    it('extends an active pass of the same tier from its expiry', async () => {
      const user = await passUser(PASS_MEMBER_PRICE * 3n)
      await buyPass(user, 1, 1)
      const first = (await passOf(user)).expiresAt
      await buyPass(user, 1, 2)
      expect((await passOf(user)).expiresAt).toEqual(first + 2n * PASS_PERIOD_SECS)
    })

    it('upgrades to Business from now; refuses a downgrade while Business is active', async () => {
      const user = await passUser(PASS_MEMBER_PRICE + PASS_BUSINESS_PRICE * 2n)
      await buyPass(user, 1, 1)
      await buyPass(user, 2, 1)
      expect((await passOf(user)).tier).toEqual(2)
      await expect(buyPass(user, 1, 1)).rejects.toThrow()
    })

    it('lets a separate payer cover the pass account rent', async () => {
      const user = await passUser(PASS_MEMBER_PRICE)
      const payer = await createFundedSigner({ rpc, rpcSubscriptions })
      const userLamportsBefore = (await rpc.getBalance(user.address).send()).value
      await buyPass(user, 1, 1, payer)
      expect((await passOf(user)).tier).toEqual(1)
      expect((await rpc.getBalance(user.address).send()).value).toEqual(userLamportsBefore)
    })

    it('rejects an invalid tier, zero periods, and more than 12 periods', async () => {
      const user = await passUser(PASS_BUSINESS_PRICE * 13n)
      await expect(buyPass(user, 3, 1)).rejects.toThrow()
      await expect(buyPass(user, 1, 0)).rejects.toThrow()
      await expect(buyPass(user, 1, 13)).rejects.toThrow()
    })

    it('rejects a pass the user cannot pay for', async () => {
      const user = await passUser(PASS_MEMBER_PRICE - 1n)
      await expect(buyPass(user, 1, 1)).rejects.toThrow()
    })

    it('rejects initialize_pass_config from anyone but the admin', async () => {
      const outsider = await createFundedSigner({ rpc, rpcSubscriptions })
      const instruction = await envelopeStake.getInitializePassConfigInstructionAsync({
        admin: outsider,
        treasury,
        memberPrice: 1n,
        businessPrice: 1n,
        periodSecs: 1n,
      })
      await expect(
        sendInstructions({ instructions: instruction, payer: outsider, rpc, sendAndConfirm }),
      ).rejects.toThrow()
    })
  })
})
