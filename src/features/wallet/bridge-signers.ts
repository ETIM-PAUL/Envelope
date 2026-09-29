// Phase 7: wires <CBridgeHost>'s onSignMessage/onSignTransaction callbacks to real MWA calls —
// mounting the host (this phase's task) needs *something* satisfying its required props, and a
// stub would violate the "no half-finished implementations" rule as much as a wrong one would.
// Neither of these is exercised by any Phase 7 screen yet: onSignMessage is what Phase 8's key
// derivation flow will actually call ("bridge asks RN to sign the derivation message → MWA
// signMessage"); onSignTransaction is for later phases' transfer/proof flows.
import { useMobileWallet } from '@wallet-ui/react-native-kit'
import type { Address, SignatureBytes, Transaction, TransactionMessageBytes } from '@solana/kit'
import { useCallback, useMemo } from 'react'

export function useBridgeSigners() {
  const { account, signMessage, signTransaction } = useMobileWallet()

  const onSignMessage = useCallback(
    async (address: string, messageBytes: Uint8Array): Promise<Uint8Array> => {
      if (!account || account.address.toString() !== address) {
        throw new Error(`no connected MWA account matches ${address}`)
      }
      return signMessage(messageBytes)
    },
    [account, signMessage],
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
      const signed = await signTransaction(unsigned)
      const signature = signed.signatures[account.address]
      if (!signature) {
        throw new Error(`MWA did not return a signature for ${address}`)
      }
      return signature
    },
    [account, signTransaction],
  )

  return useMemo(() => ({ onSignMessage, onSignTransaction }), [onSignMessage, onSignTransaction])
}
