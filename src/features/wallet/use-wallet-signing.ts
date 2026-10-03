// Signs transactions with the connected MWA wallet — the one path every wallet-signed transaction
// in the app goes through, so they all get the same timing treatment.
//
// A blockhash expires ~150 blocks after it's fetched (~36s on devnet at times), so it's fetched as
// late as possible and written into each transaction just before the wallet opens. Not any later:
// once the wallet is in front, Android blocks this app's network access as a background app
// (netpolicy `blocked=APP_BACKGROUND`, seen on the API 36 emulator), so a fetch from inside the
// wallet session fails. If the approval still outlasts the blockhash, callers rebuild and ask again
// (src/utils/retry-on-expiry.ts).
import { transact, useAuthorization, useMobileWallet, type KitMobileWallet } from '@wallet-ui/react-native-kit'
import {
  getCompiledTransactionMessageDecoder,
  getCompiledTransactionMessageEncoder,
  type Blockhash,
  type Transaction,
  type TransactionMessageBytes,
} from '@solana/kit'
import { useCallback } from 'react'
import { withNetworkRetry } from '../../utils/network-retry'

// For building a transaction that will go through signTransactions below: compiling needs *a*
// lifetime, but this one is always replaced, so there's no point spending a request fetching it.
export const PLACEHOLDER_LIFETIME = {
  blockhash: '11111111111111111111111111111111' as Blockhash,
  lastValidBlockHeight: 0n,
}

// Replacing the blockhash changes the message, which would invalidate any signature already on
// the transaction — so only transactions nobody has signed yet are restamped. (Every caller hands
// over unsigned transactions: the bridge has keypair co-signers sign *after* the wallet returns.)
function withBlockhash(transaction: Transaction, blockhash: Blockhash): Transaction {
  if (Object.values(transaction.signatures).some(Boolean)) return transaction
  const compiled = getCompiledTransactionMessageDecoder().decode(transaction.messageBytes)
  const messageBytes = getCompiledTransactionMessageEncoder().encode({ ...compiled, lifetimeToken: blockhash })
  return { ...transaction, messageBytes: messageBytes as unknown as TransactionMessageBytes }
}

export function useWalletSigning() {
  const { account, chain, client, identity, store } = useMobileWallet()
  const { authorizeSession } = useAuthorization({ chain, identity, store })

  const signTransactions = useCallback(
    async (transactions: Transaction[]): Promise<Transaction[]> => {
      if (!account) throw new Error('connect a wallet first')
      const {
        value: { blockhash },
      } = await withNetworkRetry(() => client.rpc.getLatestBlockhash().send())
      const fresh = transactions.map((transaction) => withBlockhash(transaction, blockhash))
      return transact(async (wallet: KitMobileWallet) => {
        await authorizeSession(wallet)
        return wallet.signTransactions({ transactions: fresh })
      })
    },
    [account, authorizeSession, client],
  )

  return { signTransactions }
}
