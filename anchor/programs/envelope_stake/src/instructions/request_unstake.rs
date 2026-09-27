use anchor_lang::prelude::*;

use crate::constants::*;
use crate::error::ErrorCode;
use crate::state::StakePosition;

#[derive(Accounts)]
pub struct RequestUnstake<'info> {
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [STAKE_SEED, user.key().as_ref()],
        bump = stake_position.bump,
        has_one = user,
    )]
    pub stake_position: Account<'info, StakePosition>,
}

/// Starts the cooldown. The tier drop is immediate — see `tier::tier_for_stake` — even though
/// the SKR itself doesn't move until `withdraw_unstaked` after the cooldown elapses.
pub fn handle_request_unstake(ctx: Context<RequestUnstake>) -> Result<()> {
    let stake_position = &mut ctx.accounts.stake_position;
    require!(stake_position.amount > 0, ErrorCode::NothingStaked);
    require!(
        stake_position.unlock_requested_at == 0,
        ErrorCode::UnstakeAlreadyRequested
    );

    stake_position.unlock_requested_at = Clock::get()?.unix_timestamp;

    msg!("unstake requested for {}", ctx.accounts.user.key());
    Ok(())
}
