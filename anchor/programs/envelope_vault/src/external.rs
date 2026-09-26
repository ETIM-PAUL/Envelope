//! Mirrors of `envelope_stake`'s (Phase 5) account layouts, for reading its accounts from this
//! program without a crate dependency (Phase 5 doesn't exist yet as this is written).
//!
//! These structs must stay byte-identical to Phase 5's real `Pool`/`StakePosition` — same field
//! order and types. That's enough: Anchor's 8-byte account discriminator is
//! `sha256("account:<StructName>")[..8]`, derived from the struct *name* alone, not the crate it's
//! defined in, so `external::Pool` here and `envelope_stake::Pool` there produce identical
//! discriminators and `try_deserialize` succeeds either way.
//!
//! Deliberately **not** using `Account<'info, T>` for these in the instruction contexts that read
//! them: `#[account]`'s generated `Owner` impl hardcodes `owner() == crate::ID` (this program's
//! ID), which would wrongly require these to be owned by `envelope_vault` instead of
//! `envelope_stake`. Read them as `UncheckedAccount` with an explicit `owner = ...` constraint,
//! and deserialize with `external::Pool::try_deserialize` in the handler instead.
//!
//! TODO(Phase 5): once `envelope_stake` exists, prefer depending on its crate directly (with the
//! `cpi`/`no-entrypoint` feature) and delete this module, to remove the duplication risk.
use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Pool {
    pub skr_mint: Pubkey,
    pub vault_skr: Pubkey,
    pub member_threshold: u64,
    pub business_threshold: u64,
    pub cooldown_secs: i64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct StakePosition {
    pub user: Pubkey,
    pub amount: u64,
    /// 0 when no unstake has been requested.
    pub unlock_requested_at: i64,
    pub bump: u8,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[repr(usize)]
pub enum Tier {
    Free = 0,
    Member = 1,
    Business = 2,
}

/// `Free < member_threshold <= Member < business_threshold <= Business` — mirrors the tier
/// helper Phase 5 defines (Rust fn + TS mirror), evaluated here against the staked amount read
/// from the user's `StakePosition`.
pub fn tier_for_stake(staked_amount: u64, member_threshold: u64, business_threshold: u64) -> Tier {
    if staked_amount >= business_threshold {
        Tier::Business
    } else if staked_amount >= member_threshold {
        Tier::Member
    } else {
        Tier::Free
    }
}
