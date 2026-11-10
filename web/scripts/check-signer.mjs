// Checks that a signer source matches src/generated/vectors.json: it gives each vector's outcome,
// and its public key has the layout the vectors use. e2e/run.sh runs this before building, to find
// out whether the working tree's signer and verifier agree.
//
//   node --experimental-strip-types scripts/check-signer.mjs [path/to/signer/src/index.ts]
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const path = resolve(process.argv[2] ?? new URL("../../signer/src/index.ts", import.meta.url).pathname);
const vectors = JSON.parse(readFileSync(new URL("../src/generated/vectors.json", import.meta.url), "utf8"));
const s = await import(pathToFileURL(path).href);

let bad = 0;
for (const v of vectors.verify) {
  let got;
  try {
    got = s.verify(s.fromHex(v.public_key), s.fromHex(v.message), s.fromHex(v.signature));
  } catch (e) {
    if (!(e instanceof RangeError)) throw e;
    got = null;
  }
  if (got !== v.output) {
    console.error(`${v.name}: signer says ${got}, vectors say ${v.output}`);
    bad++;
  }
}
const k = s.Signer.fromSeed(new Uint8Array(32).fill(7));
const pk = s.toHex(k.publicKey());
const want = vectors.pkLayout === "seed-root" ? s.toHex(new Uint8Array([...k.pp, ...k.root])) : s.toHex(new Uint8Array([...k.root, ...k.pp]));
if (pk !== want) {
  console.error(`public key layout isn't ${vectors.pkLayout}`);
  bad++;
}
if (bad) {
  console.error(`${path} doesn't match the vectors for ${vectors.verifier}`);
  process.exit(1);
}
console.log(`signer ${path} matches ${vectors.verifier}'s vectors`);
