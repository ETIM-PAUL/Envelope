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

declare_id!("331WWNPRsoCJToHMrsbGPUC338DfqYEbMhiECL9jFqfx");

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

    /// Admin-only, once. Membership pass prices (per period, SKR base units) and the treasury.
    pub fn initialize_pass_config(
        ctx: Context<InitializePassConfig>,
        member_price: u64,
        business_price: u64,
        period_secs: i64,
    ) -> Result<()> {
        crate::instructions::initialize_pass_config::handle_initialize_pass_config(
            ctx,
            member_price,
            business_price,
            period_secs,
        )
    }

    /// Buys or extends a membership pass with SKR: tier 1 (Member) or 2 (Business), for
    /// `periods` periods. Spent, not staked.
    pub fn buy_pass(ctx: Context<BuyPass>, tier: u8, periods: u8) -> Result<()> {
        crate::instructions::buy_pass::handle_buy_pass(ctx, tier, periods)
    }
}
