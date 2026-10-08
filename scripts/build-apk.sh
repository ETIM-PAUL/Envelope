#!/usr/bin/env bash
# Builds a standalone, installable release APK → dist/envelope.apk.
#
# `npm run android:apk:arm64` builds a smaller one → dist/arm64-v8a/envelope.apk: arm64-v8a only (every
# phone from the last several years, Seeker included, and Apple Silicon emulators) with native
# libraries compressed in the APK. It drops the x86/x86_64 code for Intel emulators and 32-bit ARM.
#
# Needs EXPO_PUBLIC_RELAYER_URL in .env set to the hosted relayer (https): a release build has no
# Metro dev server to find a local relayer through, and Android blocks plain http in release.
# Signs with .keys/envelope-release.jks (gitignored). Keep that key: every update of the app —
# including on the Solana dApp Store — must be signed with the same one.
set -euo pipefail
cd "$(dirname "$0")/.."

abis=${1:-}
gradle_args=()
out=dist/envelope.apk
if [[ -n $abis ]]; then
  gradle_args=("-PreactNativeArchitectures=$abis" -Pexpo.useLegacyPackaging=true)
  out=dist/${abis//,/-}/envelope.apk
fi

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
# `prebuild --clean` drops android/local.properties, so tell Gradle where the SDK is.
export ANDROID_HOME=$sdk
apksigner=$(ls -d "$sdk"/build-tools/*/apksigner | sort -V | tail -1)

npx expo prebuild -p android --clean --no-install
(cd android && ./gradlew assembleRelease ${gradle_args[@]+"${gradle_args[@]}"})

mkdir -p "$(dirname "$out")"
"$apksigner" sign --ks "$keystore" --ks-key-alias envelope \
  --ks-pass file:.keys/envelope-release.password \
  --out "$out" android/app/build/outputs/apk/release/app-release.apk
"$apksigner" verify "$out"
echo "Built $out ($(du -h "$out" | cut -f1))"
