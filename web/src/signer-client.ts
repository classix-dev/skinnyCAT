// The page's side of the signing worker.

import type { Hex } from "viem";

export type WorkerRequest =
  | { id: number; kind: "keygen"; seed: Hex }
  | { id: number; kind: "sign"; seed: Hex; message: Hex }
  | { id: number; kind: "verify"; publicKey: Hex; message: Hex; signature: Hex };

export type WorkerResponse =
  | { id: number; kind: "progress"; phase: "keygen" | "sign"; done: number; total: number }
  | { id: number; kind: "result"; value: unknown }
  | { id: number; kind: "error"; message: string };

export interface PublicKeyInfo {
  /** root ‖ P, 32 bytes */
  publicKey: Hex;
  /** P ‖ 0^16 */
  pkSeed: Hex;
  /** root ‖ 0^16 */
  pkRoot: Hex;
}

export type Progress = (phase: "keygen" | "sign", done: number, total: number) => void;

const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
let nextId = 1;
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void; onProgress?: Progress }>();

worker.onmessage = (ev: MessageEvent<WorkerResponse>) => {
  const m = ev.data;
  const p = pending.get(m.id);
  if (!p) return;
  if (m.kind === "progress") p.onProgress?.(m.phase, m.done, m.total);
  else {
    pending.delete(m.id);
    if (m.kind === "result") p.resolve(m.value);
    else p.reject(new Error(m.message));
  }
};
worker.onerror = (ev) => {
  for (const p of pending.values()) p.reject(new Error(`signing worker failed: ${ev.message}`));
  pending.clear();
};

// Distributive Omit, so each request variant keeps its own fields.
type RequestBody = WorkerRequest extends infer R ? (R extends WorkerRequest ? Omit<R, "id"> : never) : never;

function call<T>(req: RequestBody, onProgress?: Progress): Promise<T> {
  const id = nextId++;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject, onProgress });
    worker.postMessage({ ...req, id } as WorkerRequest);
  });
}

export const keygen = (seed: Hex, onProgress?: Progress) => call<PublicKeyInfo>({ kind: "keygen", seed }, onProgress);

export const sign = (seed: Hex, message: Hex, onProgress?: Progress) =>
  call<{ signature: Hex; ms: number; fresh: boolean }>({ kind: "sign", seed, message }, onProgress);

/** true, false, or null when the input is malformed (wrong lengths). */
export const verifyLocal = (publicKey: Hex, message: Hex, signature: Hex) =>
  call<boolean | null>({ kind: "verify", publicKey, message, signature });
