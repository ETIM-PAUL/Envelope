use anchor_lang::prelude::*;

#[constant]
pub const POOL_SEED: &[u8] = b"pool";
#[constant]
pub const POOL_AUTH_SEED: &[u8] = b"pool_authority";
#[constant]
pub const STAKE_SEED: &[u8] = b"stake";
#[constant]
pub const PASS_CONFIG_SEED: &[u8] = b"pass_config";
#[constant]
pub const PASS_SEED: &[u8] = b"pass";

/// Longest pass bought in one go (12 periods: a year at 30-day periods).
pub const MAX_PASS_PERIODS: u8 = 12;

// Phase 18 self-audit: `initialize` previously accepted any signer as `admin`, letting anyone
// race the real deploy script to permanently claim the Pool singleton with attacker-chosen
// thresholds (seeds are parameter-free, so `init` only ever succeeds once). Gating on a
// hardcoded key closes that — this is the devnet admin wallet from config/devnet.json;
// **a real deploy must change this constant to that deployment's actual admin key.**
pub const ADMIN: Pubkey = pubkey!("7cTceTkWuAEuhFwinrdFqg5udxAKtrcihtxxJoDTbig1");
