use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{Mint, Token, TokenAccount};
use anchor_spl::token_interface::Mint as Mint2022;

use crate::constants::*;
use crate::error::ErrorCode;
use crate::state::AssetVault;

#[derive(Accounts)]
pub struct InitializeAsset<'info> {
    #[account(mut, address = ADMIN @ ErrorCode::Unauthorized)]
    pub admin: Signer<'info>,

    #[account(
        init,
        payer = admin,
        space = 8 + AssetVault::INIT_SPACE,
        seeds = [ASSET_SEED, underlying_mint.key().as_ref()],
        bump
    )]
    pub asset_vault: Account<'info, AssetVault>,

    /// CHECK: PDA signing authority (mint authority of every confidential mint, owner of every
    /// vault token account); holds no account data of its own.
    #[account(seeds = [VAULT_AUTH_SEED], bump)]
    pub vault_authority: UncheckedAccount<'info>,

    /// Classic SPL Token mint (SKR).
    pub underlying_mint: Account<'info, Mint>,

    /// Token-2022 confidential mint (cSKR). Checked here, once, so `wrap_asset` can never be
    /// pointed at a mint the vault can't mint, or one whose units don't match 1:1.
    #[account(
        constraint = confidential_mint.mint_authority == Some(vault_authority.key()).into() @ ErrorCode::InvalidAssetMint,
        constraint = confidential_mint.decimals == underlying_mint.decimals @ ErrorCode::InvalidAssetMint,
        constraint = confidential_mint.key() != underlying_mint.key() @ ErrorCode::InvalidAssetMint,
    )]
    pub confidential_mint: InterfaceAccount<'info, Mint2022>,

    #[account(
        init,
        payer = admin,
        associated_token::mint = underlying_mint,
        associated_token::authority = vault_authority,
        associated_token::token_program = token_program,
    )]
    pub vault_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handle_initialize_asset(ctx: Context<InitializeAsset>) -> Result<()> {
    let asset_vault = &mut ctx.accounts.asset_vault;
    asset_vault.underlying_mint = ctx.accounts.underlying_mint.key();
    asset_vault.confidential_mint = ctx.accounts.confidential_mint.key();
    asset_vault.vault_token_account = ctx.accounts.vault_token_account.key();
    asset_vault.bump = ctx.bumps.asset_vault;

    msg!(
        "asset initialized: underlying={}, confidential={}, vault={}",
        asset_vault.underlying_mint,
        asset_vault.confidential_mint,
        asset_vault.vault_token_account
    );
    Ok(())
}
