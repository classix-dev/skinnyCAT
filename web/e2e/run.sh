#!/usr/bin/env bash
# End-to-end test against a local anvil node with ETC's rules.
#
#   cd web && npm run test:e2e        (or bash e2e/run.sh)
#
# Starts anvil as chain 61 on Shanghai rules, deploys with script/Deploy.s.sol through the CREATE2
# deployer, checks that src/generated/ matches what it deployed, refreshes the digest fixture from
# the live ledger, builds and pre-renders the app, serves it with `vite preview` and drives it with
# Playwright. Needs the repo's nix flake and nixpkgs' Playwright browsers. Re-execs itself inside
# the dev shell.
#
#   PQ_SIGNER_SRC=path/to/index.ts   build against another copy of the signer
#   ANVIL_PORT, WEB_PORT             default 8845 and 4417
set -euo pipefail

WEB="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROOT="$(cd "$WEB/.." && pwd)"
export TMPDIR="${TMPDIR:-/workspace/.kart/tmp}"

if [[ -z "${PQ_E2E_IN_SHELL:-}" ]]; then
  export PQ_E2E_IN_SHELL=1
  PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-$(nix build --no-link --print-out-paths nixpkgs#playwright-driver.browsers)}"
  export PLAYWRIGHT_BROWSERS_PATH
  exec nix develop "$ROOT#default" -c bash "$0" "$@"
fi

: "${PLAYWRIGHT_BROWSERS_PATH:?}"
export PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=true

ANVIL_PORT="${ANVIL_PORT:-8845}"
WEB_PORT="${WEB_PORT:-4417}"
RPC="http://127.0.0.1:$ANVIL_PORT"
# anvil's default account 0, a well-known test key.
DEPLOYER_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
TMP="$WEB/e2e/.tmp"
mkdir -p "$TMP"

pids=()
cleanup() { for p in "${pids[@]}"; do kill "$p" 2>/dev/null || true; done; }
trap cleanup EXIT

for port in "$ANVIL_PORT" "$WEB_PORT"; do
  if curl -s -o /dev/null "http://127.0.0.1:$port/"; then echo "port $port is in use" >&2; exit 1; fi
done

echo "== anvil on $RPC, chain 61, shanghai"
anvil --chain-id 61 --hardfork shanghai --port "$ANVIL_PORT" --silent >"$TMP/anvil.log" 2>&1 &
pids+=($!)
for _ in $(seq 50); do cast chain-id --rpc-url "$RPC" >/dev/null 2>&1 && break; sleep 0.2; done
[[ "$(cast chain-id --rpc-url "$RPC")" == 61 ]]

echo "== deploy"
# Build output, cache and broadcast records go to e2e/.tmp, so a local run never touches the repo's
# out/ or broadcast/ folders.
export FOUNDRY_OUT="$TMP/out" FOUNDRY_CACHE_PATH="$TMP/cache"
(cd "$ROOT" && FOUNDRY_BROADCAST="$TMP/broadcast" \
  forge script script/Deploy.s.sol --rpc-url "$RPC" --private-key "$DEPLOYER_KEY" --broadcast --legacy) \
  >"$TMP/deploy.log" 2>&1 || { cat "$TMP/deploy.log"; exit 1; }
VERIFIER="$(awk '$1 == "verifier:" { print $3 }' "$TMP/deploy.log" | tail -1)"
LEDGER="$(awk '$1 == "ledger:" { print $3 }' "$TMP/deploy.log" | tail -1)"
echo "   verifier $VERIFIER"
echo "   ledger   $LEDGER"
[[ -n "$VERIFIER" && -n "$LEDGER" ]] || { echo "couldn't read the addresses from the deploy log" >&2; cat "$TMP/deploy.log"; exit 1; }

echo "== generated files match the deploy"
for a in "$VERIFIER" "$LEDGER"; do
  if ! grep -qi "\"$a\"" "$WEB/src/generated/contracts.ts"; then
    echo "src/generated/contracts.ts doesn't have $a. The contracts changed since the last \`npm run gen\`." >&2
    echo "Run \`forge build && (cd web && npm run gen)\` in the repo root, then rerun." >&2
    exit 1
  fi
done
(cd "$WEB" && node --experimental-strip-types scripts/check-signer.mjs ${PQ_SIGNER_SRC:+"$PQ_SIGNER_SRC"}) || {
  echo "The signer doesn't match the verifier's vectors. If the signer is mid-change, set PQ_SIGNER_SRC to a working copy." >&2
  exit 1
}

echo "== digest fixture from the live ledger"
(cd "$WEB" && node --experimental-strip-types --no-warnings scripts/digest-fixture.mjs "$RPC" "$LEDGER")

echo "== unit tests"
(cd "$WEB" && npx vitest run --reporter=dot >"$TMP/unit.log" 2>&1) || { cat "$TMP/unit.log"; exit 1; }
tail -4 "$TMP/unit.log" | sed 's/^/   /'

echo "== build"
(cd "$WEB" && npm run build >"$TMP/build.log" 2>&1) || { cat "$TMP/build.log"; exit 1; }
grep "pre-rendered" "$TMP/build.log" | sed 's/^/   /'
(cd "$WEB" && node e2e/prerender-check.mjs)

echo "== serve on :$WEB_PORT"
(cd "$WEB" && exec node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port "$WEB_PORT" --strictPort \
  >"$TMP/preview.log" 2>&1) &
pids+=($!)
for _ in $(seq 50); do curl -sf "http://127.0.0.1:$WEB_PORT/" >/dev/null && break; sleep 0.2; done

echo "== playwright"
cd "$WEB"
# Headless Chromium aborts on text without a fontconfig setup, so give it one with DejaVu.
FONTS="$(nix build --no-link --print-out-paths nixpkgs#dejavu_fonts)"
cat >"$TMP/fonts.conf" <<FC
<?xml version="1.0"?>
<fontconfig><dir>$FONTS/share/fonts</dir><cachedir>$TMP/fc-cache</cachedir></fontconfig>
FC
export FONTCONFIG_FILE="$TMP/fonts.conf"
# The browsers only find their libraries inside a nix shell.
ANVIL_RPC="$RPC" APP_URL="http://127.0.0.1:$WEB_PORT/" LEDGER="$LEDGER" \
  nix shell nixpkgs#playwright-driver.browsers nixpkgs#nodejs_22 -c node e2e/app.test.mjs
