use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};
use anchor_spl::token_2022::{self, MintTo, Token2022};
use anchor_spl::token_interface::{Mint as Mint2022, TokenAccount as TokenAccount2022};

use crate::constants::*;
use crate::error::ErrorCode;
use crate::state::AssetVault;

#[derive(Accounts)]
pub struct WrapAsset<'info> {
    pub user: Signer<'info>,

    #[account(seeds = [ASSET_SEED, underlying_mint.key().as_ref()], bump = asset_vault.bump)]
    pub asset_vault: Box<Account<'info, AssetVault>>,

    /// CHECK: mint authority of `confidential_mint`, owner of `vault_token_account`.
    #[account(seeds = [VAULT_AUTH_SEED], bump)]
    pub vault_authority: UncheckedAccount<'info>,

    /// Pins which asset this is; `asset_vault`'s seeds tie the two together.
    pub underlying_mint: Box<Account<'info, Mint>>,

    #[account(
        mut,
        constraint = user_underlying.owner == user.key(),
        constraint = user_underlying.mint == asset_vault.underlying_mint,
    )]
    pub user_underlying: Box<Account<'info, TokenAccount>>,

    #[account(mut, address = asset_vault.vault_token_account)]
    pub vault_token_account: Box<Account<'info, TokenAccount>>,

    #[account(mut, address = asset_vault.confidential_mint)]
    pub confidential_mint: Box<InterfaceAccount<'info, Mint2022>>,

    #[account(
        mut,
        constraint = user_confidential.owner == user.key(),
        constraint = user_confidential.mint == asset_vault.confidential_mint,
    )]
    pub user_confidential: Box<InterfaceAccount<'info, TokenAccount2022>>,

    pub token_program: Program<'info, Token>,
    pub token_2022_program: Program<'info, Token2022>,
}

/// Underlying -> public confidential-mint tokens, 1:1 (e.g. SKR -> cSKR). The client then
/// deposits them into the confidential balance, as with cUSDC.
pub fn handle_wrap_asset(ctx: Context<WrapAsset>, amount: u64) -> Result<()> {
    require!(amount > 0, ErrorCode::Overflow);

    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.key(),
            Transfer {
                from: ctx.accounts.user_underlying.to_account_info(),
                to: ctx.accounts.vault_token_account.to_account_info(),
                authority: ctx.accounts.user.to_account_info(),
            },
        ),
        amount,
    )?;

    let vault_auth_bump = ctx.bumps.vault_authority;
    let signer_seeds: &[&[u8]] = &[VAULT_AUTH_SEED, &[vault_auth_bump]];

    token_2022::mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_2022_program.key(),
            MintTo {
                mint: ctx.accounts.confidential_mint.to_account_info(),
                to: ctx.accounts.user_confidential.to_account_info(),
                authority: ctx.accounts.vault_authority.to_account_info(),
            },
            &[signer_seeds],
        ),
        amount,
    )?;

    Ok(())
}
