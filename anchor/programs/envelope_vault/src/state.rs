use anchor_lang::prelude::*;

use crate::constants::NUM_TIERS;

#[account]
#[derive(InitSpace)]
pub struct Config {
    pub admin: Pubkey,
    pub usdc_mint: Pubkey,
    pub cusdc_mint: Pubkey,
    pub vault_usdc: Pubkey,
    pub stake_program: Pubkey,
    /// Per-tier daily wrap limit, in USDC base units. Indexed by `Tier as usize`.
    pub limits: [u64; NUM_TIERS],
    /// Length of a "day" for `UserDaily.day_index` purposes, in seconds. A runtime field (not a
    /// compile-time constant) specifically so tests can pass a short value at `initialize` time
    /// without needing a second build of the program.
    pub seconds_per_day: i64,
    pub bump: u8,
}

/// A wrappable asset beyond the original USDC <-> cUSDC pair, which keeps its own `Config`
/// fields so existing deployments are untouched. One per underlying mint (e.g. SKR <-> cSKR),
/// PDA-seeded by that mint. No tier limits: those exist to cap dollars entering the private
/// system, and are enforced on `wrap` (USDC) only.
#[account]
#[derive(InitSpace)]
pub struct AssetVault {
    /// Classic SPL Token mint users deposit (SKR).
    pub underlying_mint: Pubkey,
    /// Token-2022 mint with the `ConfidentialTransferMint` extension, minted 1:1 (cSKR).
    pub confidential_mint: Pubkey,
    /// The vault's ATA of `underlying_mint`, owned by the VaultAuth PDA.
    pub vault_token_account: Pubkey,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct UserDaily {
    pub user: Pubkey,
    /// `unix_timestamp / SECONDS_PER_DAY` — the day this counter last reset on.
    pub day_index: i64,
    pub deposited_today: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Pot {
    pub host: Pubkey,
    pub pot_id: u64,
    pub pot_owner: Pubkey,
    pub pot_token_account: Pubkey,
    /// UTF-8, zero-padded; trim trailing `\0` bytes client-side.
    pub name: [u8; 32],
    pub close_ts: i64,
    pub closed: bool,
    pub bump: u8,
}
