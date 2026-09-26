pub mod constants;
pub mod error;
pub mod external;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("B9urpR9ePgLSGPuXv8QDgEBFWth3hJHzPeJoqde3Nrjk");

#[program]
pub mod envelope_vault {
    use super::*;

    /// Admin-only, once. Records the mints, the vault's USDC ATA, the stake program to trust
    /// for tier lookups, and the per-tier daily wrap limits.
    pub fn initialize(
        ctx: Context<Initialize>,
        limits: [u64; NUM_TIERS],
        stake_program: Pubkey,
    ) -> Result<()> {
        crate::instructions::initialize::handle_initialize(ctx, limits, stake_program)
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
}
