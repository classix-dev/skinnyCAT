#!/usr/bin/env bash
# Fail if any contract's runtime code uses an opcode that ETC (Spiral) doesn't have.
# The CBOR metadata at the end of the code is stripped first, since it's data, not code. Bytes
# after the last INVALID are reported but don't fail the check: via-IR puts constants there (for
# example event topics), and no jump can land in them. Read them before trusting that.
set -euo pipefail
cd "$(dirname "$0")/.."
bad='MCOPY|TLOAD|TSTORE|BLOBHASH|BLOBBASEFEE|BASEFEE|AUTH|AUTHCALL|EXTCALL|EXTDELEGATECALL|EXTSTATICCALL|RETURNDATALOAD|DATALOAD|UNKNOWN'
status=0
for c in LeanSphincsVerifier LeanSphincsWallet LeanSphincsWalletFactory LeanSphincsLedger; do
  code=$(forge inspect "$c" deployedBytecode)
  hex=${code#0x}
  meta=$(( 16#${hex: -4} ))          # CBOR length, in bytes
  body=${hex:0:$(( ${#hex} - 2 * (meta + 2) ))}
  dis=$(cast disassemble "0x$body")
  last_invalid=$(printf '%s\n' "$dis" | grep -n ' INVALID$' | tail -1 | cut -d: -f1)
  last_invalid=${last_invalid:-$(printf '%s\n' "$dis" | wc -l)}
  code_hits=$(printf '%s\n' "$dis" | head -n "$last_invalid" | grep -E " ($bad)" || true)
  data_hits=$(printf '%s\n' "$dis" | tail -n +"$((last_invalid + 1))" | grep -c -E " ($bad)" || true)
  if [ -n "$code_hits" ]; then echo "$c: opcodes ETC doesn't support"; echo "$code_hits"; status=1
  else echo "$c: ok ($(( ${#body} / 2 )) bytes, $data_hits odd bytes in the data after the last INVALID)"; fi
done
exit $status
