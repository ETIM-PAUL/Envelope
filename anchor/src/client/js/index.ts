/**
 * Build your wrappers around the generated client here.
 *
 * Namespaced, not flattened: the three programs share names (`initialize`, `pool`, ...), so a
 * flat `export *` from all three would collide. Import as `helloWorld.getIncrementInstructionAsync(...)`,
 * `envelopeVault.getWrapInstructionAsync(...)`, `envelopeStake.getStakeInstructionAsync(...)`.
 */
export * as envelopeStake from './generated/envelopeStake'
export * as envelopeVault from './generated/envelopeVault'
export * as helloWorld from './generated/helloWorld'
