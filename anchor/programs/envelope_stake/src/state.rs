use anchor_lang::prelude::*;

// These two layouts are mirrored by `envelope_vault::external::{Pool, StakePosition}` (Phase 4,
// built before this program existed). Keep field order and types identical — Anchor's account
// discriminator (`sha256("account:<StructName>")[..8]`) depends only on the struct *name*, so
// `envelope_vault` reading these by name+layout match works as long as this doesn't drift.
// TODO(envelope_vault): now that this crate exists, replace its `external` mirror module with a
// real dependency on this crate (`cpi`/`no-entrypoint` feature) to remove the duplication risk.

#[account]
#[derive(InitSpace)]
pub struct Pool {
    pub skr_mint: Pubkey,
    pub vault_skr: Pubkey,
    pub member_threshold: u64,
    pub business_threshold: u64,
    pub cooldown_secs: i64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct StakePosition {
    pub user: Pubkey,
    pub amount: u64,
    /// 0 when no unstake has been requested; otherwise the unix timestamp `request_unstake` was
    /// called at. Tier drops to `Free` the instant this is set — see `tier::tier_for_stake`.
    pub unlock_requested_at: i64,
    pub bump: u8,
}
