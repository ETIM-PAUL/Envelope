// Formats a base-units bigint (e.g. cUSDC's 6-decimal amount) as a plain "12.50"-style string —
// no currency symbol or grouping, callers add their own (see add-funds.tsx, home.tsx).
export function formatBaseUnits(amount: bigint, decimals: number): string {
  const divisor = 10n ** BigInt(decimals)
  const whole = amount / divisor
  const fraction = (amount % divisor).toString().padStart(decimals, '0').slice(0, 2)
  return `${whole}.${fraction}`
}
