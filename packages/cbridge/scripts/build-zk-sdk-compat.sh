#!/usr/bin/env bash
# Rebuilds vendor/zk-sdk-web: @solana/zk-sdk's "web" target, compiled without WebAssembly
# reference types (externref).
#
# Why: the published package needs reference types, i.e. a Chrome 96+ WebView. Phones without
# Google services (e.g. Huawei) ship their own WebView that the Play Store can't update — a Huawei
# nova 7i has Chrome 92 — and fail with "invalid value type 'externref'". Same Rust source, same
# proofs; only how the wasm talks to JS changes (wasm-bindgen's JS-side heap instead of an
# externref table). Keys, ciphertexts, and proofs were cross-checked against the published build.
#
# Must match the version in package-lock.json (@solana/zk-sdk). Needs rustup and npm.
set -euo pipefail

ZK_SDK_TAG=zk-sdk-wasm-js@v0.5.3 # @solana/zk-sdk 0.5.3
WASM_BINDGEN_VERSION=0.2.100     # from that tag's Cargo.lock
RUST_TOOLCHAIN=1.93.1            # from that tag's rust-toolchain.toml

out="$(cd "$(dirname "$0")/.." && pwd)/vendor/zk-sdk-web"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
cd "$work"

git clone -q --depth 1 --branch "$ZK_SDK_TAG" https://github.com/solana-program/zk-elgamal-proof.git src
rustup target add wasm32-unknown-unknown --toolchain "$RUST_TOOLCHAIN"
cargo install wasm-bindgen-cli --version "$WASM_BINDGEN_VERSION" --locked --root tools
npm install --prefix tools --no-audit --no-fund binaryen >/dev/null

(cd src && RUSTFLAGS="-C target-feature=-reference-types" \
  cargo "+$RUST_TOOLCHAIN" build --release --target wasm32-unknown-unknown -p solana-zk-sdk-wasm-js)

# The prebuilt std still declares reference-types in the module's target_features section, and
# wasm-bindgen enables externref whenever it sees that, so drop the section first.
tools/node_modules/.bin/wasm-opt src/target/wasm32-unknown-unknown/release/solana_zk_sdk_wasm_js.wasm \
  --strip-target-features -o stripped.wasm
tools/bin/wasm-bindgen --target web --out-dir bindgen --out-name index stripped.wasm
if grep -q externref bindgen/index.js; then
  echo "wasm-bindgen still emitted externref glue" >&2
  exit 1
fi

# Optimize with every feature Chrome 92 has *except* reference types: fails validation if the
# module still uses them, and re-encodes call_indirect, which older engines parse strictly.
tools/node_modules/.bin/wasm-opt bindgen/index_bg.wasm -O3 \
  --enable-mutable-globals --enable-nontrapping-float-to-int --enable-bulk-memory \
  --enable-bulk-memory-opt --enable-sign-ext --enable-multivalue \
  -o optimized.wasm

mkdir -p "$out"
cp bindgen/index.js bindgen/index.d.ts "$out/"
cp optimized.wasm "$out/index_bg.wasm"
echo "wrote $out"
