use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};
use anchor_spl::token_2022::{self, Burn, Token2022};
use anchor_spl::token_interface::{Mint as Mint2022, TokenAccount as TokenAccount2022};

use crate::constants::*;
use crate::error::ErrorCode;
use crate::state::AssetVault;

#[derive(Accounts)]
pub struct UnwrapAsset<'info> {
    pub user: Signer<'info>,

    #[account(seeds = [ASSET_SEED, underlying_mint.key().as_ref()], bump = asset_vault.bump)]
    pub asset_vault: Box<Account<'info, AssetVault>>,

    /// CHECK: mint authority of `confidential_mint`, owner of `vault_token_account`, and (via a
    /// preceding top-level `Approve`) the delegate on `user_confidential` for at least `amount`.
    #[account(seeds = [VAULT_AUTH_SEED], bump)]
    pub vault_authority: UncheckedAccount<'info>,

    pub underlying_mint: Box<Account<'info, Mint>>,

    #[account(mut, address = asset_vault.confidential_mint)]
    pub confidential_mint: Box<InterfaceAccount<'info, Mint2022>>,

    // Burns as delegate, for the same CPI Guard reason as `unwrap`: the client submits
    // `[Approve(delegate = vault_authority, amount), unwrap_asset(amount)]` in one transaction.
    #[account(
        mut,
        constraint = user_confidential.owner == user.key(),
        constraint = user_confidential.mint == asset_vault.confidential_mint,
        constraint = user_confidential.delegate.contains(&vault_authority.key()) @ ErrorCode::MissingDelegateApproval,
    )]
    pub user_confidential: Box<InterfaceAccount<'info, TokenAccount2022>>,

    #[account(mut, address = asset_vault.vault_token_account)]
    pub vault_token_account: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        constraint = user_underlying.owner == user.key(),
        constraint = user_underlying.mint == asset_vault.underlying_mint,
    )]
    pub user_underlying: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
    pub token_2022_program: Program<'info, Token2022>,
}

/// Public confidential-mint tokens -> underlying, 1:1 (e.g. cSKR -> SKR).
pub fn handle_unwrap_asset(ctx: Context<UnwrapAsset>, amount: u64) -> Result<()> {
    require!(amount > 0, ErrorCode::Overflow);

    let vault_auth_bump = ctx.bumps.vault_authority;
    let signer_seeds: &[&[u8]] = &[VAULT_AUTH_SEED, &[vault_auth_bump]];

    token_2022::burn(
        CpiContext::new_with_signer(
            ctx.accounts.token_2022_program.key(),
            Burn {
                mint: ctx.accounts.confidential_mint.to_account_info(),
                from: ctx.accounts.user_confidential.to_account_info(),
                authority: ctx.accounts.vault_authority.to_account_info(),
            },
            &[signer_seeds],
        ),
        amount,
    )?;

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            Transfer {
                from: ctx.accounts.vault_token_account.to_account_info(),
                to: ctx.accounts.user_underlying.to_account_info(),
                authority: ctx.accounts.vault_authority.to_account_info(),
            },
            &[signer_seeds],
        ),
        amount,
    )?;

    Ok(())
}
