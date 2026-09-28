use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::constants::*;
use crate::state::Pool;

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        init,
        payer = admin,
        space = 8 + Pool::INIT_SPACE,
        seeds = [POOL_SEED],
        bump
    )]
    pub pool: Account<'info, Pool>,

    /// CHECK: owner of `vault_skr`; holds no account data of its own.
    #[account(seeds = [POOL_AUTH_SEED], bump)]
    pub pool_authority: UncheckedAccount<'info>,

    pub skr_mint: Account<'info, Mint>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,

    #[account(
        init,
        payer = admin,
        associated_token::mint = skr_mint,
        associated_token::authority = pool_authority,
        associated_token::token_program = token_program,
    )]
    pub vault_skr: Account<'info, TokenAccount>,

    pub system_program: Program<'info, System>,
}

pub fn handle_initialize(
    ctx: Context<Initialize>,
    member_threshold: u64,
    business_threshold: u64,
    cooldown_secs: i64,
) -> Result<()> {
    require!(
        member_threshold <= business_threshold,
        crate::error::ErrorCode::InvalidThresholds
    );

    let pool = &mut ctx.accounts.pool;
    pool.skr_mint = ctx.accounts.skr_mint.key();
    pool.vault_skr = ctx.accounts.vault_skr.key();
    pool.member_threshold = member_threshold;
    pool.business_threshold = business_threshold;
    pool.cooldown_secs = cooldown_secs;
    pool.bump = ctx.bumps.pool;

    msg!(
        "envelope_stake initialized: skr_mint={}, member_threshold={}, business_threshold={}, cooldown_secs={}",
        pool.skr_mint,
        member_threshold,
        business_threshold,
        cooldown_secs
    );
    Ok(())
}
