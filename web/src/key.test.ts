import { describe, expect, test } from "vitest";
import { forgetSeed, loadSeed, phraseToSeed, randomSeed, saveSeed, seedToPhrase } from "./key";

describe("backup phrase", () => {
  test("round-trips a seed through 24 words", () => {
    const s = randomSeed();
    const words = seedToPhrase(s).split(" ");
    expect(words).toHaveLength(24);
    expect(phraseToSeed(words.join("  ").toUpperCase())).toBe(s);
  });
  test("explains what's wrong", () => {
    expect(() => phraseToSeed("abandon ".repeat(12))).toThrow("The phrase has 12 words. It needs 24.");
    expect(() => phraseToSeed("abandon ".repeat(23) + "quantumx")).toThrow(/Not in the BIP-39 English list \(quantumx\)/);
    expect(() => phraseToSeed("abandon ".repeat(23) + "zoo")).toThrow(/checksum/);
  });
});

describe("storage", () => {
  test("keeps Alice and Bob apart", () => {
    const a = randomSeed();
    const b = randomSeed();
    saveSeed("alice", a);
    saveSeed("bob", b);
    expect(loadSeed("alice")).toBe(a);
    expect(loadSeed("bob")).toBe(b);
    forgetSeed("alice");
    expect(loadSeed("alice")).toBeNull();
    expect(loadSeed("bob")).toBe(b);
  });
  test("ignores junk", () => {
    localStorage.setItem("pq-classix.bob.leansphincs-seed.v1", "0x1234");
    expect(loadSeed("bob")).toBeNull();
  });
  test("moves the first version's single key to Alice", () => {
    const s = randomSeed();
    localStorage.setItem("pq-classix.leansphincs-seed.v1", s);
    expect(loadSeed("bob")).toBeNull();
    expect(loadSeed("alice")).toBe(s);
    expect(localStorage.getItem("pq-classix.leansphincs-seed.v1")).toBeNull();
    expect(loadSeed("alice")).toBe(s);
  });
});
