//! The canonical tier helper (plan: "Tier helper (Rust fn + TS mirror): shared by vault program
//! (via account read) and relayer (TS mirror)"). `envelope_vault` calls this same logic against
//! its own mirrored copy of `StakePosition`/`Pool` (see that crate's `external.rs`); the relayer
//! mirrors it in TypeScript (Phase 12).

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[repr(usize)]
pub enum Tier {
    Free = 0,
    Member = 1,
    Business = 2,
}

/// `Free < member_threshold <= Member < business_threshold <= Business`, by staked amount — with
/// one override: an in-progress unstake (`unlock_requested_at != 0`) drops the tier to `Free`
/// immediately, before the cooldown even elapses. This is deliberate, not an oversight — without
/// it a user could request an unstake and keep every tier perk (waived fees, higher wrap limits)
/// for the whole cooldown window while already exiting.
pub fn tier_for_stake(
    staked_amount: u64,
    unlock_requested_at: i64,
    member_threshold: u64,
    business_threshold: u64,
) -> Tier {
    if unlock_requested_at != 0 {
        return Tier::Free;
    }

    if staked_amount >= business_threshold {
        Tier::Business
    } else if staked_amount >= member_threshold {
        Tier::Member
    } else {
        Tier::Free
    }
}
