// Shared across envelope-stake.test.ts and envelope-vault.test.ts: whichever file's `beforeAll`
// runs first actually initializes the (program-wide singleton) stake pool — see
// setup-stake-pool.ts — so both must agree on the same values.
export const MEMBER_THRESHOLD = 1_000_000_000n // 1,000 SKR @ 6 decimals
export const BUSINESS_THRESHOLD = 5_000_000_000n // 5,000 SKR
export const COOLDOWN_SECS = 3n
