import {
  createTransactionMessage,
  createTransactionPlanExecutor,
  createTransactionPlanner,
  getBase64EncodedWireTransaction,
  getSignatureFromTransaction,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  summarizeTransactionPlanResult,
  type InstructionPlan,
  type Rpc,
  type SolanaRpcApi,
  type TransactionPlanResultContextWithSignature,
  type TransactionSigner,
} from '@solana/kit'

type ExecutorContext = TransactionPlanResultContextWithSignature & { wireTransaction: string }

// Signs every transaction in an InstructionPlan and returns each one's base64 wire encoding, in
// order — but never sends. Unlike scripts/lib/executePlan.ts, this bridge doesn't submit
// anything to the network itself: "the WebView builds instructions/transactions and proofs;
// React Native only signs (MWA) and sends" (Phase 3 design). `payer`'s `signTransactions` here is
// expected to round-trip to React Native for an MWA signature — see createHostTransactionSigner.
export async function signInstructionPlan(
  instructionPlan: InstructionPlan,
  payer: TransactionSigner,
  rpc: Rpc<SolanaRpcApi>,
): Promise<string[]> {
  const transactionPlanner = createTransactionPlanner({
    createTransactionMessage: () =>
      pipe(createTransactionMessage({ version: 0 }), (m) => setTransactionMessageFeePayerSigner(payer, m)),
  })

  const transactionPlanExecutor = createTransactionPlanExecutor<ExecutorContext>({
    executeTransactionMessage: async (context, message) => {
      const { value: latestBlockhash } = await rpc.getLatestBlockhash().send()
      const messageWithLifetime = setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, message)
      const transaction = await signTransactionMessageWithSigners(messageWithLifetime)
      context.transaction = transaction
      const wireTransaction = getBase64EncodedWireTransaction(transaction)
      return { signature: getSignatureFromTransaction(transaction), transaction, wireTransaction }
    },
  })

  const transactionPlan = await transactionPlanner(instructionPlan)
  const result = await transactionPlanExecutor(transactionPlan)
  const summary = summarizeTransactionPlanResult(result)

  if (!summary.successful) {
    throw new Error(
      `instruction plan signing failed: ${summary.failedTransactions.length} failed, ${summary.canceledTransactions.length} canceled`,
    )
  }

  return summary.successfulTransactions.map((tx) => tx.context.wireTransaction)
}
