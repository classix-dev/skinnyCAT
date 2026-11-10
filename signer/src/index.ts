// SPDX-License-Identifier: MIT
//
// leanSPHINCS over Keccak-256 as EthLib specifies it in the FIPS 205 layout: the Lean module
// EthLib/Cryptography/Sphincs/ of ethereum/EthLib, last changed in commit
// dce7a2de23a973d84eac38126a1527763cd3465d (#1555, "feat(sphincs)!: follow the FIPS 205 layout").
// Each function names the Lean definition it follows. Where this file and the Lean disagree, the
// Lean wins.
//
// Parameters (Constants.lean): n = 16, a 32-byte FIPS 205 address, a 32-byte message, a 16-byte
// randomizer, WOTS+C with v = 64 chains of 4 positions and target sum T = 128 (a big-endian 4-byte
// counter, no checksum), FORS k = 24 trees of height a = 10 whose roots T_k hashes into the FORS
// public key, hypertree 8 + 8 + 10 from the bottom. Public key PK.seed ‖ PK.root (32 bytes),
// signature 7,740 bytes. Every integer on the wire is big-endian.
//
// Every hash is Keccak-256 with Ethereum's (original Keccak) padding, the EVM opcode. The library
// uses no Node-only API, so it runs in browsers and Web Workers as well.

import { keccak_256 } from "@noble/hashes/sha3.js";

// ---------------------------------------------------------------------------
// Constants.lean
// ---------------------------------------------------------------------------

export const N = 16;
const ADRS_LEN = 32;
const PREFIX_LEN = N + ADRS_LEN; // 48
export const MESSAGE_LEN = 32;
const RANDOMIZER_LEN = N;
export const SEED_LEN = 32;
const SEED_TAG = new TextEncoder().encode("leanSPHINCS"); // 11 ASCII bytes
const COUNTER_LEN = 4;

const CHAIN_LENGTH = 4; // positions 0..3
const V = 64; // chains
const TARGET_SUM = 128;
const MAX_COUNTER = 0xffffffff; // 2^32 counters, MAX_COUNTER_TRIALS

const TOP_HEIGHT = 10;
const LOWER_HEIGHT = 8;
const LAYERS = 3;

const FORS_TREES = 24; // k
const FORS_HEIGHT = 10; // a
const DIGEST_CALLS = 2;
const MD_BYTES = 30;

export const PUB_KEY_SIZE = 2 * N; // 32
const TREE_OPENING_SIZE = N + FORS_HEIGHT * N; // 176
const layerSigSize = (height: number) => COUNTER_LEN + V * N + height * N;
export const SIG_SIZE =
  RANDOMIZER_LEN + FORS_TREES * TREE_OPENING_SIZE + 2 * layerSigSize(LOWER_HEIGHT) + layerSigSize(TOP_HEIGHT); // 7740

// Serialization.lean offsets.
const FORS_OFFSET = RANDOMIZER_LEN; // 16
const BOTTOM_OFFSET = FORS_OFFSET + FORS_TREES * TREE_OPENING_SIZE; // 4240
const MIDDLE_OFFSET = BOTTOM_OFFSET + layerSigSize(LOWER_HEIGHT); // 5396
const TOP_OFFSET = MIDDLE_OFFSET + layerSigSize(LOWER_HEIGHT); // 6552
const LAYER_OFFSET = [BOTTOM_OFFSET, MIDDLE_OFFSET, TOP_OFFSET];

if (SIG_SIZE !== 7740 || TOP_OFFSET + layerSigSize(TOP_HEIGHT) !== SIG_SIZE) throw new Error("bad constants");

// ---------------------------------------------------------------------------
// Types.lean: layers and one-time keys
// ---------------------------------------------------------------------------

const BOTTOM = 0, MIDDLE = 1, TOP = 2; // Layer.toNat, the layer word of an address
const LAYER_HEIGHT = [LOWER_HEIGHT, LOWER_HEIGHT, TOP_HEIGHT]; // Layer.height
const LAYER_BELOW = [0, LOWER_HEIGHT, 2 * LOWER_HEIGHT]; // Layer.below

interface OtsKey {
  layer: number;
  tree: number;
  leaf: number;
}

/** OtsKey.ofIndex: the key of `layer` on the way from index `idx` up. */
function otsKeyOfIndex(layer: number, idx: number): OtsKey {
  const below = LAYER_BELOW[layer], height = LAYER_HEIGHT[layer];
  // idx < 2^26, so 32-bit shifts are exact.
  return { layer, tree: idx >>> (below + height), leaf: (idx >>> below) & ((1 << height) - 1) };
}

// ---------------------------------------------------------------------------
// Address.lean
// ---------------------------------------------------------------------------

// AdrsType.code
const WOTS_HASH = 0, WOTS_PK = 1, TREE = 2, FORS_TREE = 3, FORS_ROOTS = 4, WOTS_PRF = 5, FORS_PRF = 6, WOTS_ENC = 7;

/** encodeAdrs: [ layer: 4 | tree: 12 | type: 4 | keyPair: 4 | word2: 4 | word3: 4 ], big-endian,
 *  written at `off` of `buf`. Every value here is below 2^32, so the tree's first 8 bytes are zero. */
function writeAdrs(
  buf: Uint8Array, off: number, layer: number, tree: number, type: number, keyPair: number, w2: number, w3: number,
): void {
  const dv = new DataView(buf.buffer, buf.byteOffset + off, ADRS_LEN);
  dv.setUint32(0, layer);
  dv.setUint32(4, 0);
  dv.setUint32(8, 0);
  dv.setUint32(12, tree);
  dv.setUint32(16, type);
  dv.setUint32(20, keyPair);
  dv.setUint32(24, w2);
  dv.setUint32(28, w3);
}

// ---------------------------------------------------------------------------
// TweakableHash.lean
// ---------------------------------------------------------------------------

/** Counts keccak256 calls, for the progress callbacks. */
let hashCalls = 0;

/** H: Keccak-256. */
function keccak256(data: Uint8Array): Uint8Array {
  hashCalls++;
  return keccak_256(data);
}

function concat(...parts: Uint8Array[]): Uint8Array {
  let len = 0;
  for (const p of parts) len += p.length;
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** An address as its six fields, encoded by `writeAdrs`. */
type Adrs = [layer: number, tree: number, type: number, keyPair: number, w2: number, w3: number];

/** th: Th(PK.seed, ADRS, M) = Trunc_16(H(PK.seed ‖ ADRS ‖ M)). */
function th(pkSeed: Uint8Array, a: Adrs, payload: Uint8Array): Uint8Array {
  const buf = new Uint8Array(PREFIX_LEN + payload.length);
  buf.set(pkSeed, 0);
  writeAdrs(buf, N, ...a);
  buf.set(payload, PREFIX_LEN);
  return keccak256(buf).subarray(0, N);
}

/** prf: PRF(PK.seed, SK.seed, ADRS) = Th(PK.seed, ADRS, SK.seed), an 80-byte input. */
const prf = (pkSeed: Uint8Array, skSeed: Uint8Array, a: Adrs) => th(pkSeed, a, skSeed);

// ---------------------------------------------------------------------------
// Encoding.lean
// ---------------------------------------------------------------------------

/** Sum of the four 2-bit digits of each byte value. */
const BYTE_DIGIT_SUM = Uint8Array.from({ length: 256 }, (_, b) => (b >> 6) + ((b >> 4) & 3) + ((b >> 2) & 3) + (b & 3));

/** Internal.digits: base_2b(D, 2, 64), digit i is bits 6 - 2(i mod 4) of byte i / 4, the top two first. */
function digits(d: Uint8Array): number[] {
  const x = new Array<number>(V);
  for (let i = 0; i < V; i++) x[i] = (d[i >> 2] >> (6 - 2 * (i & 3))) & 3;
  return x;
}

/** codeword?: the digits, when they sum to T. */
function codeword(d: Uint8Array): number[] | null {
  let sum = 0;
  for (let j = 0; j < N; j++) sum += BYTE_DIGIT_SUM[d[j]];
  return sum === TARGET_SUM ? digits(d) : null;
}

const be32 = (c: number) => new Uint8Array([c >>> 24, c >>> 16, c >>> 8, c]);

// ---------------------------------------------------------------------------
// Ots.lean
// ---------------------------------------------------------------------------

const adrsChain = (k: OtsKey, i: number, mu: number): Adrs => [k.layer, k.tree, WOTS_HASH, k.leaf, i, mu];
const adrsPk = (k: OtsKey): Adrs => [k.layer, k.tree, WOTS_PK, k.leaf, 0, 0];
const adrsNode = (layer: number, tree: number, z: number, j: number): Adrs => [layer, tree, TREE, 0, z, j];
const adrsPrf = (k: OtsKey, i: number): Adrs => [k.layer, k.tree, WOTS_PRF, k.leaf, i, 0];
const adrsEnc = (k: OtsKey): Adrs => [k.layer, k.tree, WOTS_ENC, k.leaf, 0, 0];

/** chain: walk chain i for `steps` steps from position `start`, each step F under ADRS_chain(K, i, mu). */
function chain(pkSeed: Uint8Array, key: OtsKey, i: number, start: number, steps: number, value: Uint8Array): Uint8Array {
  if (steps === 0) return value;
  // One buffer for the whole walk, only word3 (the position) and the payload change.
  const buf = new Uint8Array(PREFIX_LEN + N);
  buf.set(pkSeed, 0);
  writeAdrs(buf, N, key.layer, key.tree, WOTS_HASH, key.leaf, i, start);
  for (let s = 0; s < steps; s++) {
    buf[PREFIX_LEN - 1] = start + s; // word3, below 3
    buf.set(value, PREFIX_LEN);
    value = keccak256(buf).subarray(0, N);
  }
  return value;
}

/** chainStarts: C_{i,0} = PRF(PK.seed, SK.seed, ADRS_prf(K, i)), chain 0 first. */
function chainStarts(pkSeed: Uint8Array, skSeed: Uint8Array, key: OtsKey): Uint8Array[] {
  const starts: Uint8Array[] = [];
  for (let i = 0; i < V; i++) starts.push(prf(pkSeed, skSeed, adrsPrf(key, i)));
  return starts;
}

/** otsLeafHash: T_v over the 64 chain ends. */
const otsLeafHash = (pkSeed: Uint8Array, key: OtsKey, ends: Uint8Array[]) => th(pkSeed, adrsPk(key), concat(...ends));

/** otsPublicLeaf: wots_pkGen. */
function otsPublicLeaf(pkSeed: Uint8Array, skSeed: Uint8Array, key: OtsKey): Uint8Array {
  const starts = chainStarts(pkSeed, skSeed, key);
  return otsLeafHash(pkSeed, key, starts.map((s, i) => chain(pkSeed, key, i, 0, CHAIN_LENGTH - 1, s)));
}

/** encode: codeword? (Th(PK.seed, ADRS_enc(K), M ‖ BE_32(c))), 68 bytes in. */
const encode = (pkSeed: Uint8Array, key: OtsKey, msg: Uint8Array, counter: number) =>
  codeword(th(pkSeed, adrsEnc(key), concat(msg, be32(counter))));

/** Internal.findCounter from 0: the least counter whose encoding is a codeword. */
function findCounter(pkSeed: Uint8Array, key: OtsKey, msg: Uint8Array): [number, number[]] {
  const buf = new Uint8Array(PREFIX_LEN + N + COUNTER_LEN);
  buf.set(pkSeed, 0);
  writeAdrs(buf, N, key.layer, key.tree, WOTS_ENC, key.leaf, 0, 0);
  buf.set(msg, PREFIX_LEN);
  const at = PREFIX_LEN + N;
  for (let c = 0; c <= MAX_COUNTER; c++) {
    buf[at] = c >>> 24; buf[at + 1] = c >>> 16; buf[at + 2] = c >>> 8; buf[at + 3] = c;
    const x = codeword(keccak256(buf));
    if (x !== null) return [c, x];
  }
  throw new Error(`no codeword within the counter limit on layer ${key.layer}`);
}

/** otsSign: the counter and the 64 chain values, chain i revealed at position x_i. */
function otsSign(pkSeed: Uint8Array, skSeed: Uint8Array, key: OtsKey, msg: Uint8Array): [number, Uint8Array[]] {
  const [counter, x] = findCounter(pkSeed, key, msg);
  const starts = chainStarts(pkSeed, skSeed, key);
  return [counter, starts.map((s, i) => chain(pkSeed, key, i, 0, x[i], s))];
}

/** otsLeaf: the leaf a claimed one-time signature leads to, or null when the counter gives no codeword. */
function otsLeaf(pkSeed: Uint8Array, key: OtsKey, msg: Uint8Array, counter: number, y: Uint8Array[]): Uint8Array | null {
  const x = encode(pkSeed, key, msg, counter);
  if (x === null) return null;
  return otsLeafHash(pkSeed, key, y.map((yi, i) => chain(pkSeed, key, i, x[i], CHAIN_LENGTH - 1 - x[i], yi)));
}

// ---------------------------------------------------------------------------
// Merkle/Tree.lean (the shared Merkle tree), Sphincs/Tree.lean
// ---------------------------------------------------------------------------

/** A node hash: the parent at (z, j) from its two children. */
type NodeHash = (z: number, j: number, left: Uint8Array, right: Uint8Array) => Uint8Array;

/** Merkle.climb from (level 0, j): one sibling per level, the low bit of j orders the pair. */
function merkleClimb(h: NodeHash, j: number, current: Uint8Array, siblings: Uint8Array[]): Uint8Array {
  let z = 0;
  for (const sibling of siblings) {
    current = j % 2 === 0 ? h(z + 1, j >>> 1, current, sibling) : h(z + 1, j >>> 1, sibling, current);
    z++;
    j >>>= 1;
  }
  return current;
}

/** Every node up to the root, levels[z][j] = Merkle.node z j. Same values as the depth-first Lean. */
function merkleLevels(h: NodeHash, leaves: Uint8Array[], height: number): Uint8Array[][] {
  const levels = [leaves];
  for (let z = 1; z <= height; z++) {
    const below = levels[z - 1];
    const row: Uint8Array[] = [];
    for (let j = 0; j < below.length / 2; j++) row.push(h(z, j, below[2 * j], below[2 * j + 1]));
    levels.push(row);
  }
  return levels;
}

/** Merkle.path: P_z = X_{z, floor(j / 2^z) xor 1}, from the leaf up. */
function merklePath(levels: Uint8Array[][], height: number, j: number): Uint8Array[] {
  const path: Uint8Array[] = [];
  for (let z = 0; z < height; z++) path.push(levels[z][(j >>> z) ^ 1]);
  return path;
}

/** nodeHash: H(PK.seed, ADRS_node(l, tau, z, j), left ‖ right). */
const nodeHash = (pkSeed: Uint8Array, layer: number, tree: number): NodeHash => (z, j, left, right) =>
  th(pkSeed, adrsNode(layer, tree, z, j), concat(left, right));

/** All levels of tree `tree` of a layer, its leaves the one-time keys. */
function treeLevels(pkSeed: Uint8Array, skSeed: Uint8Array, layer: number, tree: number, tick: () => void): Uint8Array[][] {
  const height = LAYER_HEIGHT[layer];
  const leaves: Uint8Array[] = [];
  for (let e = 0; e < 1 << height; e++) {
    leaves.push(otsPublicLeaf(pkSeed, skSeed, { layer, tree, leaf: e }));
    tick();
  }
  return merkleLevels(nodeHash(pkSeed, layer, tree), leaves, height);
}

/** Tree.fold: the root a path leads to from the leaf of key e of tree `tree`. */
const treeFold = (pkSeed: Uint8Array, layer: number, tree: number, e: number, leaf: Uint8Array, pi: Uint8Array[]) =>
  merkleClimb(nodeHash(pkSeed, layer, tree), e, leaf, pi);

// ---------------------------------------------------------------------------
// Fors.lean. Instance idx sits at the bottom key K_0(idx) = (0, tau, e).
// ---------------------------------------------------------------------------

/** forsTreeIndex: kappa 2^(a - z) + j. */
const forsTreeIndex = (kappa: number, z: number, j: number) => kappa * (1 << (FORS_HEIGHT - z)) + j;

const adrsFors = (idx: number, z: number, j: number): Adrs => {
  const k = otsKeyOfIndex(BOTTOM, idx);
  return [BOTTOM, k.tree, FORS_TREE, k.leaf, z, j];
};
const adrsRoots = (idx: number): Adrs => {
  const k = otsKeyOfIndex(BOTTOM, idx);
  return [BOTTOM, k.tree, FORS_ROOTS, k.leaf, 0, 0];
};
const adrsFprf = (idx: number, j: number): Adrs => {
  const k = otsKeyOfIndex(BOTTOM, idx);
  return [BOTTOM, k.tree, FORS_PRF, k.leaf, 0, j];
};

/** forsSecret: sk_{kappa,s} = PRF(PK.seed, SK.seed, ADRS_fprf(idx, kappa 2^a + s)). */
const forsSecret = (pkSeed: Uint8Array, skSeed: Uint8Array, idx: number, kappa: number, s: number) =>
  prf(pkSeed, skSeed, adrsFprf(idx, forsTreeIndex(kappa, 0, s)));

/** forsLeafHash: Y_{0,s} = F(PK.seed, ADRS_fors(idx, 0, kappa 2^a + s), sk). */
const forsLeafHash = (pkSeed: Uint8Array, idx: number, kappa: number, s: number, secret: Uint8Array) =>
  th(pkSeed, adrsFors(idx, 0, forsTreeIndex(kappa, 0, s)), secret);

/** forsNodeHash: H(PK.seed, ADRS_fors(idx, z, kappa 2^(a-z) + j), left ‖ right). */
const forsNodeHash = (pkSeed: Uint8Array, idx: number, kappa: number): NodeHash => (z, j, left, right) =>
  th(pkSeed, adrsFors(idx, z, forsTreeIndex(kappa, z, j)), concat(left, right));

/** All levels of FORS tree kappa of instance idx, up to its root at height 10. */
function forsLevels(pkSeed: Uint8Array, skSeed: Uint8Array, idx: number, kappa: number): Uint8Array[][] {
  const leaves: Uint8Array[] = [];
  for (let s = 0; s < 1 << FORS_HEIGHT; s++) {
    leaves.push(forsLeafHash(pkSeed, idx, kappa, s, forsSecret(pkSeed, skSeed, idx, kappa, s)));
  }
  return merkleLevels(forsNodeHash(pkSeed, idx, kappa), leaves, FORS_HEIGHT);
}

/** forsPkFromRoots: T_k(PK.seed, ADRS_roots(idx), root_0 ‖ ... ‖ root_23), 432 bytes in. */
const forsPkFromRoots = (pkSeed: Uint8Array, idx: number, roots: Uint8Array[]) =>
  th(pkSeed, adrsRoots(idx), concat(...roots));

interface TreeOpening {
  secret: Uint8Array;
  path: Uint8Array[]; // FORS_HEIGHT nodes, height 0 first
}

/** treeRecover: the root an opening at leaf s leads to, climbing all 10 heights. */
function treeRecover(pkSeed: Uint8Array, idx: number, kappa: number, s: number, o: TreeOpening): Uint8Array {
  const leaf = forsLeafHash(pkSeed, idx, kappa, s, o.secret);
  return merkleClimb(forsNodeHash(pkSeed, idx, kappa), s, leaf, o.path);
}

/** forsRecover: fors_pkFromSig, the trees in order, then T_k. */
const forsRecover = (pkSeed: Uint8Array, idx: number, leaves: number[], openings: TreeOpening[]) =>
  forsPkFromRoots(pkSeed, idx, leaves.map((s, kappa) => treeRecover(pkSeed, idx, kappa, s, openings[kappa])));

// ---------------------------------------------------------------------------
// Digest.lean
// ---------------------------------------------------------------------------

/** framedMessage: M' = 0x00 ‖ 0x0b ‖ "leanSPHINCS" ‖ M, 45 bytes. */
const framedMessage = (msg: Uint8Array) => concat(new Uint8Array([0, SEED_TAG.length]), SEED_TAG, msg);

/** prfMsg: R = Trunc_16(H(SK.prf ‖ opt_rand ‖ M')), opt_rand = PK.seed, 93 bytes in. */
const prfMsg = (skPrf: Uint8Array, optRand: Uint8Array, msg: Uint8Array) =>
  keccak256(concat(skPrf, optRand, framedMessage(msg))).subarray(0, N);

/** hMsg: the first 34 bytes of H(Z ‖ BE_32(0)) ‖ H(Z ‖ BE_32(1)), Z = R ‖ PK.seed ‖ PK.root ‖ M. */
function hMsg(rho: Uint8Array, pkSeed: Uint8Array, pkRoot: Uint8Array, msg: Uint8Array): Uint8Array {
  const z = concat(rho, pkSeed, pkRoot, msg);
  const calls: Uint8Array[] = [];
  for (let i = 0; i < DIGEST_CALLS; i++) calls.push(keccak256(concat(z, be32(i))));
  return concat(...calls).subarray(0, 34);
}

/** msbField: `width` bits of d from bit `offset`, most significant first. */
function msbField(d: Uint8Array, offset: number, width: number): number {
  let v = 0;
  for (let b = 0; b < width; b++) {
    const p = offset + b;
    v = 2 * v + ((d[p >> 3] >> (7 - (p & 7))) & 1);
  }
  return v;
}

/** digestLeaves: s_kappa = bits 10 kappa .. 10 kappa + 9 of md. */
function digestLeaves(d: Uint8Array): number[] {
  const leaves: number[] = [];
  for (let kappa = 0; kappa < FORS_TREES; kappa++) leaves.push(msbField(d, FORS_HEIGHT * kappa, FORS_HEIGHT));
  return leaves;
}

/** digestIndex: tree * 2^8 + leaf, tree = BE(d[30..33]) mod 2^18, leaf = d[33]. */
function digestIndex(d: Uint8Array): number {
  const tree = ((d[MD_BYTES] << 16) | (d[MD_BYTES + 1] << 8) | d[MD_BYTES + 2]) & ((1 << 18) - 1);
  const leaf = d[MD_BYTES + 3];
  return tree * 256 + leaf;
}

// ---------------------------------------------------------------------------
// Serialization.lean and Verify.lean
// ---------------------------------------------------------------------------

interface LayerSignature {
  counter: number;
  chainValues: Uint8Array[];
  path: Uint8Array[];
}

interface Signature {
  randomizer: Uint8Array;
  fors: TreeOpening[];
  layers: LayerSignature[]; // bottom, middle, top
}

function digestsAt(b: Uint8Array, offset: number, n: number): Uint8Array[] {
  const out: Uint8Array[] = [];
  for (let i = 0; i < n; i++) out.push(b.subarray(offset + N * i, offset + N * i + N));
  return out;
}

/** encodeSignature: [ randomizer: 16 | FORS: 4224 | bottom: 1156 | middle: 1156 | top: 1188 ]. */
function encodeSignature(sig: Signature): Uint8Array {
  const parts: Uint8Array[] = [sig.randomizer];
  for (const o of sig.fors) parts.push(o.secret, ...o.path);
  for (const s of sig.layers) parts.push(be32(s.counter), ...s.chainValues, ...s.path);
  const out = concat(...parts);
  if (out.length !== SIG_SIZE) throw new Error("internal: bad signature size");
  return out;
}

/** decodeSignature: length is the only check. */
function decodeSignature(b: Uint8Array): Signature {
  if (b.length !== SIG_SIZE) throw new RangeError(`bad signature size: ${b.length}, expected ${SIG_SIZE}`);
  const fors: TreeOpening[] = [];
  for (let kappa = 0; kappa < FORS_TREES; kappa++) {
    const o = FORS_OFFSET + TREE_OPENING_SIZE * kappa;
    fors.push({ secret: b.subarray(o, o + N), path: digestsAt(b, o + N, FORS_HEIGHT) });
  }
  const layers = [BOTTOM, MIDDLE, TOP].map((layer) => {
    const o = LAYER_OFFSET[layer];
    const counter = ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
    return {
      counter,
      chainValues: digestsAt(b, o + COUNTER_LEN, V),
      path: digestsAt(b, o + COUNTER_LEN + V * N, LAYER_HEIGHT[layer]),
    };
  });
  return { randomizer: b.subarray(0, RANDOMIZER_LEN), fors, layers };
}

/** decodePublicKey: PK.seed ‖ PK.root. */
function decodePublicKey(b: Uint8Array): [pkSeed: Uint8Array, pkRoot: Uint8Array] {
  if (b.length !== PUB_KEY_SIZE) throw new RangeError(`bad public key size: ${b.length}, expected ${PUB_KEY_SIZE}`);
  return [b.subarray(0, N), b.subarray(N)];
}

function checkMessage(m: Uint8Array): void {
  if (m.length !== MESSAGE_LEN) throw new RangeError(`bad message size: ${m.length}, expected ${MESSAGE_LEN}`);
}

/** What verification computes, for tests and debugging. */
export interface Trace {
  digest: Uint8Array; // the 34 bytes of H_msg
  idx: number;
  leaves: number[];
  forsPk: Uint8Array;
  roots: (Uint8Array | null)[]; // bottom, middle, top; stops at the first failed layer
}

/** verifyWith, keeping the intermediate values. */
function verifyDecoded(pkSeed: Uint8Array, pkRoot: Uint8Array, m: Uint8Array, sig: Signature): [boolean, Trace] {
  const d = hMsg(sig.randomizer, pkSeed, pkRoot, m);
  const idx = digestIndex(d);
  const leaves = digestLeaves(d);
  const forsPk = forsRecover(pkSeed, idx, leaves, sig.fors);
  const roots: (Uint8Array | null)[] = [];
  let msg = forsPk;
  for (const layer of [BOTTOM, MIDDLE, TOP]) {
    // layerRoot
    const s = sig.layers[layer];
    const key = otsKeyOfIndex(layer, idx);
    const leaf = otsLeaf(pkSeed, key, msg, s.counter, s.chainValues);
    const r = leaf === null ? null : treeFold(pkSeed, layer, key.tree, key.leaf, leaf, s.path);
    roots.push(r);
    if (r === null) break;
    msg = r;
  }
  const top = roots[LAYERS - 1];
  const ok = roots.length === LAYERS && top != null && equalBytes(top, pkRoot);
  return [ok, { digest: d, idx, leaves, forsPk, roots }];
}

/** verify over encoded inputs, with the trace. Bad lengths throw a RangeError. */
export function verifyTrace(publicKey: Uint8Array, m: Uint8Array, sig: Uint8Array): [boolean, Trace] {
  const [pkSeed, pkRoot] = decodePublicKey(publicKey);
  checkMessage(m);
  return verifyDecoded(pkSeed, pkRoot, m, decodeSignature(sig));
}

/**
 * verify: whether `sig` signs the 32-byte `msg` under `publicKey` (PK.seed ‖ PK.root).
 * Inputs of the wrong length throw a RangeError (the EthLib vectors' `null`).
 */
export function verify(publicKey: Uint8Array, msg: Uint8Array, sig: Uint8Array): boolean {
  return verifyTrace(publicKey, msg, sig)[0];
}

// ---------------------------------------------------------------------------
// KeyGen.lean and Sign.lean
// ---------------------------------------------------------------------------

function checkSeed(seed: Uint8Array): void {
  if (seed.length !== SEED_LEN) throw new RangeError(`bad seed size: ${seed.length}, expected ${SEED_LEN}`);
}

/** expandKey: PK.seed = Trunc_16(H(tag ‖ SK.seed ‖ 0x00)), SK.prf = H(tag ‖ SK.seed ‖ 0x01). */
export function expandKey(seed: Uint8Array): { pkSeed: Uint8Array; skPrf: Uint8Array } {
  checkSeed(seed);
  const pkSeed = keccak256(concat(SEED_TAG, seed, new Uint8Array([0]))).slice(0, N);
  const skPrf = keccak256(concat(SEED_TAG, seed, new Uint8Array([1])));
  return { pkSeed, skPrf };
}

/** Progress of a long operation: `done` out of about `total` keccak256 calls. The counter searches
 *  are random, so `total` is an estimate. The last report is always done === total. */
export type ProgressCallback = (done: number, total: number) => void;

// Calls per one-time leaf: 64 PRF + 64 * 3 chain steps + 1 T_v.
const CALLS_PER_OTS_LEAF = V + V * (CHAIN_LENGTH - 1) + 1; // 257
// Per FORS tree: 1024 PRF + 1024 leaves + 1023 nodes.
const CALLS_PER_FORS_TREE = 2 * (1 << FORS_HEIGHT) + (1 << FORS_HEIGHT) - 1; // 3071
const EXPECTED_COUNTER_TRIALS = 14_700; // 2^13.84, EthLib code_probability
const TREE_NODES = (h: number) => (1 << h) - 1;
const KEYGEN_CALLS = 2 + (1 << TOP_HEIGHT) * CALLS_PER_OTS_LEAF + TREE_NODES(TOP_HEIGHT);
const SIGN_CALLS_AFTER_KEYGEN =
  3 + FORS_TREES * (CALLS_PER_FORS_TREE + 1) + 1 +
  2 * ((1 << LOWER_HEIGHT) * CALLS_PER_OTS_LEAF + TREE_NODES(LOWER_HEIGHT)) +
  LAYERS * (EXPECTED_COUNTER_TRIALS + V + 2 * V) + 491; // + the self-check

/** Turns hashCalls into throttled progress reports. */
function progressReporter(onProgress: ProgressCallback | undefined, total: number) {
  const start = hashCalls;
  let next = 0;
  const report = () => {
    if (!onProgress) return;
    const done = Math.min(hashCalls - start, total - 1);
    if (done >= next) {
      next = done + 4096;
      onProgress(done, total);
    }
  };
  const finish = () => onProgress?.(total, total);
  return { report, finish };
}

/**
 * Signer: the key of a 32-byte SK.seed, EthLib's whole secret key. The constructor builds the top
 * tree once (EthLib's keyGen); `sign` reuses it, so later signatures cost about half as much.
 */
export class Signer {
  /** SK.seed. */
  readonly seed: Uint8Array;
  /** PK.seed, 16 bytes. */
  readonly pkSeed: Uint8Array;
  /** SK.prf, the key of PRF_msg, 32 bytes. */
  private readonly skPrf: Uint8Array;
  /** PK.root, the top tree's root, 16 bytes. */
  readonly root: Uint8Array;
  private readonly top: Uint8Array[][];

  constructor(seed: Uint8Array, onProgress?: ProgressCallback) {
    checkSeed(seed);
    const p = progressReporter(onProgress, KEYGEN_CALLS);
    this.seed = seed.slice();
    const k = expandKey(this.seed);
    this.pkSeed = k.pkSeed;
    this.skPrf = k.skPrf;
    this.top = treeLevels(this.pkSeed, this.seed, TOP, 0, p.report);
    this.root = this.top[TOP_HEIGHT][0];
    p.finish();
  }

  static fromSeed(seed: Uint8Array, onProgress?: ProgressCallback): Signer {
    return new Signer(seed, onProgress);
  }

  /** PK.seed under its old name (the web worker reads `pp`). */
  get pp(): Uint8Array {
    return this.pkSeed;
  }

  /** encodePublicKey: PK.seed ‖ PK.root. */
  publicKey(): Uint8Array {
    return concat(this.pkSeed, this.root);
  }

  /** signLayer: the one-time signature of `msg` and the key's path. */
  private signLayer(layer: number, idx: number, msg: Uint8Array, levels: Uint8Array[][]): LayerSignature {
    const key = otsKeyOfIndex(layer, idx);
    const [counter, chainValues] = otsSign(this.pkSeed, this.seed, key, msg);
    return { counter, chainValues, path: merklePath(levels, LAYER_HEIGHT[layer], key.leaf) };
  }

  /** sign (signWith): deterministic in (SK.seed, msg), checked with `verify` before it returns. */
  sign(msg: Uint8Array, onProgress?: ProgressCallback): Uint8Array {
    checkMessage(msg);
    const p = progressReporter(onProgress, SIGN_CALLS_AFTER_KEYGEN);
    const { pkSeed, seed, root } = this;
    const rho = prfMsg(this.skPrf, pkSeed, msg);
    const d = hMsg(rho, pkSeed, root, msg);
    const idx = digestIndex(d);
    const leaves = digestLeaves(d);
    const fors: TreeOpening[] = [];
    const forsRoots: Uint8Array[] = [];
    for (let kappa = 0; kappa < FORS_TREES; kappa++) {
      const lv = forsLevels(pkSeed, seed, idx, kappa);
      const s = leaves[kappa];
      fors.push({ secret: forsSecret(pkSeed, seed, idx, kappa, s), path: merklePath(lv, FORS_HEIGHT, s) });
      forsRoots.push(lv[FORS_HEIGHT][0]);
      p.report();
    }
    const forsPk = forsPkFromRoots(pkSeed, idx, forsRoots);
    const bottomKey = otsKeyOfIndex(BOTTOM, idx);
    const middleKey = otsKeyOfIndex(MIDDLE, idx);
    const bottomLevels = treeLevels(pkSeed, seed, BOTTOM, bottomKey.tree, p.report);
    const middleLevels = treeLevels(pkSeed, seed, MIDDLE, middleKey.tree, p.report);
    const bottom = this.signLayer(BOTTOM, idx, forsPk, bottomLevels);
    p.report();
    const middle = this.signLayer(MIDDLE, idx, bottomLevels[LOWER_HEIGHT][0], middleLevels);
    p.report();
    const top = this.signLayer(TOP, idx, middleLevels[LOWER_HEIGHT][0], this.top);
    const sig = encodeSignature({ randomizer: rho, fors, layers: [bottom, middle, top] });
    if (!verify(this.publicKey(), msg, sig)) throw new Error("signer self-check: the signature does not verify");
    p.finish();
    return sig;
  }
}

export type Hex = `0x${string}`;

export interface KeyPair {
  /** The encoded public key PK.seed ‖ PK.root, 32 bytes. */
  publicKey: Uint8Array;
  /** PK.seed ‖ 0^16, the verifier's high-aligned bytes32 key word. */
  pkSeed: Hex;
  /** PK.root ‖ 0^16, the verifier's high-aligned bytes32 key word. */
  pkRoot: Hex;
}

function keyPairOf(s: Signer): KeyPair {
  return {
    publicKey: s.publicKey(),
    pkSeed: toHex(concat(s.pkSeed, new Uint8Array(16))),
    pkRoot: toHex(concat(s.root, new Uint8Array(16))),
  };
}

export interface SignOptions {
  onProgress?: ProgressCallback;
}

const progressOf = (o: ProgressCallback | SignOptions | undefined) => (typeof o === "function" ? o : o?.onProgress);

/** keyGen: the public key of a 32-byte SK.seed. About 265,000 keccak256 calls. */
export function keygen(seed: Uint8Array, opts?: ProgressCallback | SignOptions): KeyPair {
  return keyPairOf(Signer.fromSeed(seed, progressOf(opts)));
}

/**
 * sign: the 7,740-byte signature of the 32-byte `msg` under the key of SK.seed. Deterministic.
 * Rebuilds the top tree, so about 540,000 keccak256 calls, and `onProgress` covers both parts.
 */
export function sign(seed: Uint8Array, msg: Uint8Array, opts?: ProgressCallback | SignOptions): Uint8Array {
  return signWithKey(seed, msg, opts).signature;
}

/** sign, also returning the key. */
export function signWithKey(
  seed: Uint8Array,
  msg: Uint8Array,
  opts?: ProgressCallback | SignOptions,
): KeyPair & { signature: Uint8Array } {
  // The lengths first, before the top tree is built (EthLib's sign rejects either).
  checkSeed(seed);
  checkMessage(msg);
  const onProgress = progressOf(opts);
  const total = KEYGEN_CALLS + SIGN_CALLS_AFTER_KEYGEN;
  const s = Signer.fromSeed(seed, onProgress && ((done) => onProgress(done, total)));
  const signature = s.sign(msg, onProgress && ((done) => onProgress(KEYGEN_CALLS + done, total)));
  return { ...keyPairOf(s), signature };
}

/** abi.encode(bytes32 pkSeed, bytes32 pkRoot, bytes sig), what the CLI's `sign` prints. */
export function abiEncodeSignOutput(pkSeed: Uint8Array, pkRoot: Uint8Array, sig: Uint8Array): Uint8Array {
  if (pkSeed.length !== 32 || pkRoot.length !== 32) throw new RangeError("key words must be 32 bytes");
  const word = (n: number) => {
    const w = new Uint8Array(32);
    new DataView(w.buffer).setUint32(28, n);
    return w;
  };
  const padded = new Uint8Array(Math.ceil(sig.length / 32) * 32);
  padded.set(sig);
  return concat(pkSeed, pkRoot, word(96), word(sig.length), padded);
}

// ---------------------------------------------------------------------------
// Hex helpers
// ---------------------------------------------------------------------------

export function toHex(b: Uint8Array): Hex {
  let s = "0x";
  for (const x of b) s += x.toString(16).padStart(2, "0");
  return s as Hex;
}

/** Hex to bytes, the 0x prefix optional. */
export function fromHex(s: string): Uint8Array {
  const h = s.startsWith("0x") || s.startsWith("0X") ? s.slice(2) : s;
  if (h.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(h)) throw new Error(`bad hex: ${s.slice(0, 20)}`);
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(2 * i, 2 * i + 2), 16);
  return out;
}

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
