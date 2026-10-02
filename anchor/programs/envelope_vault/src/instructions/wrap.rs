use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use anchor_spl::token_2022::{self, MintTo, Token2022};
use anchor_spl::token_interface::{Mint as Mint2022, TokenAccount as TokenAccount2022};
use envelope_stake::state::{Pool, StakePosition};
use envelope_stake::tier::tier_for_stake;

use crate::constants::*;
use crate::error::ErrorCode;
use crate::state::{Config, UserDaily};

#[derive(Accounts)]
pub struct Wrap<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,

    /// CHECK: mint authority of `cusdc_mint`, owner of `vault_usdc`.
    #[account(seeds = [VAULT_AUTH_SEED], bump)]
    pub vault_authority: UncheckedAccount<'info>,

    /// The stake pool singleton — read-only, for tier thresholds. `envelope_stake` is a real
    /// dependency (not a mirror), so `Account<'info, Pool>`'s built-in owner check already
    /// requires ownership by `envelope_stake::ID` correctly; `seeds::program` only needs to
    /// override which program the PDA is *derived* against (it defaults to this program's ID).
    #[account(seeds = [b"pool"], bump, seeds::program = envelope_stake::ID)]
    pub pool: Box<Account<'info, Pool>>,

    /// CHECK: the user's stake position, read-only. Not `Account<'info, StakePosition>`: a user
    /// who has never staked has no such account yet (envelope_stake's `stake` creates it on
    /// first use), and that's an ordinary Free-tier caller, not an error — so this is read as
    /// `UncheckedAccount` and treated as "nothing staked" when absent. The handler manually
    /// verifies ownership (`envelope_stake::ID`) and the account's own `user` field whenever it
    /// isn't empty; the `seeds`/`seeds::program` constraint below additionally pins the address.
    #[account(seeds = [b"stake", user.key().as_ref()], bump, seeds::program = envelope_stake::ID)]
    pub stake_position: UncheckedAccount<'info>,

    #[account(
        init_if_needed,
        payer = user,
        space = 8 + UserDaily::INIT_SPACE,
        seeds = [USER_DAILY_SEED, user.key().as_ref()],
        bump
    )]
    // Safe here specifically because correctness never depends on init-time zeroing: the handler
    // always re-checks `day_index` against "today" and resets `deposited_today` itself, whether
    // this account was just created or already existed.
    pub user_daily: Box<Account<'info, UserDaily>>,

    #[account(mut, constraint = user_usdc.owner == user.key())]
    pub user_usdc: Box<Account<'info, TokenAccount>>,

    #[account(mut, address = config.vault_usdc)]
    pub vault_usdc: Box<Account<'info, TokenAccount>>,

    #[account(mut, address = config.cusdc_mint)]
    pub cusdc_mint: Box<InterfaceAccount<'info, Mint2022>>,

    #[account(mut, constraint = user_cusdc.owner == user.key())]
    pub user_cusdc: Box<InterfaceAccount<'info, TokenAccount2022>>,

    pub token_program: Program<'info, Token>,
    pub token_2022_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
}

// Split out of `handle_wrap` deliberately, not just for readability: BPF allocates one 4KB stack
// frame per function call, and this instruction's combined account-reading, tier/limit, and CPI
// logic overflowed a single frame when it was all inlined together (`#[inline(never)]` stops
// release-mode LLVM from re-merging the two and reintroducing that).
#[inline(never)]
fn read_stake_position(stake_position: &UncheckedAccount, user: &Pubkey) -> Result<(u64, i64)> {
    let info = stake_position.to_account_info();
    // Phase 18 self-audit: this used to branch on `lamports() == 0`, treating any funded account
    // as "real". Anyone can send a plain System transfer of 1 lamport to this PDA before the
    // owner ever calls `stake` — a lamport balance alone proves nothing about who created the
    // account. Checking ownership instead is the actual "has envelope_stake initialized this
    // account" test: a pre-funded-but-uninitialized PDA is still System-owned and correctly
    // falls through to the same "never staked" path a griefing 1-lamport transfer used to break.
    if *info.owner != envelope_stake::ID {
        return Ok((0, 0));
    }
    let data = info.try_borrow_data()?;
    let stake_position = StakePosition::try_deserialize(&mut &data[..])?;
    require_keys_eq!(stake_position.user, *user, ErrorCode::InvalidStakePosition);
    Ok((stake_position.amount, stake_position.unlock_requested_at))
}

pub fn handle_wrap(ctx: Context<Wrap>, amount: u64) -> Result<()> {
    require!(amount > 0, ErrorCode::Overflow);

    let user_key = ctx.accounts.user.key();
    let (staked_amount, unlock_requested_at) = read_stake_position(&ctx.accounts.stake_position, &user_key)?;

    let tier = tier_for_stake(
        staked_amount,
        unlock_requested_at,
        ctx.accounts.pool.member_threshold,
        ctx.accounts.pool.business_threshold,
    );
    let limit = ctx.accounts.config.limits[tier as usize];

    let now = Clock::get()?.unix_timestamp;
    let day_index = now / ctx.accounts.config.seconds_per_day;

    let user_daily = &mut ctx.accounts.user_daily;
    if user_daily.day_index != day_index {
        user_daily.day_index = day_index;
        user_daily.deposited_today = 0;
    }
    user_daily.user = ctx.accounts.user.key();

    let new_total = user_daily
        .deposited_today
        .checked_add(amount)
        .ok_or(ErrorCode::Overflow)?;
    require!(new_total <= limit, ErrorCode::DailyLimitExceeded);
    user_daily.deposited_today = new_total;

    // 1) USDC user -> vault_usdc (classic SPL Token, user signs directly).
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.key(),
            Transfer {
                from: ctx.accounts.user_usdc.to_account_info(),
                to: ctx.accounts.vault_usdc.to_account_info(),
                authority: ctx.accounts.user.to_account_info(),
            },
        ),
        amount,
    )?;

    // 2) Mint `amount` public cUSDC to the user's Token-2022 ATA, signed by the VaultAuth PDA.
    let vault_auth_bump = ctx.bumps.vault_authority;
    let signer_seeds: &[&[u8]] = &[VAULT_AUTH_SEED, &[vault_auth_bump]];

    token_2022::mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_2022_program.key(),
            MintTo {
                mint: ctx.accounts.cusdc_mint.to_account_info(),
                to: ctx.accounts.user_cusdc.to_account_info(),
                authority: ctx.accounts.vault_authority.to_account_info(),
            },
            &[signer_seeds],
        ),
        amount,
    )?;

    Ok(())
}
