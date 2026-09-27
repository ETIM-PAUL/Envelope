use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Arithmetic overflow")]
    Overflow,
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
    #[msg("An unstake request is already pending for this stake position")]
    UnstakeAlreadyRequested,
    #[msg("Cannot stake more while an unstake request is pending — withdraw or wait it out first")]
    CannotStakeDuringUnstake,
    #[msg("No unstake has been requested for this stake position")]
    NoUnstakeRequested,
    #[msg("The cooldown period has not elapsed yet")]
    CooldownNotElapsed,
    #[msg("Nothing staked to unstake")]
    NothingStaked,
    #[msg("member_threshold must be <= business_threshold")]
    InvalidThresholds,
}
