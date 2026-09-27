use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use anchor_spl::token_2022::{self, Burn, Token2022};
use anchor_spl::token_interface::{Mint as Mint2022, TokenAccount as TokenAccount2022};

use crate::constants::*;
use crate::error::ErrorCode;
use crate::state::Config;

#[derive(Accounts)]
pub struct Unwrap<'info> {
    pub user: Signer<'info>,

    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,

    /// CHECK: mint authority of `cusdc_mint`, owner of `vault_usdc`, and (via a preceding
    /// top-level `Approve`) the delegate on `user_cusdc` for at least `amount`.
    #[account(seeds = [VAULT_AUTH_SEED], bump)]
    pub vault_authority: UncheckedAccount<'info>,

    #[account(mut, address = config.cusdc_mint)]
    pub cusdc_mint: Box<InterfaceAccount<'info, Mint2022>>,

    // CPI Guard blocks an *owner*-authorized burn/transfer via CPI, but allows a
    // *delegate*-authorized one. So this burns as delegate: the client must submit
    // `[Approve(delegate = vault_authority, amount), unwrap(amount)]` in one transaction — the
    // top-level `Approve` (not a CPI) is always allowed, then this instruction's CPI burns using
    // that delegation rather than `user`'s own authority.
    #[account(
        mut,
        constraint = user_cusdc.owner == user.key(),
        constraint = user_cusdc.delegate.contains(&vault_authority.key()) @ ErrorCode::MissingDelegateApproval,
    )]
    pub user_cusdc: Box<InterfaceAccount<'info, TokenAccount2022>>,

    #[account(mut, address = config.vault_usdc)]
    pub vault_usdc: Box<Account<'info, TokenAccount>>,

    #[account(mut, constraint = user_usdc.owner == user.key())]
    pub user_usdc: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
    pub token_2022_program: Program<'info, Token2022>,
}

pub fn handle_unwrap(ctx: Context<Unwrap>, amount: u64) -> Result<()> {
    require!(amount > 0, ErrorCode::Overflow);

    let vault_auth_bump = ctx.bumps.vault_authority;
    let signer_seeds: &[&[u8]] = &[VAULT_AUTH_SEED, &[vault_auth_bump]];

    // Burn as delegate (see CPI Guard note on `user_cusdc` above).
    token_2022::burn(
        CpiContext::new_with_signer(
            ctx.accounts.token_2022_program.key(),
            Burn {
                mint: ctx.accounts.cusdc_mint.to_account_info(),
                from: ctx.accounts.user_cusdc.to_account_info(),
                authority: ctx.accounts.vault_authority.to_account_info(),
            },
            &[signer_seeds],
        ),
        amount,
    )?;

    // USDC vault_usdc -> user, signed by the VaultAuth PDA (it owns vault_usdc).
    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            Transfer {
                from: ctx.accounts.vault_usdc.to_account_info(),
                to: ctx.accounts.user_usdc.to_account_info(),
                authority: ctx.accounts.vault_authority.to_account_info(),
            },
            &[signer_seeds],
        ),
        amount,
    )?;

    Ok(())
}
