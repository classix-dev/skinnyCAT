// The explainer's numbers against the real signer (../../../signer/src/index.ts).
import { keccak_256 } from "@noble/hashes/sha3.js";
import { describe, expect, it } from "vitest";
import { SIG_SIZE as SIGNER_SIG_SIZE, signWithKey, verifyTrace } from "../../../signer/src/index.ts";
import { DEFAULT_TEXT, DEMO_SEED_TEXT } from "./data/constants";
import {
  CHAINS, FORS_HEIGHT, FORS_TREES, LAYER_HEIGHTS, SIG_SIZE, TARGET_SUM, counterSums, encode, explain, fromHex,
  keyOf, signatureGroups, signatureSections, toDigits, toHex,
} from "./data/explain";
import fixture from "./data/fixture.json";
import { keccakRounds } from "./data/keccakf";

const enc = new TextEncoder();
const pk = fromHex(fixture.publicKey);
const msg = fromHex(fixture.message);
const sig = fromHex(fixture.signature);

function sameAsSigner(publicKey: Uint8Array, m: Uint8Array, s: Uint8Array) {
  const [ok, trace] = verifyTrace(publicKey, m, s);
  const ex = explain(publicKey, m, s);
  expect(ex.valid).toBe(ok);
  expect(toHex(ex.digest)).toBe(toHex(trace.digest));
  expect(ex.idx).toBe(trace.idx);
  expect(ex.leaves).toEqual(trace.leaves);
  expect(toHex(ex.forsPk)).toBe(toHex(trace.forsPk));
  trace.roots.forEach((r, l) => expect(ex.layers[l].root && toHex(ex.layers[l].root!)).toBe(r && toHex(r)));
  return ex;
}

describe("fixture", () => {
  it("is the demo key's signature of the default text", () => {
    expect(fixture.text).toBe(DEFAULT_TEXT);
    expect(toHex(msg)).toBe(toHex(keccak_256(enc.encode(DEFAULT_TEXT))));
    expect(sig.length).toBe(7740);
    expect(DEMO_SEED_TEXT.length).toBeGreaterThan(0);
  });

  it("explains to the signer's own trace", () => {
    const ex = sameAsSigner(pk, msg, sig);
    expect(ex.valid).toBe(true);
    expect(ex.failure).toBeNull();
  });
});

describe("verification cost", () => {
  it("is 491 Keccak calls and 515 permutations, split by stage", () => {
    const ex = explain(pk, msg, sig);
    expect(ex.calls).toBe(491);
    expect(ex.perms).toBe(515);
    expect(ex.stages.map((s) => s.calls)).toEqual([2, 24 * 11 + 1, 1 + 64 + 1 + 8, 1 + 64 + 1 + 8, 1 + 64 + 1 + 10]);
    // T_k reads 432 bytes (4 blocks) and each WOTS_PK 1,072 bytes (8 blocks).
    expect(ex.stages.map((s) => s.perms)).toEqual([2, 264 + 4, 73 + 8, 73 + 8, 75 + 8]);
  });
});

describe("WOTS+C", () => {
  const ex = explain(pk, msg, sig);

  it("every layer's digits sum to exactly 128 and the chains walk 64 steps", () => {
    for (const l of ex.layers) {
      expect(l.digits).toHaveLength(CHAINS);
      expect(l.sum).toBe(TARGET_SUM);
      expect(l.digits.reduce((a, b) => a + b, 0)).toBe(128);
      expect(l.digits.every((d) => d >= 0 && d <= 3)).toBe(true);
      expect(l.digits.reduce((a, d) => a + (3 - d), 0)).toBe(64);
    }
  });

  it("the counter is the first one that reaches 128, as the signer searches", () => {
    for (const l of ex.layers) {
      const sums = counterSums(ex.pkSeed, keyOf(l.layer, ex.idx), l.signed, l.counter);
      expect(sums[l.counter]).toBe(128);
      expect(sums.subarray(0, l.counter).includes(128)).toBe(false);
      // Spot-check the fast path against encode.
      for (const c of [0, 1, l.counter >> 1]) expect(sums[c]).toBe(encode(ex.pkSeed, keyOf(l.layer, ex.idx), l.signed, c).sum);
    }
  });

  it("each layer signs the value below it", () => {
    expect(toHex(ex.layers[0].signed)).toBe(toHex(ex.forsPk));
    expect(toHex(ex.layers[1].signed)).toBe(toHex(ex.layers[0].root!));
    expect(toHex(ex.layers[2].signed)).toBe(toHex(ex.layers[1].root!));
    expect(toHex(ex.layers[2].root!)).toBe(toHex(ex.pkRoot));
  });

  it("digits read the top two bits first", () => {
    expect(toDigits(new Uint8Array([0b11_10_01_00, ...new Array(15).fill(0)])).slice(0, 4)).toEqual([3, 2, 1, 0]);
  });
});

describe("index and FORS picks", () => {
  const ex = explain(pk, msg, sig);

  it("the 26-bit index splits into the three layers' leaves", () => {
    expect(ex.idx).toBeLessThan(2 ** 26);
    const [b, m, t] = [0, 1, 2].map((l) => keyOf(l, ex.idx));
    expect(b.leaf).toBe(ex.idx & 255);
    expect(b.tree).toBe(ex.idx >>> 8);
    expect(m.leaf).toBe((ex.idx >>> 8) & 255);
    expect(m.tree).toBe(ex.idx >>> 16);
    expect(t.tree).toBe(0);
    expect(t.leaf).toBe(ex.idx >>> 16);
  });

  it("24 picks of 10 bits each, read from the first 30 digest bytes", () => {
    expect(ex.leaves).toHaveLength(FORS_TREES);
    let bits = "";
    for (const byte of ex.digest.subarray(0, 30)) bits += byte.toString(2).padStart(8, "0");
    expect(ex.leaves).toEqual(Array.from({ length: 24 }, (_, k) => parseInt(bits.slice(10 * k, 10 * k + 10), 2)));
    for (const f of ex.fors) expect(f.nodes).toHaveLength(FORS_HEIGHT + 1);
  });
});

describe("byte layout", () => {
  it("adds up to 7,740 bytes with no gaps", () => {
    const s = signatureSections();
    let o = 0;
    for (const x of s) {
      expect(x.offset).toBe(o);
      o += x.length;
    }
    expect(o).toBe(SIG_SIZE);
    expect(SIG_SIZE).toBe(SIGNER_SIG_SIZE);
  });

  it("has the documented groups", () => {
    expect(signatureGroups().map((g) => [g.group, g.offset, g.length])).toEqual([
      ["randomizer", 0, 16],
      ["fors", 16, 4224],
      ["bottom", 4240, 1156],
      ["middle", 5396, 1156],
      ["top", 6552, 1188],
    ]);
    expect(LAYER_HEIGHTS).toEqual([8, 8, 10]);
  });
});

describe("a fresh signature and tampering", () => {
  it("explains a new signature from the real signer, and rejects a flipped bit", () => {
    const seed = keccak_256(enc.encode(DEMO_SEED_TEXT));
    const m = keccak_256(enc.encode("a second message"));
    const { publicKey, signature } = signWithKey(seed, m);
    expect(toHex(publicKey)).toBe(fixture.publicKey);
    expect(sameAsSigner(publicKey, m, signature).valid).toBe(true);

    for (const at of [3, 100, 4300, 5000, 6600, 7739]) {
      const bad = signature.slice();
      bad[at] ^= 0x10;
      const ex = sameAsSigner(publicKey, m, bad);
      expect(ex.valid).toBe(false);
      expect(ex.failure).toMatch(/sum to|doesn't match/);
    }
  }, 60_000);
});

describe("Keccak-f rounds", () => {
  it("ends in the same digest as @noble/hashes", () => {
    for (const s of ["", "a", DEFAULT_TEXT, "x".repeat(135), "ünïcødé ✓"]) {
      const b = enc.encode(s);
      const states = keccakRounds(b);
      expect(states).toHaveLength(25);
      expect(toHex(states[24].subarray(0, 32))).toBe(toHex(keccak_256(b)));
    }
  });
});
