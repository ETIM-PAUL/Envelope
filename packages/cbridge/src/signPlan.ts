import {
  createTransactionMessage,
  createTransactionPlanExecutor,
  createTransactionPlanner,
  getBase64EncodedWireTransaction,
  partiallySignTransactionMessageWithSigners,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  summarizeTransactionPlanResult,
  type InstructionPlan,
  type Rpc,
  type SolanaRpcApi,
  type Transaction,
  type TransactionSigner,
} from '@solana/kit'

// No `signature` field: unlike TransactionPlanResultContextWithSignature's default, `payer` here
// may be a NoopSigner (the relayer, signing later via /relay) — getSignatureFromTransaction would
// throw on its still-empty fee-payer slot, and nothing downstream needs a signature this early.
type ExecutorContext = { transaction?: Transaction; wireTransaction: string }

// Signs every transaction in an InstructionPlan and returns each one's base64 wire encoding, in
// order — but never sends. Unlike scripts/lib/executePlan.ts, this bridge doesn't submit
// anything to the network itself: "the WebView builds instructions/transactions and proofs;
// React Native only signs (MWA) and sends" (Phase 3 design). Any real signer embedded in the
// plan's instructions (e.g. the owner's authority, via createHostTransactionSigner) round-trips to
// React Native for an MWA signature; `payer` itself may instead be a NoopSigner (the relayer),
// left for the relayer service to co-sign server-side — see protocol.ts's BuildTransferPlanParams.
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
      // Not signTransactionMessageWithSigners: it asserts the result is *fully* signed, which
      // throws on a NoopSigner's still-empty slot (the relayer's, filled in later by /relay).
      const transaction = await partiallySignTransactionMessageWithSigners(messageWithLifetime)
      context.transaction = transaction
      const wireTransaction = getBase64EncodedWireTransaction(transaction)
      return { transaction, wireTransaction }
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
