use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::constants::*;
use crate::error::ErrorCode;
use crate::state::{Pass, PassConfig, Pool};

#[derive(Accounts)]
pub struct BuyPass<'info> {
    /// Pays the SKR and owns the pass.
    pub user: Signer<'info>,

    /// Pays the pass account's rent — the user's own wallet, or (SKR fuel) their gas tank, so a
    /// membership never needs SOL from the wallet. Never the relayer: it isn't allowed to fund
    /// accounts other people can later close.
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(seeds = [POOL_SEED], bump = pool.bump)]
    pub pool: Account<'info, Pool>,

    #[account(seeds = [PASS_CONFIG_SEED], bump = pass_config.bump)]
    pub pass_config: Account<'info, PassConfig>,

    #[account(
        init_if_needed,
        payer = payer,
        space = 8 + Pass::INIT_SPACE,
        seeds = [PASS_SEED, user.key().as_ref()],
        bump
    )]
    // Safe with init_if_needed: the PDA is seeded by the signer, so an existing account is always
    // the caller's own, and the handler sets every field (user, tier, expiry, bump) on every call.
    pub pass: Account<'info, Pass>,

    #[account(
        mut,
        constraint = user_skr.owner == user.key(),
        constraint = user_skr.mint == pool.skr_mint,
    )]
    pub user_skr: Account<'info, TokenAccount>,

    #[account(mut, address = pass_config.treasury)]
    pub treasury: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

/// Spends `periods` x the tier's price in SKR. Same tier while still active: extends from the
/// current expiry. A higher tier: starts now (the rest of the lower pass isn't refunded — the app
/// says so before the user confirms). A lower tier while a higher one is active: rejected.
pub fn handle_buy_pass(ctx: Context<BuyPass>, tier: u8, periods: u8) -> Result<()> {
    require!(tier == 1 || tier == 2, ErrorCode::InvalidPassTier);
    require!(
        periods >= 1 && periods <= MAX_PASS_PERIODS,
        ErrorCode::InvalidPassPeriods
    );

    let config = &ctx.accounts.pass_config;
    let price = if tier == 2 {
        config.business_price
    } else {
        config.member_price
    };
    let amount = price
        .checked_mul(u64::from(periods))
        .ok_or(ErrorCode::Overflow)?;
    let duration = config
        .period_secs
        .checked_mul(i64::from(periods))
        .ok_or(ErrorCode::Overflow)?;

    let now = Clock::get()?.unix_timestamp;
    let pass = &ctx.accounts.pass;
    let active = pass.expires_at > now;
    require!(!(active && pass.tier > tier), ErrorCode::PassDowngrade);
    let start = if active && pass.tier == tier {
        pass.expires_at
    } else {
        now
    };
    let expires_at = start.checked_add(duration).ok_or(ErrorCode::Overflow)?;

    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.key(),
            Transfer {
                from: ctx.accounts.user_skr.to_account_info(),
                to: ctx.accounts.treasury.to_account_info(),
                authority: ctx.accounts.user.to_account_info(),
            },
        ),
        amount,
    )?;

    let pass = &mut ctx.accounts.pass;
    pass.user = ctx.accounts.user.key();
    pass.tier = tier;
    pass.expires_at = expires_at;
    pass.bump = ctx.bumps.pass;

    msg!(
        "pass: tier {} for {} until {}",
        tier,
        pass.user,
        pass.expires_at
    );
    Ok(())
}
