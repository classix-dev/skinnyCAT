// Cross-check with the Python reference: a random seed and message, signed by both, and each
// verifying the other. Skipped when no Python with pycryptodome is found (plain `python3`, else
// `nix develop <repo> -c python3`).

import { execFileSync, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { abiEncodeSignOutput, fromHex, keygen, signWithKey, toHex, verify } from "../src/index.js";

const repo = fileURLToPath(new URL("../..", import.meta.url));
const script = `${repo}/script/vendor/leansphincs_layered_signer.py`;

function findPython(): string[] | null {
  const candidates = [["python3"], ["nix", "develop", repo, "-c", "python3"]];
  for (const cmd of candidates) {
    const r = spawnSync(cmd[0], [...cmd.slice(1), "-c", "import Crypto.Hash.keccak"], { cwd: repo, stdio: "ignore" });
    if (r.status === 0) return cmd;
  }
  return null;
}

const python = findPython();

function py(...args: string[]): string {
  return execFileSync(python![0], [...python!.slice(1), script, ...args], { cwd: repo, encoding: "utf8" }).trim();
}

describe.skipIf(python === null)("cross-check with the Python signer", () => {
  const seed = randomBytes(32);
  const msg = randomBytes(32);
  const r = signWithKey(seed, msg);

  test("Python verifies the TypeScript signature", () => {
    expect(py("verify", toHex(r.publicKey), toHex(msg), toHex(r.signature))).toBe("true");
  }, 60_000);

  test("Python sign gives the same bytes (the scheme is deterministic)", () => {
    const out = py("sign", toHex(seed), toHex(msg));
    expect(out).toBe(toHex(abiEncodeSignOutput(fromHex(r.pkSeed), fromHex(r.pkRoot), r.signature)));
    // And TypeScript verifies what Python produced, read back from the ABI encoding.
    const bytes = fromHex(out);
    const sig = bytes.subarray(128, 128 + 7740);
    expect(verify(r.publicKey, msg, sig)).toBe(true);
  }, 60_000);

  test("Python keygen agrees", () => {
    expect(py("keygen", toHex(seed))).toBe(toHex(keygen(seed).publicKey));
  }, 60_000);

  test("a flipped bit fails in both", () => {
    const bad = r.signature.slice();
    bad[5000] ^= 1;
    expect(verify(r.publicKey, msg, bad)).toBe(false);
    expect(py("verify", toHex(r.publicKey), toHex(msg), toHex(bad))).toBe("false");
  }, 60_000);
});
