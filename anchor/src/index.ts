// Here we export some useful types and functions for interacting with the Anchor programs.
import EnvelopeStakeIDL from '../target/idl/envelope_stake.json'
import EnvelopeVaultIDL from '../target/idl/envelope_vault.json'
import HelloWorldIDL from '../target/idl/hello_world.json'

// Re-export the generated IDLs
export { EnvelopeStakeIDL, EnvelopeVaultIDL, HelloWorldIDL }

// Explicit named re-export, not `export * from`: esbuild/tsx's ESM transform silently drops
// namespace re-exports (`export * as x from ...`) when forwarded through a further `export *`,
// even though real Node ESM doesn't have this bug — confirmed by a minimal repro outside this
// repo. vitest (which anchor/tests uses) doesn't hit it, only tsx-run scripts do.
export { envelopeStake, envelopeVault, helloWorld } from './client/js'
