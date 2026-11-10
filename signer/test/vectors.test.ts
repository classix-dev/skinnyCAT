// Byte-for-byte checks against EthLib's leanSPHINCS vectors (test/fixtures/ethlib-sphincs, read
// from the YAML files EthLib ships), plus round trips and tampering on fresh keys.

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import {
  SIG_SIZE,
  Signer,
  abiEncodeSignOutput,
  expandKey,
  fromHex,
  keygen,
  sign,
  signWithKey,
  toHex,
  verify,
  verifyTrace,
} from "../src/index.js";

const root = fileURLToPath(new URL("../../test/fixtures/ethlib-sphincs/", import.meta.url));

/** EthLib's data.yaml: `input:` with indented `key: '0x..'` lines, then `output: ...`. */
function readCase(op: string, name: string): { input: Record<string, string>; output: string | boolean | null } {
  const input: Record<string, string> = {};
  let output: string | boolean | null | undefined;
  const value = (s: string) =>
    s === "null" ? null : s === "true" ? true : s === "false" ? false : s.replace(/^'|'$/g, "").toLowerCase();
  for (const line of readFileSync(`${root}${op}/${name}/data.yaml`, "utf8").split("\n")) {
    let m = line.match(/^ {2}(\w+): (.*)$/);
    if (m) input[m[1]] = value(m[2]) as string;
    m = line.match(/^output: (.*)$/);
    if (m) output = value(m[1]);
  }
  if (output === undefined) throw new Error(`${op}/${name}: no output`);
  return { input, output };
}

const cases = (op: string) =>
  readdirSync(`${root}${op}`, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()
    .map((name) => [name, readCase(op, name)] as const);

/** The vectors' `null`: the input is rejected, a RangeError here. */
function call<T>(fn: () => T): T | null {
  try {
    return fn();
  } catch (e) {
    if (e instanceof RangeError) return null;
    throw e;
  }
}

const SLOW = 120_000;

describe("EthLib vectors", () => {
  test("every case is here", () => {
    expect(cases("key_gen").length).toBe(4);
    expect(cases("sign").length).toBe(5);
    expect(cases("verify").length).toBe(26);
  });

  test.each(cases("key_gen"))("key_gen %s", (_name, c) => {
    expect(call(() => toHex(keygen(fromHex(c.input.seed)).publicKey))).toBe(c.output);
  }, SLOW);

  test.each(cases("sign"))("sign %s", (_name, c) => {
    expect(call(() => toHex(sign(fromHex(c.input.seed), fromHex(c.input.message))))).toBe(c.output);
  }, SLOW);

  test.each(cases("verify"))("verify %s", (_name, c) => {
    const got = call(() => verify(fromHex(c.input.public_key), fromHex(c.input.message), fromHex(c.input.signature)));
    expect(got).toBe(c.output);
  });

  test("PK.seed is Trunc_16(H(\"leanSPHINCS\" ‖ SK.seed ‖ 0x00))", () => {
    const c = readCase("key_gen", "key_gen_known_answer");
    expect(toHex(expandKey(fromHex(c.input.seed)).pkSeed)).toBe((c.output as string).slice(0, 34));
  });

  test("the known answer's digest fields", () => {
    const c = readCase("verify", "verify_valid_known_answer");
    const [ok, tr] = verifyTrace(fromHex(c.input.public_key), fromHex(c.input.message), fromHex(c.input.signature));
    expect(ok).toBe(true);
    expect(tr.digest.length).toBe(34);
    expect(tr.idx).toBeLessThan(2 ** 26);
    expect(tr.leaves.every((s) => s < 1024)).toBe(true);
    expect(tr.roots.length).toBe(3);
    expect(toHex(tr.roots[2]!)).toBe("0x" + c.input.public_key.slice(34));
  });
});

describe("round trips", () => {
  const seed = fromHex("0x" + "42".repeat(32));
  const signer = Signer.fromSeed(seed);
  const pk = signer.publicKey();
  const msgs = [new Uint8Array(32), new Uint8Array(32).fill(0xff), fromHex("0x" + "07".repeat(32))];
  const sigs = msgs.map((m) => signer.sign(m));

  test("key words", () => {
    const k = keygen(seed);
    expect(toHex(k.publicKey)).toBe(toHex(pk));
    expect(k.pkSeed).toBe(toHex(pk.subarray(0, 16)) + "0".repeat(32));
    expect(k.pkRoot).toBe(toHex(pk.subarray(16)) + "0".repeat(32));
    expect(toHex(signer.pp)).toBe(toHex(signer.pkSeed));
  }, SLOW);

  test("sign then verify", () => {
    msgs.forEach((m, i) => {
      expect(sigs[i].length).toBe(SIG_SIZE);
      expect(verify(pk, m, sigs[i])).toBe(true);
      // A signature signs its own message only.
      expect(verify(pk, msgs[(i + 1) % msgs.length], sigs[i])).toBe(false);
    });
  });

  test("deterministic, and the Signer agrees with sign(seed, msg)", () => {
    expect(toHex(signer.sign(msgs[0]))).toBe(toHex(sigs[0]));
    let reports = 0;
    let last = [0, 0];
    const s = sign(seed, msgs[2], {
      onProgress: (done, total) => {
        reports++;
        last = [done, total];
      },
    });
    expect(toHex(s)).toBe(toHex(sigs[2]));
    expect(reports).toBeGreaterThan(10);
    expect(last[0]).toBe(last[1]);
  }, SLOW);

  test("any flipped bit fails", () => {
    const sig = sigs[2];
    // A byte in each field: randomizer, FORS secret and path, then per layer counter, chain
    // value and sibling, and the last byte.
    const offsets = [0, 15, 16, 32, 4239, 4240, 4243, 4244, 5300, 5396, 5399, 5500, 6500, 6552, 6555, 6600, 7600, 7739];
    for (const o of offsets) {
      const bad = sig.slice();
      bad[o] ^= 0x01;
      expect(verify(pk, msgs[2], bad), `offset ${o}`).toBe(false);
    }
    for (const o of [0, 15, 16, 31]) {
      const badPk = pk.slice();
      badPk[o] ^= 0x80;
      expect(verify(badPk, msgs[2], sig), `key byte ${o}`).toBe(false);
    }
  });

  test("bad lengths throw", () => {
    expect(() => verify(pk, msgs[0], sigs[0].subarray(1))).toThrow(RangeError);
    expect(() => verify(pk.subarray(1), msgs[0], sigs[0])).toThrow(RangeError);
    expect(() => verify(pk, msgs[0].subarray(1), sigs[0])).toThrow(RangeError);
    expect(() => signer.sign(new Uint8Array(31))).toThrow(RangeError);
    expect(() => keygen(new Uint8Array(33))).toThrow(RangeError);
  });

  test("abi encoding of the CLI's sign output", () => {
    const r = signWithKey(seed, msgs[1]);
    const enc = abiEncodeSignOutput(fromHex(r.pkSeed), fromHex(r.pkRoot), r.signature);
    expect(enc.length).toBe(32 * 4 + Math.ceil(SIG_SIZE / 32) * 32);
    expect(toHex(enc.subarray(0, 32))).toBe(r.pkSeed);
    expect(toHex(enc.subarray(32, 64))).toBe(r.pkRoot);
    expect(new DataView(enc.buffer).getUint32(64 + 28)).toBe(96);
    expect(new DataView(enc.buffer).getUint32(96 + 28)).toBe(SIG_SIZE);
    expect(toHex(enc.subarray(128, 128 + SIG_SIZE))).toBe(toHex(sigs[1]));
  }, SLOW);
});
