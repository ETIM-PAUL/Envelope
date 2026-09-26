use anchor_lang::prelude::*;

#[constant]
pub const CONFIG_SEED: &[u8] = b"config";
#[constant]
pub const VAULT_AUTH_SEED: &[u8] = b"vault";
#[constant]
pub const USER_DAILY_SEED: &[u8] = b"daily";
#[constant]
pub const POT_SEED: &[u8] = b"pot";

pub const SECONDS_PER_DAY: i64 = 86_400;
pub const NUM_TIERS: usize = 3;
