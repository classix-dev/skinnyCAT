/// <reference lib="webworker" />
// leanSPHINCS in a Web Worker, so key generation and signing don't freeze the page.
// Keeps a Signer per seed (Alice's and Bob's), each caching its top tree between calls.

import { Signer, fromHex, toHex, verify } from "pq-signer";
import type { WorkerRequest, WorkerResponse } from "./signer-client";

const cache = new Map<string, Signer>();
const KEEP = 2;

function post(msg: WorkerResponse) {
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(msg);
}

function signerFor(seedHex: string, id: number, phase: "keygen" | "sign"): Signer {
  const hit = cache.get(seedHex);
  if (hit) {
    cache.delete(seedHex);
    cache.set(seedHex, hit); // most recent last
    return hit;
  }
  const signer = Signer.fromSeed(fromHex(seedHex), (done, total) => post({ id, kind: "progress", phase, done, total }));
  cache.set(seedHex, signer);
  while (cache.size > KEEP) cache.delete(cache.keys().next().value!);
  return signer;
}

const pad = new Uint8Array(16);
const word = (b: Uint8Array) => toHex(new Uint8Array([...b, ...pad]));
const keyWords = (s: Signer) => ({ publicKey: toHex(s.publicKey()), pkSeed: word(s.pp), pkRoot: word(s.root) });

self.onmessage = (ev: MessageEvent<WorkerRequest>) => {
  const req = ev.data;
  try {
    switch (req.kind) {
      case "keygen": {
        post({ id: req.id, kind: "result", value: keyWords(signerFor(req.seed, req.id, "keygen")) });
        break;
      }
      case "sign": {
        const fresh = !cache.has(req.seed);
        const s = signerFor(req.seed, req.id, "keygen");
        const t0 = performance.now();
        const sig = s.sign(fromHex(req.message), (done, total) => post({ id: req.id, kind: "progress", phase: "sign", done, total }));
        post({ id: req.id, kind: "result", value: { signature: toHex(sig), ms: performance.now() - t0, fresh } });
        break;
      }
      case "verify": {
        let ok: boolean | null;
        try {
          ok = verify(fromHex(req.publicKey), fromHex(req.message), fromHex(req.signature));
        } catch (e) {
          if (!(e instanceof RangeError)) throw e;
          ok = null; // rejected input, the vectors' null
        }
        post({ id: req.id, kind: "result", value: ok });
        break;
      }
    }
  } catch (e) {
    post({ id: req.id, kind: "error", message: e instanceof Error ? e.message : String(e) });
  }
};
