use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{Mint, Token, TokenAccount};
use anchor_spl::token_interface::Mint as Mint2022;

use crate::constants::*;
use crate::state::Config;

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        init,
        payer = admin,
        space = 8 + Config::INIT_SPACE,
        seeds = [CONFIG_SEED],
        bump
    )]
    pub config: Account<'info, Config>,

    /// CHECK: PDA signing authority (mint authority of `cusdc_mint`, owner of `vault_usdc`);
    /// holds no account data of its own.
    #[account(seeds = [VAULT_AUTH_SEED], bump)]
    pub vault_authority: UncheckedAccount<'info>,

    /// Classic SPL Token mint (mock USDC, or Circle's real devnet/mainnet USDC).
    pub usdc_mint: Account<'info, Mint>,

    /// Token-2022 mint with the `ConfidentialTransferMint` extension (cUSDC). `InterfaceAccount`
    /// (not `Account<token::Mint>`) because the extension data makes this longer than a base mint.
    pub cusdc_mint: InterfaceAccount<'info, Mint2022>,

    #[account(
        init,
        payer = admin,
        associated_token::mint = usdc_mint,
        associated_token::authority = vault_authority,
        associated_token::token_program = token_program,
    )]
    pub vault_usdc: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handle_initialize(
    ctx: Context<Initialize>,
    limits: [u64; NUM_TIERS],
    stake_program: Pubkey,
) -> Result<()> {
    let config = &mut ctx.accounts.config;
    config.admin = ctx.accounts.admin.key();
    config.usdc_mint = ctx.accounts.usdc_mint.key();
    config.cusdc_mint = ctx.accounts.cusdc_mint.key();
    config.vault_usdc = ctx.accounts.vault_usdc.key();
    config.stake_program = stake_program;
    config.limits = limits;
    config.bump = ctx.bumps.config;

    msg!(
        "envelope_vault initialized: usdc_mint={}, cusdc_mint={}, vault_usdc={}",
        config.usdc_mint,
        config.cusdc_mint,
        config.vault_usdc
    );
    Ok(())
}
