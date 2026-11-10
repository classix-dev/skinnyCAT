// A leanSPHINCS secret is EthLib's 32-byte SK.seed. We back it up as 24 BIP-39 English words
// (the seed is the entropy, there is no PBKDF2 step) and keep it in localStorage, one per person.

import { entropyToMnemonic, mnemonicToEntropy, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { bytesToHex, hexToBytes, type Hex } from "viem";

export type Who = "alice" | "bob";
export const WHO: Who[] = ["alice", "bob"];
export const NAMES: Record<Who, string> = { alice: "Alice", bob: "Bob" };

const storageKey = (who: Who) => `pq-classix.${who}.leansphincs-seed.v1`;
/** The single key of the first version of the page becomes Alice's. */
const LEGACY_KEY = "pq-classix.leansphincs-seed.v1";

export function randomSeed(): Hex {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return bytesToHex(b);
}

export const seedToPhrase = (seed: Hex) => entropyToMnemonic(hexToBytes(seed), wordlist);

/** Throws with a readable message if the phrase isn't 24 valid words with a good checksum. */
export function phraseToSeed(phrase: string): Hex {
  const words = phrase.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length !== 24) throw new Error(`The phrase has ${words.length} words. It needs 24.`);
  const bad = words.filter((w) => !wordlist.includes(w));
  if (bad.length) throw new Error(`Not in the BIP-39 English list (${bad.slice(0, 3).join(", ")}).`);
  const norm = words.join(" ");
  if (!validateMnemonic(norm, wordlist)) throw new Error("The checksum doesn't match. Check the word order.");
  return bytesToHex(mnemonicToEntropy(norm, wordlist));
}

const valid = (s: string | null): s is Hex => !!s && /^0x[0-9a-f]{64}$/.test(s);

export function loadSeed(who: Who): Hex | null {
  const s = localStorage.getItem(storageKey(who));
  if (valid(s)) return s;
  if (who === "alice") {
    const old = localStorage.getItem(LEGACY_KEY);
    if (valid(old)) {
      localStorage.setItem(storageKey(who), old);
      localStorage.removeItem(LEGACY_KEY);
      return old;
    }
  }
  return null;
}

export const saveSeed = (who: Who, seed: Hex) => localStorage.setItem(storageKey(who), seed);
export const forgetSeed = (who: Who) => localStorage.removeItem(storageKey(who));
