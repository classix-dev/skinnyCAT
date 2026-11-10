// Recomputes a leanSPHINCS verification step by step and keeps every intermediate value, so the
// explainer can draw real digits, real FORS picks and real tree nodes. It follows the signer in
// ../../../../signer/src/index.ts (EthLib dce7a2d, FIPS 205 layout) line for line, and
// explain.test.ts checks it against that signer. Only verification lives here, no secret keys.

import { keccak_256 } from "@noble/hashes/sha3.js";

export const N = 16;
export const CHAINS = 64;
export const CHAIN_LEN = 4; // positions 0..3
export const TARGET_SUM = 128;
export const FORS_TREES = 24;
export const FORS_HEIGHT = 10;
export const LAYER_HEIGHTS = [8, 8, 10] as const; // bottom, middle, top
export const SIG_SIZE = 7740;
export const PK_SIZE = 32;
export const ECDSA_SIG_SIZE = 65;
/** Keccak-256 absorbs 136 bytes per Keccak-f[1600] permutation. */
export const KECCAK_RATE = 136;

const ADRS_LEN = 32;
const PREFIX = N + ADRS_LEN; // 48
const LAYER_BELOW = [0, 8, 16];
const T = { WOTS_HASH: 0, WOTS_PK: 1, TREE: 2, FORS_TREE: 3, FORS_ROOTS: 4, WOTS_ENC: 7 } as const;

// ---------------------------------------------------------------------------
// Byte layout (Serialization.lean)
// ---------------------------------------------------------------------------

export type Group = "randomizer" | "fors" | "bottom" | "middle" | "top";
export type Part = "randomizer" | "secret" | "path" | "counter" | "chains" | "auth";

export interface Section {
  group: Group;
  part: Part;
  offset: number;
  length: number;
  /** The FORS tree, for FORS parts. */
  tree?: number;
}

const layerSize = (h: number) => 4 + CHAINS * N + h * N;

/** Every field of the 7,740-byte signature in order, contiguous. */
export function signatureSections(): Section[] {
  const out: Section[] = [{ group: "randomizer", part: "randomizer", offset: 0, length: N }];
  let o = N;
  for (let k = 0; k < FORS_TREES; k++) {
    out.push({ group: "fors", part: "secret", offset: o, length: N, tree: k });
    out.push({ group: "fors", part: "path", offset: o + N, length: FORS_HEIGHT * N, tree: k });
    o += N + FORS_HEIGHT * N;
  }
  (["bottom", "middle", "top"] as const).forEach((g, l) => {
    const h = LAYER_HEIGHTS[l];
    out.push({ group: g, part: "counter", offset: o, length: 4 });
    out.push({ group: g, part: "chains", offset: o + 4, length: CHAINS * N });
    out.push({ group: g, part: "auth", offset: o + 4 + CHAINS * N, length: h * N });
    o += layerSize(h);
  });
  return out;
}

/** The five top-level groups with their offsets and sizes. */
export function signatureGroups(): { group: Group; offset: number; length: number }[] {
  const groups: { group: Group; offset: number; length: number }[] = [];
  for (const s of signatureSections()) {
    const last = groups[groups.length - 1];
    if (last && last.group === s.group) last.length += s.length;
    else groups.push({ group: s.group, offset: s.offset, length: s.length });
  }
  return groups;
}

// ---------------------------------------------------------------------------
// Hashing with a call counter
// ---------------------------------------------------------------------------

export interface HashCount {
  calls: number;
  /** Keccak-f[1600] permutations, one per started 136-byte block after padding. */
  perms: number;
}

const permsFor = (len: number) => Math.floor(len / KECCAK_RATE) + 1;

function writeAdrs(buf: Uint8Array, off: number, a: readonly number[]) {
  const dv = new DataView(buf.buffer, buf.byteOffset + off, ADRS_LEN);
  dv.setUint32(0, a[0]);
  dv.setUint32(4, 0);
  dv.setUint32(8, 0);
  dv.setUint32(12, a[1]);
  dv.setUint32(16, a[2]);
  dv.setUint32(20, a[3]);
  dv.setUint32(24, a[4]);
  dv.setUint32(28, a[5]);
}

function makeTh(count: HashCount, pkSeed: Uint8Array) {
  return (a: readonly number[], payload: Uint8Array): Uint8Array => {
    const buf = new Uint8Array(PREFIX + payload.length);
    buf.set(pkSeed, 0);
    writeAdrs(buf, N, a);
    buf.set(payload, PREFIX);
    count.calls++;
    count.perms += permsFor(buf.length);
    return keccak_256(buf).slice(0, N);
  };
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

const be32 = (c: number) => new Uint8Array([c >>> 24, c >>> 16, c >>> 8, c]);

// ---------------------------------------------------------------------------
// Index and digest (Digest.lean)
// ---------------------------------------------------------------------------

export interface KeyPos {
  layer: number;
  tree: number;
  leaf: number;
}

/** OtsKey.ofIndex: which tree and leaf of `layer` the 26-bit index runs through. */
export function keyOf(layer: number, idx: number): KeyPos {
  const below = LAYER_BELOW[layer];
  const h = LAYER_HEIGHTS[layer];
  return { layer, tree: idx >>> (below + h), leaf: (idx >>> below) & ((1 << h) - 1) };
}

function msbField(d: Uint8Array, offset: number, width: number): number {
  let v = 0;
  for (let b = 0; b < width; b++) {
    const p = offset + b;
    v = 2 * v + ((d[p >> 3] >> (7 - (p & 7))) & 1);
  }
  return v;
}

/** The 24 FORS leaves, 10 bits each from the first 30 digest bytes, most significant bit first. */
export const digestLeaves = (d: Uint8Array) =>
  Array.from({ length: FORS_TREES }, (_, k) => msbField(d, FORS_HEIGHT * k, FORS_HEIGHT));

/** idx = tree * 2^8 + leaf, tree = BE(d[30..33]) mod 2^18, leaf = d[33]. */
export function digestIndex(d: Uint8Array): number {
  const tree = ((d[30] << 16) | (d[31] << 8) | d[32]) & ((1 << 18) - 1);
  return tree * 256 + d[33];
}

// ---------------------------------------------------------------------------
// WOTS+C (Encoding.lean, Ots.lean)
// ---------------------------------------------------------------------------

/** base_2b with b = 2: digit i is bits 6 - 2(i mod 4) of byte i / 4. */
export const toDigits = (e: Uint8Array) => Array.from({ length: CHAINS }, (_, i) => (e[i >> 2] >> (6 - 2 * (i & 3))) & 3);

const BYTE_SUM = Uint8Array.from({ length: 256 }, (_, b) => (b >> 6) + ((b >> 4) & 3) + ((b >> 2) & 3) + (b & 3));

/** The 16-byte encoding Th(PK.seed, ADRS_enc(K), msg ‖ BE32(counter)) and its digits. */
export function encode(pkSeed: Uint8Array, key: KeyPos, msg: Uint8Array, counter: number, count?: HashCount) {
  const th = makeTh(count ?? { calls: 0, perms: 0 }, pkSeed);
  const encoding = th([key.layer, key.tree, T.WOTS_ENC, key.leaf, 0, 0], concat(msg, be32(counter)));
  const digits = toDigits(encoding);
  return { encoding, digits, sum: digits.reduce((a, b) => a + b, 0) };
}

/** The digit sum for every counter 0..upTo, what the signer saw while it searched. */
export function counterSums(pkSeed: Uint8Array, key: KeyPos, msg: Uint8Array, upTo: number): Uint8Array {
  const buf = new Uint8Array(PREFIX + N + 4);
  buf.set(pkSeed, 0);
  writeAdrs(buf, N, [key.layer, key.tree, T.WOTS_ENC, key.leaf, 0, 0]);
  buf.set(msg, PREFIX);
  const at = PREFIX + N;
  const out = new Uint8Array(upTo + 1);
  for (let c = 0; c <= upTo; c++) {
    buf[at] = c >>> 24;
    buf[at + 1] = c >>> 16;
    buf[at + 2] = c >>> 8;
    buf[at + 3] = c;
    const h = keccak_256(buf);
    let s = 0;
    for (let j = 0; j < N; j++) s += BYTE_SUM[h[j]];
    out[c] = s;
  }
  return out;
}

/** The values of chain i from position `start` up to the end at position 3, `start` first. */
export function chainWalk(pkSeed: Uint8Array, key: KeyPos, i: number, start: number, value: Uint8Array, count?: HashCount) {
  const th = makeTh(count ?? { calls: 0, perms: 0 }, pkSeed);
  const out = [value];
  for (let mu = start; mu < CHAIN_LEN - 1; mu++) {
    value = th([key.layer, key.tree, T.WOTS_HASH, key.leaf, i, mu], value);
    out.push(value);
  }
  return out;
}

// ---------------------------------------------------------------------------
// The whole verification (Verify.lean)
// ---------------------------------------------------------------------------

export interface ForsOpening {
  /** The leaf this tree's 10 digest bits pick, 0..1023. */
  s: number;
  secret: Uint8Array;
  path: Uint8Array[];
  /** Recomputed nodes from the leaf hash (height 0) to the root (height 10). */
  nodes: Uint8Array[];
}

export interface LayerTrace {
  layer: number;
  height: number;
  tree: number;
  leaf: number;
  /** The 16 bytes this layer's one-time key signs: the FORS key, or the root of the layer below. */
  signed: Uint8Array;
  counter: number;
  encoding: Uint8Array;
  digits: number[];
  sum: number;
  /** The revealed chain values, chain i at position digits[i]. */
  values: Uint8Array[];
  path: Uint8Array[];
  /** Null when the sum is not 128 (verification stops). */
  ends: Uint8Array[] | null;
  otsPk: Uint8Array | null;
  /** From the leaf (otsPk) up to the root, height + 1 values. */
  nodes: Uint8Array[] | null;
  root: Uint8Array | null;
  calls: number;
  perms: number;
}

export type Stage = "digest" | "fors" | "bottom" | "middle" | "top";

export interface Explained {
  message: Uint8Array;
  pkSeed: Uint8Array;
  pkRoot: Uint8Array;
  signature: Uint8Array;
  randomizer: Uint8Array;
  digest: Uint8Array;
  idx: number;
  leaves: number[];
  fors: ForsOpening[];
  forsPk: Uint8Array;
  layers: LayerTrace[];
  valid: boolean;
  /** Why it failed, in plain words, or null. */
  failure: string | null;
  /** Keccak calls and permutations per stage, in the order verification runs them. */
  stages: { stage: Stage; calls: number; perms: number }[];
  calls: number;
  perms: number;
}

const sub = (b: Uint8Array, o: number, n: number) => b.subarray(o, o + n);
const LAYER_WORD = ["bottom", "middle", "top"];

export function equalBytes(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}

/** Verifies `signature` on the 32-byte `message` under PK.seed ‖ PK.root, keeping every step. */
export function explain(publicKey: Uint8Array, message: Uint8Array, signature: Uint8Array): Explained {
  if (publicKey.length !== PK_SIZE) throw new RangeError("public key must be 32 bytes");
  if (message.length !== 32) throw new RangeError("message must be 32 bytes");
  if (signature.length !== SIG_SIZE) throw new RangeError(`signature must be ${SIG_SIZE} bytes`);
  const pkSeed = publicKey.slice(0, N);
  const pkRoot = publicKey.slice(N);
  const total: HashCount = { calls: 0, perms: 0 };
  const th = makeTh(total, pkSeed);
  const stages: Explained["stages"] = [];
  let mark = { calls: 0, perms: 0 };
  const endStage = (stage: Stage) => {
    stages.push({ stage, calls: total.calls - mark.calls, perms: total.perms - mark.perms });
    mark = { ...total };
  };

  // Digest: two calls over Z = R ‖ PK.seed ‖ PK.root ‖ M, the first 34 bytes.
  const randomizer = sub(signature, 0, N);
  const z = concat(randomizer, pkSeed, pkRoot, message);
  const halves = [0, 1].map((i) => {
    const input = concat(z, be32(i));
    total.calls++;
    total.perms += permsFor(input.length);
    return keccak_256(input);
  });
  const digest = concat(...halves).slice(0, 34);
  const idx = digestIndex(digest);
  const leaves = digestLeaves(digest);
  endStage("digest");

  // FORS: each secret hashes to its leaf and climbs 10 heights, then T_k over the 24 roots.
  const bottom = keyOf(0, idx);
  const fors: ForsOpening[] = leaves.map((s, k) => {
    const o = N + k * (N + FORS_HEIGHT * N);
    const secret = sub(signature, o, N);
    const path = Array.from({ length: FORS_HEIGHT }, (_, l) => sub(signature, o + N + l * N, N));
    const treeIndex = (z: number, j: number) => k * (1 << (FORS_HEIGHT - z)) + j;
    let node = th([0, bottom.tree, T.FORS_TREE, bottom.leaf, 0, treeIndex(0, s)], secret);
    const nodes = [node];
    let j = s;
    for (let zz = 0; zz < FORS_HEIGHT; zz++) {
      const pair = j % 2 === 0 ? concat(node, path[zz]) : concat(path[zz], node);
      j >>>= 1;
      node = th([0, bottom.tree, T.FORS_TREE, bottom.leaf, zz + 1, treeIndex(zz + 1, j)], pair);
      nodes.push(node);
    }
    return { s, secret, path, nodes };
  });
  const forsPk = th([0, bottom.tree, T.FORS_ROOTS, bottom.leaf, 0, 0], concat(...fors.map((f) => f.nodes[FORS_HEIGHT])));
  endStage("fors");

  // Three layers of WOTS+C and Merkle trees.
  const layers: LayerTrace[] = [];
  let signed: Uint8Array | null = forsPk;
  let failure: string | null = null;
  let o = N + FORS_TREES * (N + FORS_HEIGHT * N);
  for (let layer = 0; layer < 3; layer++) {
    const h = LAYER_HEIGHTS[layer];
    const key = keyOf(layer, idx);
    const counter = new DataView(signature.buffer, signature.byteOffset + o, 4).getUint32(0);
    const values = Array.from({ length: CHAINS }, (_, i) => sub(signature, o + 4 + i * N, N));
    const path = Array.from({ length: h }, (_, l) => sub(signature, o + 4 + CHAINS * N + l * N, N));
    o += layerSize(h);
    const before = { ...total };
    const t: LayerTrace = {
      layer, height: h, tree: key.tree, leaf: key.leaf, signed: signed ?? new Uint8Array(N), counter,
      encoding: new Uint8Array(N), digits: [], sum: 0, values, path, ends: null, otsPk: null, nodes: null, root: null,
      calls: 0, perms: 0,
    };
    if (signed) {
      const e = encode(pkSeed, key, signed, counter, total);
      Object.assign(t, e);
      if (e.sum !== TARGET_SUM) {
        failure = `The ${LAYER_WORD[layer]} key's digits sum to ${e.sum}, not ${TARGET_SUM}.`;
        signed = null;
      } else {
        t.ends = values.map((v, i) => chainWalk(pkSeed, key, i, e.digits[i], v, total).at(-1)!);
        t.otsPk = th([layer, key.tree, T.WOTS_PK, key.leaf, 0, 0], concat(...t.ends));
        let node = t.otsPk;
        const nodes = [node];
        let j = key.leaf;
        for (let zz = 0; zz < h; zz++) {
          const pair = j % 2 === 0 ? concat(node, path[zz]) : concat(path[zz], node);
          j >>>= 1;
          node = th([layer, key.tree, T.TREE, 0, zz + 1, j], pair);
          nodes.push(node);
        }
        t.nodes = nodes;
        t.root = node;
        signed = node;
      }
    }
    t.calls = total.calls - before.calls;
    t.perms = total.perms - before.perms;
    layers.push(t);
    endStage(LAYER_WORD[layer] as Stage);
  }
  const top = layers[2].root;
  const valid = top !== null && equalBytes(top, pkRoot);
  if (!failure && !valid) failure = "The top root doesn't match PK.root.";
  return {
    message, pkSeed, pkRoot, signature, randomizer, digest, idx, leaves, fors, forsPk, layers, valid, failure,
    stages, calls: total.calls, perms: total.perms,
  };
}

// ---------------------------------------------------------------------------
// Hex
// ---------------------------------------------------------------------------

export function toHex(b: Uint8Array, prefix = true): string {
  let s = prefix ? "0x" : "";
  for (const x of b) s += x.toString(16).padStart(2, "0");
  return s;
}

export function fromHex(s: string): Uint8Array {
  const h = s.startsWith("0x") ? s.slice(2) : s;
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(2 * i, 2 * i + 2), 16);
  return out;
}
