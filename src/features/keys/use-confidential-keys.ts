// Phase 8: key management. `enablePrivateBalance` drives the one-time derivation flow ("Enable
// private balance" → bridge deriveKeys → MWA signMessage, already wired by Phase 7's
// <CBridgeHost>) and persists the resulting signature; `unlockOnOpen` replays a stored signature
// (biometric-gated read) to reconstruct the same keys without another MWA prompt; `lock` wipes
// the bridge's in-memory keys only — the stored signature (and therefore the ability to unlock
// again) is untouched.
import { useCBridge } from '@envelope/rn-confidential'
import { useCallback } from 'react'
import { useAppStore } from '../../store/app-store'
import { clearDerivationSignature, readDerivationSignature, saveDerivationSignature } from './secure-store'

export function useConfidentialKeys() {
  const bridge = useCBridge()
  const walletAddress = useAppStore((s) => s.walletAddress)
  const keysUnlocked = useAppStore((s) => s.keysUnlocked)
  const setKeysUnlocked = useAppStore((s) => s.setKeysUnlocked)

  const enablePrivateBalance = useCallback(async (): Promise<void> => {
    if (!walletAddress) throw new Error('connect a wallet first')
    if (!bridge.ready) throw new Error('confidential bridge is not ready yet')
    const { signatureBase64 } = await bridge.call('deriveKeys', { owner: walletAddress })
    await saveDerivationSignature(walletAddress, signatureBase64)
    setKeysUnlocked(true)
  }, [bridge, walletAddress, setKeysUnlocked])

  // Returns whether it actually unlocked — false (not thrown) covers "nothing stored yet" and
  // "device declined/can't authenticate", both of which just mean the normal enable flow is
  // still needed, not an error to surface.
  const unlockOnOpen = useCallback(async (): Promise<boolean> => {
    if (!walletAddress || !bridge.ready) return false
    const signatureBase64 = await readDerivationSignature(walletAddress)
    if (!signatureBase64) return false
    await bridge.call('restoreKeys', { owner: walletAddress, signatureBase64 })
    setKeysUnlocked(true)
    return true
  }, [bridge, walletAddress, setKeysUnlocked])

  const lock = useCallback(async (): Promise<void> => {
    if (bridge.ready) {
      await bridge.call('lockKeys', {})
    }
    setKeysUnlocked(false)
  }, [bridge, setKeysUnlocked])

  // Forgets the stored signature entirely — used when disconnecting the wallet, not by the
  // "Lock" button (see module doc comment: locking keeps the stored signature around on purpose).
  const forget = useCallback(async (): Promise<void> => {
    if (walletAddress) {
      await clearDerivationSignature(walletAddress)
    }
  }, [walletAddress])

  return { keysUnlocked, enablePrivateBalance, unlockOnOpen, lock, forget }
}
