#!/usr/bin/env bash
# Send ETC out of a LeanSphincsWallet with a leanSPHINCS signature.
#
#   script/pq-send.sh <rpc-url> <seed-file> <to> <value-in-ether> [relayer-key-file]
#
# <seed-file> holds the 32-byte leanSPHINCS seed as 0x-hex. The relayer key (an ordinary
# ECDSA key) only pays gas and submits the transaction. Without it, the script prints the
# wallet address and the signed calldata and stops. Creates the wallet on first use.
# Run inside `nix develop` (needs cast and python3 with pycryptodome).
set -euo pipefail
cd "$(dirname "$0")/.."

RPC=$1 SEED_FILE=$2 TO=$3 VALUE_ETH=$4 RELAYER_KEY_FILE=${5:-}
FACTORY=${FACTORY:-0x3e770624D601F6F6e5D7258ad83AC84927181139}
SIGNER=script/vendor/leansphincs_layered_signer.py
TAG=$(cast keccak "classix.pq-sig.LeanSphincsWallet.execute.v1")

SEED=$(tr -d ' \n' < "$SEED_FILE")
PK=$(python3 "$SIGNER" keygen "$SEED")          # root ‖ P, 32 bytes
PK=${PK#0x}
PK_ROOT=0x${PK:0:32}00000000000000000000000000000000
PK_SEED=0x${PK:32:32}00000000000000000000000000000000

CHAIN_ID=$(cast chain-id --rpc-url "$RPC")
WALLET=$(cast call "$FACTORY" "walletAddress(bytes32,bytes32)(address)" "$PK_SEED" "$PK_ROOT" --rpc-url "$RPC")
if [ "$(cast code "$WALLET" --rpc-url "$RPC")" = "0x" ]; then DEPLOYED=0 NONCE=0
else DEPLOYED=1 NONCE=$(cast call "$WALLET" "nonce()(uint256)" --rpc-url "$RPC"); fi
VALUE=$(cast to-wei "$VALUE_ETH")
DEADLINE=$(( $(date +%s) + 3600 ))
DATA=0x

echo "chain     $CHAIN_ID"
echo "wallet    $WALLET (deployed=$DEPLOYED nonce=$NONCE balance=$(cast balance --ether "$WALLET" --rpc-url "$RPC"))"
echo "to        $TO value=$VALUE_ETH deadline=$DEADLINE"

MSG=$(cast keccak "$(cast abi-encode "f(bytes32,uint256,address,uint256,address,uint256,bytes32,uint256)" \
  "$TAG" "$CHAIN_ID" "$WALLET" "$NONCE" "$TO" "$VALUE" "$(cast keccak $DATA)" "$DEADLINE")")
if [ "$DEPLOYED" = 1 ]; then
  ONCHAIN=$(cast call "$WALLET" "messageHash(address,uint256,bytes,uint256,uint256)(bytes32)" "$TO" "$VALUE" "$DATA" "$NONCE" "$DEADLINE" --rpc-url "$RPC")
  [ "$ONCHAIN" = "$MSG" ] || { echo "message hash mismatch: $ONCHAIN vs $MSG"; exit 1; }
fi
echo "message   $MSG"

echo "signing (a few seconds)..."
OUT=$(python3 "$SIGNER" sign "$SEED" "$MSG")
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
