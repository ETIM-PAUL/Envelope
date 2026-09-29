import { findAssociatedTokenPda, TOKEN_PROGRAM_ADDRESS } from '@solana-program/token'
import { type Address, type KeyPairSigner } from '@solana/kit'
import { beforeAll, describe, expect, it } from 'vitest'
import { envelopeStake } from '../src'
import { createFundedSigner } from './create-funded-signer'
import { COOLDOWN_SECS } from './lib/constants'
import { mintTo } from './lib/mints'
import { ensureStakePool } from './lib/setup-stake-pool'
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
})
