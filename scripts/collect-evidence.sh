#!/usr/bin/env bash
# Reruns the checks in docs/VERIFY.md and keeps the complete, unedited output of each in
# docs/evidence/<date>/, one log per check, headed with the date, commit and command, plus a
# SUMMARY.md of every log in that folder.
#
#   scripts/collect-evidence.sh                      every check
#   scripts/collect-evidence.sh public               only those anyone with a clone can run
#   scripts/collect-evidence.sh devnet-e2e anchor-tests   just these (by log name)
#
# "public" checks need `npm install` and rustup. The rest use the project's devnet keys in .keys/
# and the hosted relayer (RELAYER_URL to point them elsewhere), so only maintainers can run them.
set -uo pipefail

cd "$(dirname "$0")/.."
export RELAYER_URL="${RELAYER_URL:-https://envelope-relayer.onrender.com}"
day=$(date -u +%Y-%m-%d)
out="docs/evidence/$day"
mkdir -p "$out"
commit=$(git rev-parse HEAD)
dirty=$(git status --porcelain --untracked-files=no -- . ':!docs' | head -1)
[ -n "$dirty" ] && commit="$commit (with uncommitted changes)"

PUBLIC="zk-sdk-rebuild zk-sdk-compare unit-tests npm-audit cargo-audit"
MAINTAINER="relayer-attacks relayer-fuel devnet-e2e pot-roundtrip anchor-tests"
case "${1:-all}" in
  all) wanted="$PUBLIC $MAINTAINER" ;;
  public) wanted="$PUBLIC" ;;
  *) wanted="$*" ;;
esac

run() { # name, description, command
  local name=$1 what=$2 cmd=$3
  [[ " $wanted " == *" $name "* ]] || return 0
  local log="$out/$name.log"
  {
    echo "# $what"
    echo "# date:    $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo "# commit:  $commit"
    echo "# command: $cmd"
    echo "# node $(node --version), $(solana --version 2>/dev/null | cut -d' ' -f1-2), $(anchor --version 2>/dev/null), relayer $RELAYER_URL"
    echo
  } > "$log"
  echo "== $name"
  local start=$SECONDS
  bash -c "$cmd" >> "$log" 2>&1
  local code=$?
  printf '\n# exit %s after %ss\n' "$code" "$((SECONDS - start))" >> "$log"
  echo "   exit $code ($((SECONDS - start))s)"
}

run zk-sdk-rebuild "The vendored zk-sdk WebAssembly is byte-identical to a fresh build of Solana's tagged source" \
  'bash packages/cbridge/scripts/build-zk-sdk-compat.sh --check'
run zk-sdk-compare "The rebuild is the same cryptography as the published @solana/zk-sdk" \
  'npm run cbridge:verify-zk-sdk'
run unit-tests "Unit tests: network retry, biometric store, QR and link parsing" 'npm run test:unit'
run npm-audit "npm dependency audit (see THREAT_MODEL.md for the remaining advisories)" 'npm audit; true'
run cargo-audit "Rust dependency audit (Anchor programs)" 'cd anchor && cargo audit'
run relayer-attacks "The relayer's policy refuses every drain attempt and relays a legitimate transaction" \
  'npm run relayer:test-attacks'
run relayer-fuel "SKR fuel refills: paid, refused when not due, tamper-proof" 'npm run relayer:test-fuel'
# The wrap and deposit half of the cSKR round trip first: it checks the supply invariant and tops
# up the test wallet the end-to-end run spends from.
run devnet-e2e "Private sends, pots, batch send and gift links end to end, with ciphertext checks" \
  'npm run devnet:cskr-roundtrip -- --top-up && npm run devnet:bridge-e2e'
run pot-roundtrip "Guests can't read a pot's total" 'npm run devnet:pot-roundtrip'
run anchor-tests "Anchor program tests, including the scanners' three leads" \
  'cd anchor && anchor build && anchor test --validator legacy --skip-build'

# The summary covers every log in the folder, so checks rerun on their own stay listed.
summary="$out/SUMMARY.md"
{
  printf '# Evidence, %s\n\nEach log is the complete output of its command, headed with the commit it ran against. ' "$day"
  printf 'Rerun with `scripts/collect-evidence.sh`.\n\n| Check | Result | Log |\n| --- | --- | --- |\n'
  for name in $PUBLIC $MAINTAINER; do
    log="$out/$name.log"
    [ -f "$log" ] || continue
    what=$(head -1 "$log" | sed 's/^# //')
    code=$(tail -1 "$log" | sed -n 's/^# exit \([0-9]*\).*/\1/p')
    result="pass"
    [ "$code" != 0 ] && result="**fail** (exit ${code:-?})"
    [ "$name" = npm-audit ] && result="report"
    printf '| %s | %s | [%s](%s) |\n' "$what" "$result" "$name.log" "$name.log"
  done
} > "$summary"
echo
cat "$summary"
