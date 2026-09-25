import {
  createTransactionMessage,
  createTransactionPlanExecutor,
  createTransactionPlanner,
  getSignatureFromTransaction,
  pipe,
  sendAndConfirmTransactionFactory,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  summarizeTransactionPlanResult,
  type FullySignedTransaction,
  type InstructionPlan,
  type Rpc,
  type RpcSubscriptions,
  type SolanaRpcApi,
  type SolanaRpcSubscriptionsApi,
  type Transaction,
  type TransactionSigner,
  type TransactionWithBlockhashLifetime,
  type TransactionWithinSizeLimit,
} from '@solana/kit'

// `signTransactionMessageWithSigners` returns the general `TransactionWithLifetime` union,
// even though `setTransactionMessageLifetimeUsingBlockhash` guarantees a blockhash lifetime here.
type SignedBlockhashTransaction = FullySignedTransaction &
  TransactionWithinSizeLimit &
  Transaction &
  TransactionWithBlockhashLifetime

type Clients = {
  rpc: Rpc<SolanaRpcApi>
  rpcSubscriptions: RpcSubscriptions<SolanaRpcSubscriptionsApi>
}

// Plans then executes an InstructionPlan (from @solana-program/* createMint/mintToATA helpers),
// splitting into multiple transactions if needed. Returns every transaction signature, in order.
export async function sendInstructionPlan(
  instructionPlan: InstructionPlan,
  payer: TransactionSigner,
  { rpc, rpcSubscriptions }: Clients,
): Promise<string[]> {
  const sendAndConfirmTransaction = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions })

  const transactionPlanner = createTransactionPlanner({
    createTransactionMessage: () =>
      pipe(createTransactionMessage({ version: 0 }), (m) => setTransactionMessageFeePayerSigner(payer, m)),
  })

  const transactionPlanExecutor = createTransactionPlanExecutor({
    executeTransactionMessage: async (context, message) => {
      const { value: latestBlockhash } = await rpc.getLatestBlockhash().send()
      const messageWithLifetime = setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, message)
      const transaction = (await signTransactionMessageWithSigners(messageWithLifetime)) as SignedBlockhashTransaction
      context.transaction = transaction
      const signature = getSignatureFromTransaction(transaction)
      await sendAndConfirmTransaction(transaction, { commitment: 'confirmed' })
      return { signature, transaction }
    },
  })

  const transactionPlan = await transactionPlanner(instructionPlan)
  const result = await transactionPlanExecutor(transactionPlan)
  const summary = summarizeTransactionPlanResult(result)

  if (!summary.successful) {
    throw new Error(
      `instruction plan execution failed: ${summary.failedTransactions.length} failed, ${summary.canceledTransactions.length} canceled`,
    )
  }

  return summary.successfulTransactions.map((tx) => tx.context.signature)
}
