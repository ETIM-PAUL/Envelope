// Phase 13: the relayer's base URL. `EXPO_PUBLIC_*` vars are inlined into the bundle at build
// time (see .env.example), same as DEVNET_RPC_URL. Falls back to the relayer's default local dev
// port — but `localhost` from an Android emulator's network namespace doesn't reach the host
// machine; use `http://10.0.2.2:8787` (the emulator's host-loopback alias) there, or your
// machine's LAN IP on a physical device, via EXPO_PUBLIC_RELAYER_URL.
export const RELAYER_URL = process.env.EXPO_PUBLIC_RELAYER_URL || 'http://localhost:8787'
