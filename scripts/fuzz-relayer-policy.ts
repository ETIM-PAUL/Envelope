// Phase 18 self-audit: "fuzz the validation policy with malicious transactions." Proves the two
// real gaps found and fixed in relayer/src/policy.ts are actually closed — not just typechecked.
// Neither case needs a real ZK proof: policy.ts only inspects discriminators and account lists
// before ever simulating/submitting, so a syntactically-plausible instruction with bogus proof
// data is enough to exercise the check. Each case expects a 400 rejection; the script fails loudly
// if any of them gets a 200.
import {
  address,
  appendTransactionMessageInstructions,
  compileTransactionMessage,
  createNoopSigner,
  createTransactionMessage,
  generateKeyPairSigner,
  getCompiledTransactionMessageEncoder,
  getTransactionEncoder,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  type Transaction,
} from '@solana/kit'
import { getCreateAccountInstruction } from '@solana-program/system'
import { TOKEN_PROGRAM_ADDRESS } from '@solana-program/token'
import { getCloseContextStateInstruction } from '@solana-program/zk-elgamal-proof'
import { createDevnetClients } from './lib/rpc.ts'
import { readDevnetConfig } from './lib/keys.ts'

const RELAYER_ADDRESS = address('Fjqmc1BpebL3FMVZo93zXMKMuiiMxSS57r5w8PHUP8Fe')

async function relay(owner: string, wireBase64: string) {
  const response = await fetch('http://localhost:8787/relay', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ owner, transactions: [wireBase64] }),
  })
  return { status: response.status, body: await response.json() }
}

async function buildWire(
  rpc: ReturnType<typeof createDevnetClients>['rpc'],
  instructions: Parameters<typeof appendTransactionMessageInstructions>[0],
  otherSigners: string[] = [],
) {
  const { value: blockhash } = await rpc.getLatestBlockhash().send()
  const message = setTransactionMessageLifetimeUsingBlockhash(
    blockhash,
    appendTransactionMessageInstructions(
      instructions,
      setTransactionMessageFeePayer(RELAYER_ADDRESS, createTransactionMessage({ version: 0 })),
    ),
  )
  const compiled = compileTransactionMessage(message as never)
  const messageBytes = getCompiledTransactionMessageEncoder().encode(compiled)
  // Every required signer needs a slot (even if left null, per /relay's "partially signed"
  // contract) — a transaction with fewer signature slots than required signers fails to decode
  // at all, which would otherwise mask these cases as "malformed transaction" instead of
  // exercising the actual policy check this script means to prove.
  const signatures: Transaction['signatures'] = { [RELAYER_ADDRESS]: null }
  for (const signer of otherSigners) signatures[signer as keyof typeof signatures] = null
  const transaction: Transaction = { messageBytes: messageBytes as Transaction['messageBytes'], signatures }
  return Buffer.from(getTransactionEncoder().encode(transaction)).toString('base64')
}

async function expectRejected(name: string, owner: string, wire: string) {
  const { status, body } = await relay(owner, wire)
  console.log(`--- ${name} ---`)
  console.log({ status, body })
  if (status === 200) {
    throw new Error(`FUZZ FAILURE: "${name}" was accepted by the relayer — this gap is NOT closed`)
  }
  console.log(`  correctly rejected.\n`)
}

async function main() {
  const clients = createDevnetClients()
  const { rpc } = clients
  const config = readDevnetConfig() as { wallets?: { alice: string } }
  const owner = config.wallets?.alice ?? RELAYER_ADDRESS

  // Case 1: CreateAccount funding a new account whose owner-to-be is NOT the ZK ElGamal Proof
  // program — e.g. the classic Token program. Before the fix, policy.ts only checked the
  // discriminator, so this would have passed as "funding a proof context account" and let an
  // attacker get the relayer to pay rent into an account the attacker fully controls.
  const bogusContextAccount = await generateKeyPairSigner()
  const createAccountWrongOwner = getCreateAccountInstruction({
    payer: createNoopSigner(RELAYER_ADDRESS),
    newAccount: bogusContextAccount,
    lamports: 1_000_000n,
    space: 0n,
    programAddress: TOKEN_PROGRAM_ADDRESS, // anything that isn't the ZK ElGamal Proof program
  })
  await expectRejected(
    'CreateAccount funding a non-ZK-proof-program-owned account',
    owner,
    await buildWire(rpc, [createAccountWrongOwner], [bogusContextAccount.address]),
  )

  // Case 2: CloseContextState where `destination` is the relayer (the "safe"-looking part) but
  // `authority` is an attacker's own key, not the relayer. Before the fix, policy.ts only checked
  // that relayer's WRITABLE appearances were in an allowed instruction — it never checked who the
  // authority actually was, so a context account funded by the relayer but authorized to someone
  // else could be closed by that someone else later, with the relayer never even seeing that
  // transaction. This transaction itself (relayer as destination, attacker as authority) should
  // already be rejected now, since the authority-position check requires relayer there too.
  const attacker = await generateKeyPairSigner()
  const closeWrongAuthority = getCloseContextStateInstruction({
    contextState: bogusContextAccount.address,
    destination: RELAYER_ADDRESS,
    authority: attacker,
  })
  await expectRejected(
    'CloseContextState with the relayer as destination but an attacker as authority',
    owner,
    await buildWire(rpc, [closeWrongAuthority], [attacker.address]),
  )

  console.log('all fuzz cases correctly rejected — both gaps are closed.')
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
