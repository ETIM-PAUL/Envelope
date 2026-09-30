// Phase 7: wires <CBridgeHost>'s onSignMessage/onSignTransaction callbacks to real MWA calls —
// mounting the host (this phase's task) needs *something* satisfying its required props, and a
// stub would violate the "no half-finished implementations" rule as much as a wrong one would.
// onSignMessage is what the key-derivation flow (Phase 8) calls ("bridge asks RN to sign the
// derivation message → MWA signMessages"); onSignTransaction is for later phases' transfer/proof
// flows.
import { useMobileWallet } from '@wallet-ui/react-native-kit'
import type { Address, SignatureBytes, Transaction, TransactionMessageBytes } from '@solana/kit'
import { useCallback, useMemo } from 'react'

export function useBridgeSigners() {
  const { account, signMessages, signTransactions } = useMobileWallet()

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

  const onSignTransaction = useCallback(
    async (address: string, messageBytes: Uint8Array): Promise<Uint8Array> => {
      if (!account || account.address.toString() !== address) {
        throw new Error(`no connected MWA account matches ${address}`)
      }
      const unsigned: Transaction = {
        // `messageBytes` from the bridge already is wire-format compiled message bytes (that's
        // what CBridgeHost's onSignTransaction contract promises) — only the nominal brand is
        // missing, so this cast is real, not a type-safety shortcut.
        messageBytes: messageBytes as unknown as TransactionMessageBytes,
        signatures: { [account.address]: null } as Record<Address, SignatureBytes | null>,
      }
      const signed = await signTransactions(unsigned)
      const signature = signed.signatures[account.address]
      if (!signature) {
        throw new Error(`MWA did not return a signature for ${address}`)
      }
      return signature
    },
    [account, signTransactions],
  )

  return useMemo(() => ({ onSignMessage, onSignTransaction }), [onSignMessage, onSignTransaction])
}
