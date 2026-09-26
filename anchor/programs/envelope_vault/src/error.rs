use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Arithmetic overflow")]
    Overflow,
    #[msg("Daily wrap limit exceeded for this tier")]
    DailyLimitExceeded,
    #[msg("Stake position does not belong to this user")]
    InvalidStakePosition,
    #[msg("VaultAuth is not the approved delegate on this account")]
    MissingDelegateApproval,
    #[msg("Pot is already closed")]
    PotAlreadyClosed,
}
