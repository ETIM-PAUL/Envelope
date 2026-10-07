use anchor_lang::prelude::*;
use anchor_spl::token::TokenAccount;

use crate::constants::*;
use crate::error::ErrorCode;
use crate::state::{PassConfig, Pool};

#[derive(Accounts)]
pub struct InitializePassConfig<'info> {
    #[account(mut, address = ADMIN @ ErrorCode::Unauthorized)]
    pub admin: Signer<'info>,

    #[account(seeds = [POOL_SEED], bump = pool.bump)]
    pub pool: Account<'info, Pool>,

    #[account(
        init,
        payer = admin,
        space = 8 + PassConfig::INIT_SPACE,
        seeds = [PASS_CONFIG_SEED],
        bump
    )]
    pub pass_config: Account<'info, PassConfig>,

    /// Receives pass payments: must hold SKR.
    #[account(constraint = treasury.mint == pool.skr_mint @ ErrorCode::InvalidPassConfig)]
    pub treasury: Account<'info, TokenAccount>,

    pub system_program: Program<'info, System>,
}

/// Admin-only, once. Prices are per period, in SKR base units.
pub fn handle_initialize_pass_config(
    ctx: Context<InitializePassConfig>,
    member_price: u64,
    business_price: u64,
    period_secs: i64,
) -> Result<()> {
    require!(
        member_price > 0 && business_price > 0 && period_secs > 0,
        ErrorCode::InvalidPassConfig
    );
    let pass_config = &mut ctx.accounts.pass_config;
    pass_config.member_price = member_price;
    pass_config.business_price = business_price;
    pass_config.period_secs = period_secs;
    pass_config.treasury = ctx.accounts.treasury.key();
    pass_config.bump = ctx.bumps.pass_config;
    Ok(())
}
