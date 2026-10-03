import { install } from '@solana/webcrypto-ed25519-polyfill'

// Kit generates and imports Ed25519 keys through WebCrypto (e.g. the one-time proof-context
// accounts in every confidential transfer and withdraw, and pot signers), but Android System
// WebView only gained native Ed25519 in Chromium ~137 — 134 (the emulator's, and plenty of real
// phones') throws SOLANA_ERROR__SUBTLE_CRYPTO__ED25519_ALGORITHM_UNIMPLEMENTED. Imported first by
// bridge.ts so it's in place before anything else in the bundle runs.
install()
