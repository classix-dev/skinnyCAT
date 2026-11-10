// Byte-for-byte checks against EthLib's vectors (the ethlib-check mode of
// script/vendor/leansphincs_layered_signer.py) and the repo's known-answer file.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { Signer, fromHex, keygen, schemeSeed, publicParamOf, sign, signWithKey, toHex, verify, verifyTrace } from "../src/index.js";

const fixture = (name: string) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`../../test/fixtures/${name}`, import.meta.url)), "utf8"));

const ethlib = fixture("leansphincs-layered-ethlib.json");
const kat = fixture("leansphincs-layered-keccak-kat.json");

/** The vectors' `null`: the input is rejected (Python's ValueError, a RangeError here). */
function call<T>(fn: () => T): T | null {
  try {
    return fn();
  } catch (e) {
    if (e instanceof RangeError) return null;
    throw e;
  }
}

const SLOW = 60_000;

describe("EthLib vectors (ethlib-check)", () => {
  test.each(ethlib.key_gen.map((c: any) => [c.name, c]))("key_gen %s", (_name, c: any) => {
    const got = call(() => toHex(keygen(fromHex(c.seed)).publicKey));
    expect(got).toBe(c.output === null ? null : c.output.toLowerCase());
  }, SLOW);

  test.each(ethlib.sign.map((c: any) => [c.name, c]))("sign %s", (_name, c: any) => {
    const got = call(() => toHex(sign(fromHex(c.seed), fromHex(c.message))));
    expect(got).toBe(c.output === null ? null : c.output.toLowerCase());
  }, SLOW);

  test.each(ethlib.verify.map((c: any) => [c.name, c]))("verify %s", (_name, c: any) => {
    const got = call(() => verify(fromHex(c.public_key), fromHex(c.message), fromHex(c.signature)));
    expect(got).toBe(c.output);
  });

  test("Lean known answer, with intermediate values", () => {
    const ka = ethlib.lean_known_answer;
    const s = fromHex(ka.scheme_seed);
    expect(toHex(schemeSeed(s))).toBe(ka.tagged_seed);
    const pk = fromHex(ka.public_key);
    expect(toHex(publicParamOf(s))).toBe(toHex(pk.subarray(16)));
    const m = fromHex(ka.message);
    const [ok, tr] = verifyTrace(pk, m, fromHex(ka.signature));
    expect(ok).toBe(true);
    expect(toHex(tr.digest)).toBe(ka.digest);
    expect(tr.idx).toBe(ka.idx);
    expect(tr.leaves).toEqual(ka.leaves);
    expect(toHex(tr.forsKey)).toBe(ka.fors_key);
    ["bottom", "middle", "top"].forEach((name, layer) => {
      expect(toHex(tr.roots[layer]!)).toBe(ka[`${name}_root`]);
      expect(tr.codewords[layer]).toEqual(ka[`${name}_codeword`]);
      expect(toHex(tr.otsLeaves[layer]!)).toBe(ka[`${name}_leaf`]);
    });
    // And the signer reproduces the pinned signature from the scheme seed.
    const signer = new Signer(s);
    expect(toHex(signer.sign(m))).toBe(ka.signature);
    expect(toHex(signer.publicKey())).toBe(ka.public_key);
  }, SLOW);
});

describe("known-answer file (leansphincs-layered-keccak-kat.json)", () => {
  test.each(kat.vectors.map((v: any) => [v.label, v]))("%s", (_label, v: any) => {
    const r = signWithKey(fromHex(v.seed), fromHex(v.message));
    expect(toHex(r.publicKey)).toBe(v.publicKey);
    expect(r.pkSeed).toBe(v.pkSeed);
    expect(r.pkRoot).toBe(v.pkRoot);
    expect(toHex(r.signature)).toBe(v.sig);
    expect(r.signature.length).toBe(kat.sig_len);
    const [ok, tr] = verifyTrace(r.publicKey, fromHex(v.message), r.signature);
    expect(ok).toBe(true);
    expect(tr.idx).toBe(v.idx);
    expect(tr.leaves).toEqual(v.fors_indices);
    expect(tr.counters).toEqual(v.counters);
  }, SLOW);
});
