// The signature every scene draws from. It opens on a real signature made ahead of time by the
// signer (data/fixture.json, see scripts/viz-fixture.mjs) and is replaced when the reader signs
// their own message in the worker.
import { keccak_256 } from "@noble/hashes/sha3.js";
import { useSyncExternalStore } from "react";
import fixture from "./data/fixture.json";
import { explain, fromHex, type Explained } from "./data/explain";
import type { SignRequest, SignResponse } from "./sign.worker";

export interface Sample {
  text: string;
  ex: Explained;
  /** Milliseconds the browser took to sign, when the reader signed it here. */
  ms?: number;
}

let current: Sample | null = null;
const listeners = new Set<() => void>();

function get(): Sample {
  current ??= {
    text: fixture.text,
    ex: explain(fromHex(fixture.publicKey), fromHex(fixture.message), fromHex(fixture.signature)),
  };
  return current;
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export const useSample = (): Sample => useSyncExternalStore(subscribe, get, get);

function set(s: Sample) {
  current = s;
  for (const l of listeners) l();
}

export const messageOf = (text: string) => keccak_256(new TextEncoder().encode(text));

let worker: Worker | null = null;
let nextId = 1;

/** Signs keccak256(text) with the demo key in a worker and makes it the current sample. */
export function signText(text: string, onProgress: (fraction: number) => void): Promise<Sample> {
  worker ??= new Worker(new URL("./sign.worker.ts", import.meta.url), { type: "module", name: "viz-signer" });
  const w = worker;
  const id = nextId++;
  const message = messageOf(text);
  return new Promise((resolve, reject) => {
    const onMessage = (ev: MessageEvent<SignResponse>) => {
      const r = ev.data;
      if (r.id !== id) return;
      if (r.kind === "progress") return onProgress(r.done / r.total);
      w.removeEventListener("message", onMessage);
      if (r.kind === "error") return reject(new Error(r.message));
      const s: Sample = { text, ex: explain(r.publicKey, message, r.signature), ms: r.ms };
      if (!s.ex.valid) return reject(new Error("the signature did not verify"));
      set(s);
      resolve(s);
    };
    w.addEventListener("message", onMessage);
    w.postMessage({ id, message } satisfies SignRequest);
  });
}
