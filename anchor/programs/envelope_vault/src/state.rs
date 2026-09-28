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
