#!/usr/bin/env bash
# Send ETC out of a LeanSphincsWallet with a leanSPHINCS signature.
#
#   [MESSAGE="text"] script/pq-send.sh <rpc-url> <seed-file> <to> <value-in-ether> [relayer-key-file]
#
# MESSAGE, if set, goes on chain as the UTF-8 calldata of the call to <to>, covered by the
# leanSPHINCS signature. Send it to an account without code, so the calldata is only a message.
#
# <seed-file> holds the 32-byte leanSPHINCS seed as 0x-hex. The relayer key (an ordinary
# ECDSA key) only pays gas and submits the transaction. Without it, the script prints the
# wallet address and the signed calldata and stops. Creates the wallet on first use.
# Run inside `nix develop` (needs cast and node), after `npm ci` in signer.
set -euo pipefail
cd "$(dirname "$0")/.."

RPC=$1 SEED_FILE=$2 TO=$3 VALUE_ETH=$4 RELAYER_KEY_FILE=${5:-}
FACTORY=${FACTORY:?set FACTORY to the LeanSphincsWalletFactory address (forge script script/Deploy.s.sol prints it)}
SIGNER=(node signer/node_modules/tsx/dist/cli.mjs signer/src/cli.ts)
TAG=$(cast keccak "classix.pq-sig.LeanSphincsWallet.execute.v1")

SEED=$(tr -d ' \n' < "$SEED_FILE")
PK=$("${SIGNER[@]}" keygen "$SEED")             # PK.seed ‖ PK.root, 32 bytes
PK=${PK#0x}
PK_SEED=0x${PK:0:32}00000000000000000000000000000000
PK_ROOT=0x${PK:32:32}00000000000000000000000000000000

CHAIN_ID=$(cast chain-id --rpc-url "$RPC")
WALLET=$(cast call "$FACTORY" "walletAddress(bytes32,bytes32)(address)" "$PK_SEED" "$PK_ROOT" --rpc-url "$RPC")
if [ "$(cast code "$WALLET" --rpc-url "$RPC")" = "0x" ]; then DEPLOYED=0 NONCE=0
else DEPLOYED=1 NONCE=$(cast call "$WALLET" "nonce()(uint256)" --rpc-url "$RPC"); fi
VALUE=$(cast to-wei "$VALUE_ETH")
DEADLINE=$(( $(date +%s) + 3600 ))
DATA=$(cast from-utf8 "${MESSAGE:-}")

echo "chain     $CHAIN_ID"
echo "wallet    $WALLET (deployed=$DEPLOYED nonce=$NONCE balance=$(cast balance --ether "$WALLET" --rpc-url "$RPC"))"
echo "to        $TO value=$VALUE_ETH deadline=$DEADLINE"
[ -n "${MESSAGE:-}" ] && echo "message   \"$MESSAGE\" ($(( (${#DATA} - 2) / 2 )) bytes of calldata)"

MSG=$(cast keccak "$(cast abi-encode "f(bytes32,uint256,address,uint256,address,uint256,bytes32,uint256)" \
  "$TAG" "$CHAIN_ID" "$WALLET" "$NONCE" "$TO" "$VALUE" "$(cast keccak $DATA)" "$DEADLINE")")
if [ "$DEPLOYED" = 1 ]; then
  ONCHAIN=$(cast call "$WALLET" "messageHash(address,uint256,bytes,uint256,uint256)(bytes32)" "$TO" "$VALUE" "$DATA" "$NONCE" "$DEADLINE" --rpc-url "$RPC")
  [ "$ONCHAIN" = "$MSG" ] || { echo "message hash mismatch: $ONCHAIN vs $MSG"; exit 1; }
fi
echo "digest    $MSG"

echo "signing (a few seconds)..."
OUT=$("${SIGNER[@]}" sign "$SEED" "$MSG")
SIG=$(cast abi-decode --input "f(bytes32,bytes32,bytes)" "$OUT" | sed -n 3p)
echo "signature $(( (${#SIG} - 2) / 2 )) bytes"

VERIFIER=$(cast call "$(cast call "$FACTORY" "implementation()(address)" --rpc-url "$RPC")" "verifier()(address)" --rpc-url "$RPC")
OK=$(cast call "$VERIFIER" "verify(bytes32,bytes32,bytes32,bytes)(bool)" "$PK_SEED" "$PK_ROOT" "$MSG" "$SIG" --rpc-url "$RPC")
echo "on-chain verify $OK"
[ "$OK" = true ] || exit 1

if [ "$DEPLOYED" = 1 ]; then
  TARGET=$WALLET SIGFN="execute(address,uint256,bytes,uint256,bytes)" ARGS=("$TO" "$VALUE" "$DATA" "$DEADLINE" "$SIG")
else
  TARGET=$FACTORY SIGFN="createAndExecute(bytes32,bytes32,address,uint256,bytes,uint256,bytes)"
  ARGS=("$PK_SEED" "$PK_ROOT" "$TO" "$VALUE" "$DATA" "$DEADLINE" "$SIG")
fi

if [ -z "$RELAYER_KEY_FILE" ]; then
  echo "no relayer key, calldata for $TARGET:"
  cast calldata "$SIGFN" "${ARGS[@]}"
  exit 0
fi
RELAYER_KEY=$(tr -d ' \n' < "$RELAYER_KEY_FILE")
GAS=$(cast estimate "$TARGET" "$SIGFN" "${ARGS[@]}" --from "$(cast wallet address --private-key "$RELAYER_KEY")" --rpc-url "$RPC")
echo "gas estimate $GAS"
cast send --legacy --gas-limit $(( GAS * 12 / 10 )) --private-key "$RELAYER_KEY" --rpc-url "$RPC" "$TARGET" "$SIGFN" "${ARGS[@]}"
