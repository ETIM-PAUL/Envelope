# Evidence, 2026-10-12

Each log is the complete output of its command, headed with the commit it ran against. Rerun with `scripts/collect-evidence.sh`.

| Check | Result | Log |
| --- | --- | --- |
| The vendored zk-sdk WebAssembly is byte-identical to a fresh build of Solana's tagged source | pass | [zk-sdk-rebuild.log](zk-sdk-rebuild.log) |
| The rebuild is the same cryptography as the published @solana/zk-sdk | pass | [zk-sdk-compare.log](zk-sdk-compare.log) |
| Unit tests: network retry, biometric store, QR and link parsing | pass | [unit-tests.log](unit-tests.log) |
| npm dependency audit (see THREAT_MODEL.md for the remaining advisories) | report | [npm-audit.log](npm-audit.log) |
| Rust dependency audit (Anchor programs) | pass | [cargo-audit.log](cargo-audit.log) |
| The relayer's policy refuses every drain attempt and relays a legitimate transaction | pass | [relayer-attacks.log](relayer-attacks.log) |
| SKR fuel refills: paid, refused when not due, tamper-proof | pass | [relayer-fuel.log](relayer-fuel.log) |
| Private sends, pots, batch send and gift links end to end, with ciphertext checks | pass | [devnet-e2e.log](devnet-e2e.log) |
| Guests can't read a pot's total | pass | [pot-roundtrip.log](pot-roundtrip.log) |
| Anchor program tests, including the scanners' three leads | pass | [anchor-tests.log](anchor-tests.log) |
