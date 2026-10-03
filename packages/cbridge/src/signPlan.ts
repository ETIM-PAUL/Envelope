import {
  compileTransaction,
  createTransactionMessage,
  createTransactionPlanner,
  flattenTransactionPlan,
  getBase64EncodedWireTransaction,
  getSignersFromTransactionMessage,
  isTransactionModifyingSigner,
  isTransactionPartialSigner,
  partiallySignTransactionMessageWithSigners,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  type InstructionPlan,
  type Rpc,
  type SolanaRpcApi,
  type Transaction,
  type TransactionMessage,
  type TransactionMessageWithFeePayer,
  type TransactionModifyingSigner,
  type TransactionSigner,
} from '@solana/kit'
type PlannedMessage = TransactionMessage & TransactionMessageWithFeePayer

// Signs every transaction in an InstructionPlan and returns each one's base64 wire encoding, in
// plan order — but never sends: "the WebView builds instructions/transactions and proofs; React
// Native only signs (MWA) and sends" (Phase 3 design). `payer` may be a NoopSigner (the relayer),
// whose slot stays empty for /relay to co-sign server-side.
//
// Two phases, because a human approving in their wallet is slow and a blockhash only lives ~150
// blocks (~36s on devnet at times):
//   1. Every transaction the wallet (MWA, the one modifying signer) must sign goes to it in ONE
//      request — one approval screen per flow — with a blockhash fetched immediately before.
//      Not a durable nonce, though that would make them unexpirable: Solflare decides which
//      network a transaction is for by looking its blockhash up, and a nonce value is no network's
//      blockhash, so it refuses to sign ("Network mismatch ... this transaction is for mainnet").
//      If an approval outlasts the blockhash anyway, the host rebuilds the flow and asks again
//      (see src/utils/retry-on-expiry.ts).
//   2. Only after the wallet returns, every remaining transaction (signed by keypairs/noop
//      signers only — e.g. a confidential transfer's proof-context transactions) gets a freshly
//      fetched blockhash and is signed instantly, so it's seconds old when it's submitted.
//
// An array of plans is planned separately and signed together, in order — so separate
// transactions (e.g. a free-tier fee and the transfer it pays for) stay separate, but still share
// one wallet approval.
export async function signInstructionPlan(
  instructionPlans: InstructionPlan | InstructionPlan[],
  payer: TransactionSigner,
  rpc: Rpc<SolanaRpcApi>,
): Promise<string[]> {
  const planner = createTransactionPlanner({
    createTransactionMessage: () =>
      pipe(createTransactionMessage({ version: 0 }), (m) => setTransactionMessageFeePayerSigner(payer, m)),
  })
  const messages: PlannedMessage[] = []
  for (const instructionPlan of Array.isArray(instructionPlans) ? instructionPlans : [instructionPlans]) {
    for (const planned of flattenTransactionPlan(await planner(instructionPlan))) {
      messages.push(planned.message as PlannedMessage)
    }
  }
  const signed = new Array<Transaction | undefined>(messages.length)

  const walletIndexes: number[] = []
  let wallet: TransactionModifyingSigner | undefined
  messages.forEach((message, index) => {
    const modifying = getSignersFromTransactionMessage(message).find(isTransactionModifyingSigner)
    if (!modifying) return
    if (wallet && wallet.address !== modifying.address) {
      throw new Error('a plan can only involve one wallet signer')
    }
    wallet = modifying
    walletIndexes.push(index)
  })

  if (wallet) {
    const walletAddress = wallet.address
    const { value: blockhash } = await rpc.getLatestBlockhash().send()
    const unsigned = walletIndexes.map((index) =>
      compileTransaction(setTransactionMessageLifetimeUsingBlockhash(blockhash, messages[index]!)),
    )

    const fromWallet = await wallet.modifyAndSignTransactions(unsigned)

    // The wallet may have rewritten each message (Solflare appends ComputeBudget instructions),
    // so any other signer in the same transaction (proof-context keypairs) signs what it returned.
    for (const [i, index] of walletIndexes.entries()) {
      let transaction: Transaction = fromWallet[i]!
      for (const signer of getSignersFromTransactionMessage(messages[index]!)) {
        if (signer.address === walletAddress || !isTransactionPartialSigner(signer)) continue
        const [signatures] = await signer.signTransactions([
          transaction as Parameters<typeof signer.signTransactions>[0][0],
        ])
        transaction = { ...transaction, signatures: { ...transaction.signatures, ...signatures } }
      }
      signed[index] = transaction
    }
  }

  const remaining = messages.map((_, index) => index).filter((index) => signed[index] === undefined)
  if (remaining.length > 0) {
    const { value: blockhash } = await rpc.getLatestBlockhash().send()
    for (const index of remaining) {
      // Not signTransactionMessageWithSigners: it asserts the result is *fully* signed, which
      // throws on a NoopSigner's still-empty slot (the relayer's, filled in later by /relay).
      signed[index] = await partiallySignTransactionMessageWithSigners(
        setTransactionMessageLifetimeUsingBlockhash(blockhash, messages[index]!),
      )
    }
  }

  return signed.map((transaction) => getBase64EncodedWireTransaction(transaction!))
}
