// Phase 8: persists the confidential-key derivation *signature* (never the derived keys
// themselves — those stay in the WebView bridge's memory) behind Android Keystore / iOS Keychain
// biometric gating. Base58 wallet addresses are alphanumeric, so they're safe to use directly in
// the SecureStore key name (SecureStore keys allow only alphanumeric, `.`, `-`, `_`).
import * as SecureStore from 'expo-secure-store'

function keyFor(owner: string): string {
  return `envelope-confbal-sig-${owner}`
}

const AUTH_PROMPT = 'Unlock your private balance'

// Best-effort: persisting only saves a wallet prompt on the next app open; the keys are already
// derived. Some devices can't do biometric-gated storage even with a fingerprint enrolled — e.g.
// Huawei phones without Google services report "Biometric authentication status is unknown" —
// and there the signature is simply not kept (never stored without the biometric gate), so
// reopening the app asks the wallet to sign again. Returns whether it was saved.
export async function saveDerivationSignature(owner: string, signatureBase64: string): Promise<boolean> {
  try {
    await SecureStore.setItemAsync(keyFor(owner), signatureBase64, {
      requireAuthentication: true,
      authenticationPrompt: AUTH_PROMPT,
    })
    return true
  } catch {
    return false
  }
}

// Resolves to `null` if nothing is stored for this owner, or the device can't satisfy
// `requireAuthentication` (no biometric enrolled, or the entry was invalidated by a biometric
// change) — both are "not unlocked yet", not errors, so callers should fall back to the normal
// "Enable private balance" flow rather than throw.
export async function readDerivationSignature(owner: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(keyFor(owner), {
      requireAuthentication: true,
      authenticationPrompt: AUTH_PROMPT,
    })
  } catch {
    return null
  }
}

export async function clearDerivationSignature(owner: string): Promise<void> {
  await SecureStore.deleteItemAsync(keyFor(owner))
}
