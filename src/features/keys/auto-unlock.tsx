import { useCBridge } from '@envelope/rn-confidential'
import { useEffect, useRef } from 'react'
import { useAppStore } from '../../store/app-store'
import { useConfidentialKeys } from './use-confidential-keys'

// Phase 8's "reopen app → fingerprint → balance readable without a wallet prompt" — mounted once
// at the app root (inside <CBridgeHost>, since it needs useCBridge()), tries `unlockOnOpen` the
// moment both the wallet is connected and the bridge is ready. `attempted` guards against retrying
// on every render once one attempt has run (declined biometrics shouldn't re-prompt in a loop);
// it resets if the wallet disconnects, so a different wallet connecting later gets its own attempt.
export function AutoUnlockOnOpen() {
  const walletAddress = useAppStore((s) => s.walletAddress)
  const bridge = useCBridge()
  const { keysUnlocked, unlockOnOpen } = useConfidentialKeys()
  const attempted = useRef(false)

  useEffect(() => {
    if (!walletAddress) {
      attempted.current = false
      return
    }
    if (attempted.current || keysUnlocked || !bridge.ready) return
    attempted.current = true
    void unlockOnOpen()
  }, [walletAddress, bridge.ready, keysUnlocked, unlockOnOpen])

  return null
}
