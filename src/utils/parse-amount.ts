export const CUSDC_DECIMALS = 6

// Dollars-and-cents input -> base units (cUSDC has 6 decimals, like USDC). Rejects anything that
// isn't a plain non-negative number with at most 2 decimal places, rather than trying to guess
// what a malformed amount "should" mean.
export function parseDollarsToBaseUnits(input: string, decimals: number = CUSDC_DECIMALS): bigint | null {
  if (!/^\d+(\.\d{1,2})?$/.test(input.trim())) return null
  const [whole, cents = ''] = input.trim().split('.')
  const paddedCents = cents.padEnd(2, '0')
  const baseUnits = BigInt(whole) * 10n ** BigInt(decimals) + BigInt(paddedCents) * 10n ** BigInt(decimals - 2)
  return baseUnits > 0n ? baseUnits : null
}
