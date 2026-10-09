import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = vi.hoisted(() => ({
  setItemAsync: vi.fn(),
  getItemAsync: vi.fn(),
  deleteItemAsync: vi.fn(),
}))
vi.mock('expo-secure-store', () => store)

const { readDerivationSignature, saveDerivationSignature } = await import('./secure-store')

// What Huawei phones without Google services report even with a fingerprint enrolled.
const huaweiError = () => new Error('Biometric authentication status is unknown')

describe('derivation signature behind biometrics', () => {
  beforeEach(() => vi.resetAllMocks())

  it('stores the signature only behind the biometric gate', async () => {
    store.setItemAsync.mockResolvedValue(undefined)
    await expect(saveDerivationSignature('owner1', 'c2lnbmF0dXJl')).resolves.toBe(true)
    expect(store.setItemAsync).toHaveBeenCalledTimes(1)
    expect(store.setItemAsync.mock.calls[0]![2]).toMatchObject({ requireAuthentication: true })
  })

  it("falls back on devices that can't gate storage: nothing saved, no error", async () => {
    store.setItemAsync.mockRejectedValue(huaweiError())
    await expect(saveDerivationSignature('owner1', 'c2lnbmF0dXJl')).resolves.toBe(false)
    // Never retried without the gate: the signature is simply not kept, and the next app open
    // asks the wallet to sign again.
    expect(store.setItemAsync).toHaveBeenCalledTimes(1)
    expect(store.setItemAsync.mock.calls.every((call) => call[2]?.requireAuthentication === true)).toBe(true)
  })

  it('restores the signature behind the biometric prompt on the next open', async () => {
    store.getItemAsync.mockResolvedValue('c2lnbmF0dXJl')
    await expect(readDerivationSignature('owner1')).resolves.toBe('c2lnbmF0dXJl')
    expect(store.getItemAsync.mock.calls[0]![1]).toMatchObject({ requireAuthentication: true })
  })

  it('reads a cancelled or failed biometric prompt as "not unlocked", not an error', async () => {
    store.getItemAsync.mockRejectedValue(huaweiError())
    await expect(readDerivationSignature('owner1')).resolves.toBeNull()
  })
})
