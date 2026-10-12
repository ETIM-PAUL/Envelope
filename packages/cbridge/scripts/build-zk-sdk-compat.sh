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
#
#   build-zk-sdk-compat.sh           rebuild and overwrite vendor/zk-sdk-web
#   build-zk-sdk-compat.sh --check   rebuild and check vendor/zk-sdk-web is byte-identical
#
# The wasm embeds its source path in panic messages, so a byte-for-byte match needs the source at
# the same path the vendored copy was built from: --check clones it there (VENDORED_SRC below).
# Any other path gives the same code with a different path string.
set -euo pipefail

ZK_SDK_TAG=zk-sdk-wasm-js@v0.5.3 # @solana/zk-sdk 0.5.3
WASM_BINDGEN_VERSION=0.2.100     # from that tag's Cargo.lock
RUST_TOOLCHAIN=1.93.1            # from that tag's rust-toolchain.toml
VENDORED_SRC=/private/tmp/claude-501/-Users-henchman-myapp/41d12f96-18c9-4558-9725-93f3a0b4293a/scratchpad/zk-elgamal-proof
check=false
[ "${1:-}" = --check ] && check=true

out="$(cd "$(dirname "$0")/.." && pwd)/vendor/zk-sdk-web"
work=$(mktemp -d)
src="$work/src"
if $check; then
  [ -e "$VENDORED_SRC" ] && { echo "$VENDORED_SRC already exists; move it aside first" >&2; exit 1; }
  src="$VENDORED_SRC"
  mkdir -p "$(dirname "$src")"
fi
trap 'rm -rf "$work"; if $check; then rm -rf "$src"; fi' EXIT
cd "$work"

git clone -q --depth 1 --branch "$ZK_SDK_TAG" https://github.com/solana-program/zk-elgamal-proof.git "$src"
echo "source: $ZK_SDK_TAG at commit $(git -C "$src" rev-parse HEAD), checked out in $src"
rustup target add wasm32-unknown-unknown --toolchain "$RUST_TOOLCHAIN"
cargo install wasm-bindgen-cli --version "$WASM_BINDGEN_VERSION" --locked --root tools
npm install --prefix tools --no-audit --no-fund binaryen >/dev/null

(cd "$src" && RUSTFLAGS="-C target-feature=-reference-types" \
  cargo "+$RUST_TOOLCHAIN" build --release --target wasm32-unknown-unknown -p solana-zk-sdk-wasm-js)

# The prebuilt std still declares reference-types in the module's target_features section, and
# wasm-bindgen enables externref whenever it sees that, so drop the section first.
tools/node_modules/.bin/wasm-opt "$src"/target/wasm32-unknown-unknown/release/solana_zk_sdk_wasm_js.wasm \
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

if $check; then
  cmp bindgen/index.js "$out/index.js"
  cmp bindgen/index.d.ts "$out/index.d.ts"
  cmp optimized.wasm "$out/index_bg.wasm"
  shasum -a 256 optimized.wasm bindgen/index.js bindgen/index.d.ts
  echo "vendor/zk-sdk-web is byte-identical to a fresh build of $ZK_SDK_TAG"
  exit 0
fi

mkdir -p "$out"
cp bindgen/index.js bindgen/index.d.ts "$out/"
cp optimized.wasm "$out/index_bg.wasm"
echo "wrote $out"
