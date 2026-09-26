use anchor_lang::prelude::*;

use crate::constants::*;
use crate::state::Pot;

#[derive(Accounts)]
#[instruction(pot_id: u64)]
pub struct CreatePot<'info> {
    #[account(mut)]
    pub host: Signer<'info>,

    #[account(
        init,
        payer = host,
        space = 8 + Pot::INIT_SPACE,
        seeds = [POT_SEED, host.key().as_ref(), &pot_id.to_le_bytes()],
        bump
    )]
    pub pot: Account<'info, Pot>,

    pub system_program: Program<'info, System>,
}

pub fn handle_create_pot(
    ctx: Context<CreatePot>,
    pot_id: u64,
    name: [u8; 32],
    close_ts: i64,
    pot_owner: Pubkey,
    pot_token_account: Pubkey,
) -> Result<()> {
    let pot = &mut ctx.accounts.pot;
    pot.host = ctx.accounts.host.key();
    pot.pot_id = pot_id;
    pot.pot_owner = pot_owner;
    pot.pot_token_account = pot_token_account;
    pot.name = name;
    pot.close_ts = close_ts;
    pot.closed = false;
    pot.bump = ctx.bumps.pot;

    msg!("pot {} created by {}", pot_id, pot.host);
    Ok(())
}
