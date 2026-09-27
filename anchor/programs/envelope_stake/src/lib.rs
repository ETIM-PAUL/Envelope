pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;
pub mod tier;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;
pub use tier::*;

declare_id!("F4DdZ7ArpYrPGCFnBp8mEtakkwNWWTqDFPirNKqCVwTV");

#[program]
pub mod envelope_stake {
    use super::*;

    /// Admin-only, once. Records the SKR mint, the pool's vault ATA, and the tier thresholds +
    /// unstake cooldown.
    pub fn initialize(
        ctx: Context<Initialize>,
        member_threshold: u64,
        business_threshold: u64,
        cooldown_secs: i64,
    ) -> Result<()> {
        crate::instructions::initialize::handle_initialize(
            ctx,
            member_threshold,
            business_threshold,
            cooldown_secs,
        )
    }

    /// SKR user -> vault_skr; increases the caller's staked amount.
    pub fn stake(ctx: Context<Stake>, amount: u64) -> Result<()> {
        crate::instructions::stake::handle_stake(ctx, amount)
    }

    /// Starts the cooldown for the caller's whole stake position. Tier drops to `Free`
    /// immediately (see `tier::tier_for_stake`).
    pub fn request_unstake(ctx: Context<RequestUnstake>) -> Result<()> {
        crate::instructions::request_unstake::handle_request_unstake(ctx)
    }

    /// After the cooldown elapses, returns the full staked amount to the caller and resets the
    /// stake position.
    pub fn withdraw_unstaked(ctx: Context<WithdrawUnstaked>) -> Result<()> {
        crate::instructions::withdraw_unstaked::handle_withdraw_unstaked(ctx)
    }
}
