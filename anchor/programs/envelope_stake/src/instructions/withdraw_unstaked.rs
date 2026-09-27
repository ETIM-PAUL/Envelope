use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::constants::*;
use crate::error::ErrorCode;
use crate::state::{Pool, StakePosition};

#[derive(Accounts)]
pub struct WithdrawUnstaked<'info> {
    pub user: Signer<'info>,

    #[account(seeds = [POOL_SEED], bump = pool.bump)]
    pub pool: Account<'info, Pool>,

    /// CHECK: owner of `vault_skr`.
    #[account(seeds = [POOL_AUTH_SEED], bump)]
    pub pool_authority: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [STAKE_SEED, user.key().as_ref()],
        bump = stake_position.bump,
        has_one = user,
    )]
    pub stake_position: Account<'info, StakePosition>,

    #[account(mut, address = pool.vault_skr)]
    pub vault_skr: Account<'info, TokenAccount>,

    #[account(mut, constraint = user_skr.owner == user.key())]
    pub user_skr: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn handle_withdraw_unstaked(ctx: Context<WithdrawUnstaked>) -> Result<()> {
    let unlock_requested_at = ctx.accounts.stake_position.unlock_requested_at;
    let amount = ctx.accounts.stake_position.amount;
    let cooldown_secs = ctx.accounts.pool.cooldown_secs;

    require!(unlock_requested_at != 0, ErrorCode::NoUnstakeRequested);
    require!(amount > 0, ErrorCode::NothingStaked);

    let now = Clock::get()?.unix_timestamp;
    let unlocks_at = unlock_requested_at
        .checked_add(cooldown_secs)
        .ok_or(ErrorCode::Overflow)?;
    require!(now >= unlocks_at, ErrorCode::CooldownNotElapsed);

    let pool_auth_bump = ctx.bumps.pool_authority;
    let signer_seeds: &[&[u8]] = &[POOL_AUTH_SEED, &[pool_auth_bump]];

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            Transfer {
                from: ctx.accounts.vault_skr.to_account_info(),
                to: ctx.accounts.user_skr.to_account_info(),
                authority: ctx.accounts.pool_authority.to_account_info(),
            },
            &[signer_seeds],
        ),
        amount,
    )?;

    let stake_position = &mut ctx.accounts.stake_position;
    stake_position.amount = 0;
    stake_position.unlock_requested_at = 0;

    msg!(
        "withdrew {} unstaked SKR for {}",
        amount,
        ctx.accounts.user.key()
    );
    Ok(())
}
