// Writes src/viz/data/fixture.json, the real leanSPHINCS signature the explainer opens with.
//
//   cd web && ../signer/node_modules/.bin/tsx scripts/viz-fixture.mjs
//
// The key is a public demo key, SK.seed = keccak256("hypertree explainer demo key"), so anyone can
// reproduce the fixture. The message is keccak256 of the UTF-8 text.
import { keccak_256 } from "@noble/hashes/sha3.js";
import { writeFileSync } from "node:fs";
import { signWithKey, toHex, verify } from "../../signer/src/index.ts";
import { DEFAULT_TEXT, DEMO_SEED_TEXT } from "../src/viz/data/constants.ts";

const enc = new TextEncoder();
const seed = keccak_256(enc.encode(DEMO_SEED_TEXT));
const msg = keccak_256(enc.encode(DEFAULT_TEXT));
const t0 = performance.now();
const { publicKey, signature } = signWithKey(seed, msg);
const ms = performance.now() - t0;
if (!verify(publicKey, msg, signature)) throw new Error("fixture does not verify");
const out = { text: DEFAULT_TEXT, message: toHex(msg), publicKey: toHex(publicKey), signature: toHex(signature) };
writeFileSync(new URL("../src/viz/data/fixture.json", import.meta.url), JSON.stringify(out, null, 1) + "\n");
console.log(`signed in ${ms.toFixed(0)} ms, ${signature.length} bytes`);
