use anchor_lang::prelude::*;

#[constant]
pub const CONFIG_SEED: &[u8] = b"config";
#[constant]
pub const VAULT_AUTH_SEED: &[u8] = b"vault";
#[constant]
pub const USER_DAILY_SEED: &[u8] = b"daily";
#[constant]
pub const POT_SEED: &[u8] = b"pot";

/// Default `seconds_per_day` passed to `initialize` for a real deployment. Tests instead pass a
/// short value (e.g. a few seconds) at `initialize` time so "resets next day" is observable
/// against a live validator without waiting 86,400 real seconds — this is a runtime `Config`
/// field, not a Cargo feature, specifically so tests never need a second build of the program.
pub const SECONDS_PER_DAY: i64 = 86_400;

pub const NUM_TIERS: usize = 3;
