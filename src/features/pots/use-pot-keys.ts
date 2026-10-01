// Phase 15: derives/restores a pot's identity (see packages/cbridge/src/protocol.ts's
// DerivePotKeysParams doc comment for the full recipe) and keeps its derivation signature
// persisted (biometric-gated, same as the wallet's own key in Phase 8) so reopening a pot the
// host already created doesn't need a fresh MWA prompt.
import { useCBridge } from '@envelope/rn-confidential'
import { useCallback } from 'react'
import { useAppStore } from '../../store/app-store'
import { readPotSignature, savePotSignature } from './pot-store'

export function usePotKeys() {
  const bridge = useCBridge()
  const walletAddress = useAppStore((s) => s.walletAddress)

  // Fresh MWA prompt — used when creating a new pot, or opening one for the first time on a
  // device that hasn't restored it yet.
  const derivePotKeys = useCallback(
    async (potId: string): Promise<string> => {
      if (!walletAddress) throw new Error('connect a wallet first')
      if (!bridge.ready) throw new Error('confidential bridge is not ready yet')
      const { potOwnerAddress, signatureBase64 } = await bridge.call('derivePotKeys', {
        owner: walletAddress,
        potId,
      })
      await savePotSignature(walletAddress, potId, signatureBase64)
      return potOwnerAddress
    },
    [bridge, walletAddress],
  )

  // Replays a stored signature — no MWA prompt. Returns null if nothing's stored yet (the
  // bridge's session was reset, or this device never created/opened this pot before), which
  // callers should treat as "fall back to derivePotKeys", not an error.
  const restorePotKeys = useCallback(
    async (potId: string): Promise<string | null> => {
      if (!walletAddress) return null
      if (!bridge.ready) return null
      const signatureBase64 = await readPotSignature(walletAddress, potId)
      if (!signatureBase64) return null
      const { potOwnerAddress } = await bridge.call('restorePotKeys', { owner: walletAddress, potId, signatureBase64 })
      return potOwnerAddress
    },
    [bridge, walletAddress],
  )

  // Tries the no-prompt path first, falls back to a fresh MWA signature — the common case for
  // "open a pot I created on this device before."
  const ensurePotKeys = useCallback(
    async (potId: string): Promise<string> => {
      const restored = await restorePotKeys(potId)
      if (restored) return restored
      return derivePotKeys(potId)
    },
    [restorePotKeys, derivePotKeys],
  )

  return { derivePotKeys, restorePotKeys, ensurePotKeys }
}
