use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::constants::*;
use crate::error::ErrorCode;
use crate::state::{Pool, StakePosition};

#[derive(Accounts)]
pub struct Stake<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(seeds = [POOL_SEED], bump = pool.bump)]
    pub pool: Account<'info, Pool>,

    #[account(
        init_if_needed,
        payer = user,
        space = 8 + StakePosition::INIT_SPACE,
        seeds = [STAKE_SEED, user.key().as_ref()],
        bump
    )]
    // Safe here: the handler doesn't depend on init-time zeroing for correctness — a freshly
    // created account has `amount == 0` and `unlock_requested_at == 0` regardless, which is
    // exactly the state a brand-new stake position should start from.
    pub stake_position: Account<'info, StakePosition>,

    #[account(mut, constraint = user_skr.owner == user.key())]
    pub user_skr: Account<'info, TokenAccount>,

    #[account(mut, address = pool.vault_skr)]
    pub vault_skr: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handle_stake(ctx: Context<Stake>, amount: u64) -> Result<()> {
    require!(amount > 0, ErrorCode::ZeroAmount);

    let stake_position = &mut ctx.accounts.stake_position;
    require!(
        stake_position.unlock_requested_at == 0,
        ErrorCode::CannotStakeDuringUnstake
    );

    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.key(),
            Transfer {
                from: ctx.accounts.user_skr.to_account_info(),
                to: ctx.accounts.vault_skr.to_account_info(),
                authority: ctx.accounts.user.to_account_info(),
            },
        ),
        amount,
    )?;

    stake_position.user = ctx.accounts.user.key();
    stake_position.amount = stake_position
        .amount
        .checked_add(amount)
        .ok_or(ErrorCode::Overflow)?;
    stake_position.bump = ctx.bumps.stake_position;

    msg!(
        "staked {} SKR for {}, total now {}",
        amount,
        stake_position.user,
        stake_position.amount
    );
    Ok(())
}
