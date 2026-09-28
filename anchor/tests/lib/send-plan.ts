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

// `signTransactionMessageWithSigners` returns the general `TransactionWithLifetime` union, even
// though `setTransactionMessageLifetimeUsingBlockhash` guarantees a blockhash lifetime here (see
// scripts/lib/executePlan.ts, where this same cast is needed for the same reason).
type SignedBlockhashTransaction = FullySignedTransaction &
  TransactionWithinSizeLimit &
  Transaction &
  TransactionWithBlockhashLifetime

// Mirrors scripts/lib/executePlan.ts, trimmed to what the test suite needs (no per-tx stats).
// Used for mint/ATA setup via @solana-program/token(-2022)'s InstructionPlan builders, which may
// span more than one transaction.
export async function sendInstructionPlan(
  instructionPlan: InstructionPlan,
  payer: TransactionSigner,
  rpc: Rpc<SolanaRpcApi>,
  rpcSubscriptions: RpcSubscriptions<SolanaRpcSubscriptionsApi>,
): Promise<void> {
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
      return { signature }
    },
  })

  const transactionPlan = await transactionPlanner(instructionPlan)
  const result = await transactionPlanExecutor(transactionPlan)
  const summary = summarizeTransactionPlanResult(result)

  if (!summary.successful) {
    throw new Error(
      `instruction plan failed: ${summary.failedTransactions.length} failed, ${summary.canceledTransactions.length} canceled`,
    )
  }
}
