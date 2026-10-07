pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("43kwURZxpDniSpWPSfxyqUSc3kwuaCEmAJmSKtqdxMXi");

#[program]
pub mod envelope_vault {
    use super::*;

    /// Admin-only, once. Records the mints, the vault's USDC ATA, and the per-tier daily wrap
    /// limits. `envelope_stake` is trusted directly by its compiled-in program ID (see `wrap`),
    /// not by anything supplied here.
    pub fn initialize(
        ctx: Context<Initialize>,
        limits: [u64; NUM_TIERS],
        seconds_per_day: i64,
    ) -> Result<()> {
        crate::instructions::initialize::handle_initialize(ctx, limits, seconds_per_day)
    }

    /// USDC -> public cUSDC, 1:1, gated by the caller's staking tier's daily limit.
    pub fn wrap(ctx: Context<Wrap>, amount: u64) -> Result<()> {
        crate::instructions::wrap::handle_wrap(ctx, amount)
    }

    /// Public cUSDC -> USDC, 1:1. Requires a preceding top-level `Approve(vault_authority,
    /// amount)` in the same transaction — see `Unwrap`'s account docs for why.
    pub fn unwrap(ctx: Context<Unwrap>, amount: u64) -> Result<()> {
        crate::instructions::unwrap::handle_unwrap(ctx, amount)
    }

    pub fn create_pot(
        ctx: Context<CreatePot>,
        pot_id: u64,
        name: [u8; 32],
        close_ts: i64,
        pot_owner: Pubkey,
        pot_token_account: Pubkey,
    ) -> Result<()> {
        crate::instructions::create_pot::handle_create_pot(
            ctx,
            pot_id,
            name,
            close_ts,
            pot_owner,
            pot_token_account,
        )
    }

    pub fn close_pot(ctx: Context<ClosePot>, pot_id: u64) -> Result<()> {
        crate::instructions::close_pot::handle_close_pot(ctx, pot_id)
    }

    /// Admin-only, once per asset. Registers another underlying <-> confidential mint pair
    /// (e.g. SKR <-> cSKR) and creates the vault's account for the underlying.
    pub fn initialize_asset(ctx: Context<InitializeAsset>) -> Result<()> {
        crate::instructions::initialize_asset::handle_initialize_asset(ctx)
    }

    /// Underlying -> public confidential tokens, 1:1. No tier limit (see `AssetVault`).
    pub fn wrap_asset(ctx: Context<WrapAsset>, amount: u64) -> Result<()> {
        crate::instructions::wrap_asset::handle_wrap_asset(ctx, amount)
    }

    /// Public confidential tokens -> underlying, 1:1. Requires a preceding top-level
    /// `Approve(vault_authority, amount)` in the same transaction, as `unwrap` does.
    pub fn unwrap_asset(ctx: Context<UnwrapAsset>, amount: u64) -> Result<()> {
        crate::instructions::unwrap_asset::handle_unwrap_asset(ctx, amount)
    }
}
