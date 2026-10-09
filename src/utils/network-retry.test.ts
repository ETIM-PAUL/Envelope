import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { withNetworkRetry } from './network-retry'

// What Android 16 does when the app comes back from the wallet: the first requests fail DNS
// while its background network block is lifted (see network-retry.ts).
const dnsFailure = () => new TypeError('Network request failed: Unable to resolve host "api.devnet.solana.com"')

describe('withNetworkRetry', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('retries connection failures until the network is back', async () => {
    const request = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(dnsFailure())
      .mockRejectedValueOnce(dnsFailure())
      .mockResolvedValue('ok')
    const result = withNetworkRetry(request)
    await vi.runAllTimersAsync()
    await expect(result).resolves.toBe('ok')
    expect(request).toHaveBeenCalledTimes(3)
  })

  it('rethrows anything that is not a connection failure at once', async () => {
    const request = vi.fn<() => Promise<string>>().mockRejectedValue(new Error('insufficient funds'))
    await expect(withNetworkRetry(request)).rejects.toThrow('insufficient funds')
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('gives up after its window when the network stays down', async () => {
    const request = vi.fn<() => Promise<string>>().mockRejectedValue(dnsFailure())
    const result = withNetworkRetry(request)
    const assertion = expect(result).rejects.toThrow('Unable to resolve host')
    await vi.advanceTimersByTimeAsync(11_000)
    await assertion
    // 10s window, 750ms apart: a bounded number of attempts, not a loop forever.
    expect(request.mock.calls.length).toBeGreaterThan(5)
    expect(request.mock.calls.length).toBeLessThan(20)
  })
})
