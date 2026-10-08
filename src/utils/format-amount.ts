// Formats a base-units bigint (e.g. cUSDC's 6-decimal amount) as a plain "12.50"-style string —
// no currency symbol or grouping, callers add their own (see add-funds.tsx, home.tsx).
export function formatBaseUnits(amount: bigint, decimals: number): string {
  const divisor = 10n ** BigInt(decimals)
  const whole = amount / divisor
  const fraction = (amount % divisor).toString().padStart(decimals, '0').slice(0, 2)
  return `${whole}.${fraction}`
}

// Exact, for token amounts where two decimals would round or pad misleadingly (e.g. the free-tier
// send fee, "1 SKR" rather than "1.00 SKR"): every significant decimal, trailing zeros trimmed.
export function formatExactBaseUnits(amount: bigint, decimals: number): string {
  const divisor = 10n ** BigInt(decimals)
  const fraction = (amount % divisor).toString().padStart(decimals, '0').replace(/0+$/, '')
  return fraction ? `${amount / divisor}.${fraction}` : `${amount / divisor}`
}
