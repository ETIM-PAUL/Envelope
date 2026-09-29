// Phase 7: Helius devnet RPC connection. `EXPO_PUBLIC_*` vars are inlined into the bundle at
// build time (see .env.example) — falls back to the public devnet RPC if unset, so the app still
// runs (rate-limited) without a Helius key configured.
export const DEVNET_RPC_URL = process.env.EXPO_PUBLIC_HELIUS_DEVNET_RPC_URL || 'https://api.devnet.solana.com'
