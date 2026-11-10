/// <reference lib="webworker" />
// Signs with the real signer and the public demo key, off the main thread. The first signature
// builds the top tree (keyGen), later ones reuse it and take about half as long.
import { keccak_256 } from "@noble/hashes/sha3.js";
import { Signer } from "../../../signer/src/index.ts";
import { DEMO_SEED_TEXT } from "./data/constants";

export type SignRequest = { id: number; message: Uint8Array };
export type SignResponse =
  | { id: number; kind: "progress"; done: number; total: number }
  | { id: number; kind: "result"; publicKey: Uint8Array; signature: Uint8Array; ms: number }
  | { id: number; kind: "error"; message: string };

const scope = self as unknown as DedicatedWorkerGlobalScope;
let signer: Signer | null = null;
// keyGen is about 265,000 Keccak calls and a signature about 275,000 after it.
const KEYGEN = 265_000;
const SIGN = 275_000;

scope.onmessage = (ev: MessageEvent<SignRequest>) => {
  const { id, message } = ev.data;
  const post = (m: SignResponse) => scope.postMessage(m);
  try {
    const t0 = performance.now();
    const fresh = !signer;
    const total = (fresh ? KEYGEN : 0) + SIGN;
    signer ??= new Signer(keccak_256(new TextEncoder().encode(DEMO_SEED_TEXT)), (done, all) =>
      post({ id, kind: "progress", done: (done / all) * KEYGEN, total }),
    );
    const base = fresh ? KEYGEN : 0;
    const signature = signer.sign(message, (done, all) => post({ id, kind: "progress", done: base + (done / all) * SIGN, total }));
    post({ id, kind: "result", publicKey: signer.publicKey(), signature, ms: performance.now() - t0 });
  } catch (e) {
    post({ id, kind: "error", message: e instanceof Error ? e.message : String(e) });
  }
};
