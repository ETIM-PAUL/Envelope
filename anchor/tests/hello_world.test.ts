import { type KeyPairSigner } from '@solana/kit'
import { beforeAll, describe, expect, it } from 'vitest'
import { helloWorld } from '../src'
import { createFundedSigner } from './create-funded-signer'
import { createTestClients, sendInstructions } from './send-instruction'

// The `anchor test` command starts a local validator and provides this variable.
const rpcUrl = process.env.ANCHOR_PROVIDER_URL!
const { rpc, rpcSubscriptions, sendAndConfirm } = createTestClients(rpcUrl)

describe('hello_world', () => {
  let payer: KeyPairSigner

  beforeAll(async () => {
    payer = await createFundedSigner({ rpc, rpcSubscriptions })
  })

  it('initializes the counter', async () => {
    // ARRANGE
    const instruction = await helloWorld.getInitializeInstructionAsync({ payer })

    // ACT
    const signature = await sendInstructions({ instructions: instruction, payer, rpc, sendAndConfirm })
    console.log('Initialize transaction signature', signature)

    // ASSERT
    const [counterAddress] = await helloWorld.findCounterPda({ authority: payer.address })
    const counter = await helloWorld.fetchCounter(rpc, counterAddress)
    expect(counter.data.count).toEqual(0n)
  })

  it('increments the counter', async () => {
    // ARRANGE
    const instruction = await helloWorld.getIncrementInstructionAsync({ authority: payer })

    // ACT
    const signature = await sendInstructions({ instructions: instruction, payer, rpc, sendAndConfirm })
    console.log('Increment transaction signature', signature)

    // ASSERT
    const [counterAddress] = await helloWorld.findCounterPda({ authority: payer.address })
    const counter = await helloWorld.fetchCounter(rpc, counterAddress)
    expect(counter.data.count).toEqual(1n)
  })
})
