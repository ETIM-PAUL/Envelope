import {
  createTransactionMessage,
  createTransactionPlanExecutor,
  createTransactionPlanner,
  getSignatureFromTransaction,
  getTransactionSize,
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
  type TransactionPlanResultContextWithSignature,
} from '@solana/kit'

export type TransactionStats = {
  signature: string
  bytes: number
  computeUnitsConsumed: number | null
}

type ExecutorContext = TransactionPlanResultContextWithSignature & { stats: TransactionStats }

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

// Plans then executes an InstructionPlan (from @solana-program/* createMint/mintToATA/confidential
// helpers), splitting into multiple transactions if needed. Returns per-transaction stats (bytes,
// compute units consumed) for benchmarking, in order.
export async function sendInstructionPlan(
  instructionPlan: InstructionPlan,
  payer: TransactionSigner,
  { rpc, rpcSubscriptions }: Clients,
): Promise<TransactionStats[]> {
  const sendAndConfirmTransaction = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions })

  const transactionPlanner = createTransactionPlanner({
    createTransactionMessage: () =>
      pipe(createTransactionMessage({ version: 0 }), (m) => setTransactionMessageFeePayerSigner(payer, m)),
  })

  const transactionPlanExecutor = createTransactionPlanExecutor<ExecutorContext>({
    executeTransactionMessage: async (context, message) => {
      const { value: latestBlockhash } = await rpc.getLatestBlockhash().send()
      const messageWithLifetime = setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, message)
      const transaction = (await signTransactionMessageWithSigners(messageWithLifetime)) as SignedBlockhashTransaction
      context.transaction = transaction
      const signature = getSignatureFromTransaction(transaction)
      await sendAndConfirmTransaction(transaction, { commitment: 'confirmed' })
      const confirmed = await rpc
        .getTransaction(signature, { commitment: 'confirmed', encoding: 'json', maxSupportedTransactionVersion: 0 })
        .send()
      const stats: TransactionStats = {
        signature,
        bytes: getTransactionSize(transaction),
        computeUnitsConsumed:
          confirmed?.meta?.computeUnitsConsumed != null ? Number(confirmed.meta.computeUnitsConsumed) : null,
      }
      return { signature, transaction, stats }
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

  return summary.successfulTransactions.map((tx) => tx.context.stats)
}
