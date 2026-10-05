#!/usr/bin/env bash
# Builds a standalone, installable release APK → dist/envelope.apk.
#
# Needs EXPO_PUBLIC_RELAYER_URL in .env set to the hosted relayer (https): a release build has no
# Metro dev server to find a local relayer through, and Android blocks plain http in release.
# Signs with .keys/envelope-release.jks (gitignored). Keep that key: every update of the app —
# including on the Solana dApp Store — must be signed with the same one.
set -euo pipefail
cd "$(dirname "$0")/.."

relayer_url=$(grep -E '^EXPO_PUBLIC_RELAYER_URL=' .env 2>/dev/null | cut -d= -f2- || true)
if [[ "$relayer_url" != https://* ]]; then
  echo "Set EXPO_PUBLIC_RELAYER_URL=https://… (the hosted relayer) in .env first." >&2
  exit 1
fi
echo "Relayer: $relayer_url"
curl -fsS --max-time 90 "$relayer_url/" >/dev/null || echo "warning: relayer didn't answer at $relayer_url/" >&2

keystore=.keys/envelope-release.jks
[[ -f $keystore ]] || { echo "Missing $keystore" >&2; exit 1; }

sdk=${ANDROID_HOME:-$HOME/Library/Android/sdk}
apksigner=$(ls -d "$sdk"/build-tools/*/apksigner | sort -V | tail -1)

npx expo prebuild -p android --clean --no-install
(cd android && ./gradlew assembleRelease)

mkdir -p dist
"$apksigner" sign --ks "$keystore" --ks-key-alias envelope \
  --ks-pass file:.keys/envelope-release.password \
  --out dist/envelope.apk android/app/build/outputs/apk/release/app-release.apk
"$apksigner" verify dist/envelope.apk
echo "Built dist/envelope.apk"
