#!/usr/bin/env node
/// <reference types="node" />
// SPDX-License-Identifier: MIT
//
// The CLI of script/vendor/leansphincs_layered_signer.py, same output formats (every hex argument
// may carry a 0x prefix):
//   cli.ts keygen <seed32>                  prints the 32-byte public key root ‖ P
//   cli.ts sign <seed32> <msg32>            prints 0x ‖ abi.encode(bytes32 pkSeed, bytes32 pkRoot, bytes sig)
//   cli.ts verify <pk32> <msg32> <sig7740>  prints true / false

import { abiEncodeSignOutput, fromHex, keygen, signWithKey, toHex, verify } from "./index.js";

const USAGE = `usage:
  keygen <seed32hex>
  sign <seed32hex> <msg32hex>
  verify <pk32hex> <msg32hex> <sig7740hex>
`;

function main(argv: string[]): number {
  const [cmd, ...args] = argv;
  if (cmd === "keygen" && args.length === 1) {
    process.stdout.write(toHex(keygen(fromHex(args[0])).publicKey));
    return 0;
  }
  if (cmd === "sign" && args.length === 2) {
    const r = signWithKey(fromHex(args[0]), fromHex(args[1]));
    process.stdout.write(toHex(abiEncodeSignOutput(fromHex(r.pkSeed), fromHex(r.pkRoot), r.signature)));
    return 0;
  }
  if (cmd === "verify" && args.length === 3) {
    process.stdout.write(verify(fromHex(args[0]), fromHex(args[1]), fromHex(args[2])) ? "true" : "false");
    return 0;
  }
  process.stderr.write(USAGE);
  return 2;
}

process.exitCode = main(process.argv.slice(2));
