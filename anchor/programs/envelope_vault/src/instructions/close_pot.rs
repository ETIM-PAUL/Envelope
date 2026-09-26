use anchor_lang::prelude::*;

use crate::constants::*;
use crate::error::ErrorCode;
use crate::state::Pot;

#[derive(Accounts)]
#[instruction(pot_id: u64)]
pub struct ClosePot<'info> {
    pub host: Signer<'info>,

    #[account(
        mut,
        seeds = [POT_SEED, host.key().as_ref(), &pot_id.to_le_bytes()],
        bump = pot.bump,
        has_one = host,
    )]
    pub pot: Account<'info, Pot>,
}

/// Marks the pot closed. The confidential sweep of its balance to the host is a separate,
/// ordinary confidential transfer signed by `pot_owner` (the pot's own keypair) — not this
/// program's concern.
pub fn handle_close_pot(ctx: Context<ClosePot>, _pot_id: u64) -> Result<()> {
    require!(!ctx.accounts.pot.closed, ErrorCode::PotAlreadyClosed);
    ctx.accounts.pot.closed = true;
    Ok(())
}
