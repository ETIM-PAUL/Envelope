import {
  appendTransactionMessageInstructions,
  assertIsTransactionWithBlockhashLifetime,
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  createTransactionMessage,
  getSignatureFromTransaction,
  pipe,
  sendAndConfirmTransactionFactory,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  type Instruction,
  type KeyPairSigner,
} from '@solana/kit'

export function createTestClients(rpcUrl: string) {
  const rpc = createSolanaRpc(rpcUrl)
  const rpcSubscriptions = createSolanaRpcSubscriptions(rpcUrl.replace('http', 'ws').replace('8899', '8900'))
  const sendAndConfirm = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions })
  return { rpc, rpcSubscriptions, sendAndConfirm }
}

// Shared by every test file: builds, signs, and sends one or more instructions in a single
// transaction, returning its signature.
export async function sendInstructions({
  instructions,
  payer,
  rpc,
  sendAndConfirm,
}: {
  instructions: Instruction | readonly Instruction[]
  payer: KeyPairSigner
  rpc: ReturnType<typeof createSolanaRpc>
  sendAndConfirm: ReturnType<typeof sendAndConfirmTransactionFactory>
}) {
  const { value: latestBlockhash } = await rpc.getLatestBlockhash().send()
  const transaction = await pipe(
    createTransactionMessage({ version: 0 }),
    (tx) => setTransactionMessageFeePayerSigner(payer, tx),
    (tx) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
    (tx) => appendTransactionMessageInstructions(Array.isArray(instructions) ? instructions : [instructions], tx),
    (tx) => signTransactionMessageWithSigners(tx),
  )
  assertIsTransactionWithBlockhashLifetime(transaction)
  await sendAndConfirm(transaction, { commitment: 'confirmed' })
  return getSignatureFromTransaction(transaction)
}
