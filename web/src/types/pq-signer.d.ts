// The part of the signer's API (../signer/src/index.ts) the worker uses. Vite resolves "pq-signer"
// to the source (vite.config.ts). Declared here so the web typecheck doesn't depend on the signer's
// internals, which have their own tsconfig and tests.
declare module "pq-signer" {
  export type ProgressCallback = (done: number, total: number) => void;
  export class Signer {
    static fromSeed(seed: Uint8Array, onProgress?: ProgressCallback): Signer;
    /** PK.seed, 16 bytes. */
    readonly pp: Uint8Array;
    /** PK.root, 16 bytes. */
    readonly root: Uint8Array;
    /** The encoded 32-byte public key. */
    publicKey(): Uint8Array;
    sign(msg: Uint8Array, onProgress?: ProgressCallback): Uint8Array;
  }
  /** Throws RangeError on inputs of the wrong length. */
  export function verify(publicKey: Uint8Array, msg: Uint8Array, sig: Uint8Array): boolean;
  export function fromHex(s: string): Uint8Array;
  export function toHex(b: Uint8Array): `0x${string}`;
}
