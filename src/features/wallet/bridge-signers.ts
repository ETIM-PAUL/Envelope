// Phase 7: wires <CBridgeHost>'s onSignMessage/onSignTransaction callbacks to real MWA calls —
// mounting the host (this phase's task) needs *something* satisfying its required props, and a
// stub would violate the "no half-finished implementations" rule as much as a wrong one would.
// onSignMessage is what the key-derivation flow (Phase 8) calls ("bridge asks RN to sign the
// derivation message → MWA signMessages"); onSignTransaction is for later phases' transfer/proof
// flows.
import { useMobileWallet } from '@wallet-ui/react-native-kit'
import { getTransactionDecoder, getTransactionEncoder } from '@solana/kit'
import { useCallback, useMemo } from 'react'
import { useWalletSigning } from './use-wallet-signing'

export function useBridgeSigners() {
  const { account, signMessages } = useMobileWallet()
  const { signTransactions } = useWalletSigning()

  const onSignMessage = useCallback(
    async (address: string, messageBytes: Uint8Array): Promise<Uint8Array> => {
      if (!account || account.address.toString() !== address) {
        throw new Error(`no connected MWA account matches ${address}`)
      }
      // Plural form — `signMessage`/`signTransaction` (singular) are deprecated by wallet-ui in
      // favor of these; same shape for a single Uint8Array/Transaction input, no warning.
      return signMessages(messageBytes)
    },
    [account, signMessages],
  )

  // Whole wire transactions in, whole signed wire transactions out, all in ONE MWA request so the
  // wallet shows a single approval for the whole flow. Each input already carries a slot for every
  // required signer (e.g. the relayer's empty fee-payer slot), and each output is exactly what the
  // wallet signed — including any instructions it added (Solflare appends ComputeBudget priority
  // fees), which the bridge adopts as that transaction's final message.
  // The blockhash in each incoming transaction is replaced with one fetched after the wallet
  // session opens (see useWalletSigning).
  const onSignTransactions = useCallback(
    async (address: string, transactionsBytes: Uint8Array[]): Promise<Uint8Array[]> => {
      if (!account || account.address.toString() !== address) {
        throw new Error(`no connected MWA account matches ${address}`)
      }
      const unsigned = transactionsBytes.map((bytes) => getTransactionDecoder().decode(bytes))
      const signed = await signTransactions(unsigned)
      return signed.map((transaction) => {
        if (!transaction.signatures[account.address]) {
          throw new Error(`MWA did not return a signature for ${address}`)
        }
        return new Uint8Array(getTransactionEncoder().encode(transaction))
      })
    },
    [account, signTransactions],
  )

  return useMemo(() => ({ onSignMessage, onSignTransactions }), [onSignMessage, onSignTransactions])
}
