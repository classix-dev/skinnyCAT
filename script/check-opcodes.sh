#!/usr/bin/env bash
# Fail if any contract's runtime code uses an opcode that ETC (Spiral) doesn't have.
# The CBOR metadata at the end of the code is stripped first, since it's data, not code.
set -euo pipefail
cd "$(dirname "$0")/.."
bad='MCOPY|TLOAD|TSTORE|BLOBHASH|BLOBBASEFEE|BASEFEE|AUTH|AUTHCALL|EXTCALL|EXTDELEGATECALL|EXTSTATICCALL|RETURNDATALOAD|DATALOAD|UNKNOWN'
status=0
for c in LeanSphincsLayeredAsm LeanSphincsWallet LeanSphincsWalletFactory; do
  code=$(forge inspect "$c" deployedBytecode)
  hex=${code#0x}
  meta=$(( 16#${hex: -4} ))          # CBOR length, in bytes
  body=${hex:0:$(( ${#hex} - 2 * (meta + 2) ))}
  hits=$(cast disassemble "0x$body" | grep -E " ($bad)" || true)
  if [ -n "$hits" ]; then echo "$c: opcodes ETC doesn't support"; echo "$hits"; status=1
  else echo "$c: ok ($(( ${#body} / 2 )) bytes of code)"; fi
done
exit $status
