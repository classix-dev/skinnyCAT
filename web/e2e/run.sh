#!/usr/bin/env bash
# End-to-end test against a local anvil node.
#
#   cd web && npm run test:e2e
#
# Starts anvil as chain 63 on Shanghai rules, deploys the verifier and factory through the CREATE2
# deployer (so they land at the addresses in src/config.ts), builds the app, serves it with
# `vite preview` and drives it with Playwright. Needs the repo's nix flake and nixpkgs' Playwright
# browsers. Re-execs itself inside the dev shell.
set -euo pipefail

WEB="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROOT="$(cd "$WEB/.." && pwd)"

if [[ -z "${PQ_E2E_IN_SHELL:-}" ]]; then
  export PQ_E2E_IN_SHELL=1
  PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-$(nix build --no-link --print-out-paths nixpkgs#playwright-driver.browsers)}"
  export PLAYWRIGHT_BROWSERS_PATH
  exec nix develop "$ROOT#default" -c bash "$0" "$@"
fi

: "${PLAYWRIGHT_BROWSERS_PATH:?}"
export PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=true

# Ports away from anvil's default 8545, in case another anvil is running.
ANVIL_PORT="${ANVIL_PORT:-8645}"
WEB_PORT="${WEB_PORT:-4317}"
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

echo "== anvil on $RPC"
anvil --chain-id 63 --hardfork shanghai --port "$ANVIL_PORT" --silent >"$TMP/anvil.log" 2>&1 &
pids+=($!)
for _ in $(seq 50); do cast chain-id --rpc-url "$RPC" >/dev/null 2>&1 && break; sleep 0.2; done
[[ "$(cast chain-id --rpc-url "$RPC")" == 63 ]]

echo "== deploy"
# Build output, script cache and broadcast records go to e2e/.tmp, so a local run never touches
# the repo's broadcast/ folder (where real Mordor and mainnet runs are recorded).
(cd "$ROOT" && FOUNDRY_OUT="$TMP/out" FOUNDRY_CACHE_PATH="$TMP/cache" FOUNDRY_BROADCAST="$TMP/broadcast" \
  forge script script/Deploy.s.sol --rpc-url "$RPC" --private-key "$DEPLOYER_KEY" --broadcast --legacy) \
  >"$TMP/deploy.log" 2>&1 || { cat "$TMP/deploy.log"; exit 1; }
grep -E "^ +(verifier|factory|wallet impl) " "$TMP/deploy.log" | sed 's/^ */   /'

echo "== build"
(cd "$WEB" && npm run build >"$TMP/build.log" 2>&1) || { cat "$TMP/build.log"; exit 1; }

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
ANVIL_RPC="$RPC" APP_URL="http://127.0.0.1:$WEB_PORT/" \
  nix shell nixpkgs#playwright-driver.browsers nixpkgs#nodejs_22 -c node e2e/app.test.mjs
