// Shared across envelope-stake.test.ts and envelope-vault.test.ts: whichever file's `beforeAll`
// runs first actually initializes the (program-wide singleton) stake pool — see
// setup-stake-pool.ts — so both must agree on the same values.
export const MEMBER_THRESHOLD = 1_000_000_000n // 1,000 SKR @ 6 decimals
export const BUSINESS_THRESHOLD = 5_000_000_000n // 5,000 SKR
export const COOLDOWN_SECS = 3n

// Membership pass (envelope_stake `initialize_pass_config`): per-period prices in SKR base units,
// and a deliberately short period so expiry is observable in a test run.
export const PASS_MEMBER_PRICE = 100_000_000n // 100 SKR
export const PASS_BUSINESS_PRICE = 500_000_000n // 500 SKR
export const PASS_PERIOD_SECS = 10n
