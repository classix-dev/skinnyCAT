// Times keygen and sign in this runtime: `npm run bench`.

import { Signer, keygen, sign } from "../src/index.js";

const seed = new Uint8Array(32).fill(0x42);
const msg = new Uint8Array(32).fill(0x07);

function time(label: string, fn: () => void, runs = 3): void {
  const ms: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t = performance.now();
    fn();
    ms.push(performance.now() - t);
  }
  console.log(`${label}: ${ms.map((x) => (x / 1000).toFixed(2)).join(" s, ")} s`);
}

time("keygen", () => keygen(seed));
time("sign (from the seed, top tree rebuilt)", () => sign(seed, msg));
const signer = Signer.fromSeed(seed);
time("Signer.sign (top tree cached)", () => signer.sign(msg));
