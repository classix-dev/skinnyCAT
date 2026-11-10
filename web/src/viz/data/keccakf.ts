// Keccak-256 with Ethereum's padding, written out so the explainer can show the 1,600-bit state
// after each of the 24 rounds of Keccak-f[1600]. Only for one-block inputs (up to 135 bytes).
// keccakf.test.ts checks the output against @noble/hashes.

const RC = [
  0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n,
  0x000000000000808bn, 0x0000000080000001n, 0x8000000080008081n, 0x8000000000008009n,
  0x000000000000008an, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
  0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n,
  0x8000000000008002n, 0x8000000000000080n, 0x000000000000800an, 0x800000008000000an,
  0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n,
];
// Rotation offsets, lane x + 5y.
const ROT = [0, 1, 62, 28, 27, 36, 44, 6, 55, 20, 3, 10, 43, 25, 39, 41, 45, 15, 21, 8, 18, 2, 61, 56, 14];
const MASK = (1n << 64n) - 1n;
const rotl = (v: bigint, r: number) => (r === 0 ? v : ((v << BigInt(r)) | (v >> BigInt(64 - r))) & MASK);

export const KECCAK_BLOCK = 136;
export const MAX_ONE_BLOCK = KECCAK_BLOCK - 1;

function round(a: bigint[], i: number): bigint[] {
  const c = Array.from({ length: 5 }, (_, x) => a[x] ^ a[x + 5] ^ a[x + 10] ^ a[x + 15] ^ a[x + 20]);
  const d = Array.from({ length: 5 }, (_, x) => c[(x + 4) % 5] ^ rotl(c[(x + 1) % 5], 1));
  const t = a.map((v, k) => v ^ d[k % 5]);
  const b = new Array<bigint>(25);
  for (let x = 0; x < 5; x++)
    for (let y = 0; y < 5; y++) b[y + 5 * ((2 * x + 3 * y) % 5)] = rotl(t[x + 5 * y], ROT[x + 5 * y]);
  const out = new Array<bigint>(25);
  for (let x = 0; x < 5; x++)
    for (let y = 0; y < 5; y++)
      out[x + 5 * y] = b[x + 5 * y] ^ (~b[((x + 1) % 5) + 5 * y] & MASK & b[((x + 2) % 5) + 5 * y]);
  out[0] ^= RC[i];
  return out;
}

function toBytes(a: bigint[]): Uint8Array {
  const out = new Uint8Array(200);
  for (let k = 0; k < 25; k++) for (let j = 0; j < 8; j++) out[8 * k + j] = Number((a[k] >> BigInt(8 * j)) & 0xffn);
  return out;
}

/**
 * The 200-byte state after absorbing the padded block (index 0) and after each round (1..24).
 * The digest is the first 32 bytes of the last state.
 */
export function keccakRounds(input: Uint8Array): Uint8Array[] {
  if (input.length > MAX_ONE_BLOCK) throw new RangeError("one block only");
  const block = new Uint8Array(200);
  block.set(input);
  block[input.length] ^= 0x01;
  block[KECCAK_BLOCK - 1] ^= 0x80;
  let a = Array.from({ length: 25 }, (_, k) => {
    let v = 0n;
    for (let j = 7; j >= 0; j--) v = (v << 8n) | BigInt(block[8 * k + j]);
    return v;
  });
  const states = [toBytes(a)];
  for (let i = 0; i < 24; i++) {
    a = round(a, i);
    states.push(toBytes(a));
  }
  return states;
}

/** Keeps a string's UTF-8 bytes within one block, cutting whole characters. */
export function clampText(s: string): string {
  const enc = new TextEncoder();
  let out = "";
  for (const ch of s) {
    if (enc.encode(out + ch).length > MAX_ONE_BLOCK) break;
    out += ch;
  }
  return out;
}
