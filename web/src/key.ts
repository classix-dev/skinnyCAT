// The leanSPHINCS secret is EthLib's 32-byte seed S_0. We back it up as 24 BIP-39 English words
// (the seed is the entropy, there is no PBKDF2 step) and keep it in localStorage.

import { entropyToMnemonic, mnemonicToEntropy, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { bytesToHex, hexToBytes, type Hex } from "viem";

const STORAGE_KEY = "pq-classix.leansphincs-seed.v1";

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

export function loadSeed(): Hex | null {
  const s = localStorage.getItem(STORAGE_KEY);
  return s && /^0x[0-9a-f]{64}$/.test(s) ? (s as Hex) : null;
}

export const saveSeed = (seed: Hex) => localStorage.setItem(STORAGE_KEY, seed);
export const forgetSeed = () => localStorage.removeItem(STORAGE_KEY);
