// SPDX-License-Identifier: MIT
//
// leanSPHINCS, layered key for 2^30 signatures, over Keccak-256: a TypeScript port of
// script/vendor/leansphincs_layered_signer.py (itself a mirror of EthLib's Lean module
// EthLib/Cryptography/Sphincs/, ethereum/EthLib PR #152 at aa99d5f). Each function names the
// Python function it ports; where they disagree, the Python (and above it the Lean) wins.
//
// Parameters: n = 16, P and the address 16 bytes each, a 32-byte message, a 16-byte randomizer,
// WOTS+C with v = 64 chains of w = 4 positions and target sum T = 128 (4-byte LE counter, no
// checksum), FORS k = 24 trees of height a = 10 with no root hash, hypertree 10 (top) + 8 + 8,
// h = 26. Public key 32 bytes (root ‖ P), signature 7,740 bytes.
//
// Every hash is Keccak-256 with Ethereum's (original Keccak) padding, i.e. the EVM opcode.
// The library uses no Node-only API, so it runs in browsers and Web Workers as well.

import { keccak_256 } from "@noble/hashes/sha3.js";

// ---------------------------------------------------------------------------
// Constants.lean
// ---------------------------------------------------------------------------

export const N = 16;
const PUBLIC_PARAM_LEN = 16;
const ADDRESS_LEN = 16;
export const MESSAGE_LEN = 32;
const RANDOMIZER_LEN = 16;
export const SEED_LEN = 32;
const SEED_TAG = new TextEncoder().encode("leanSPHINCS"); // 11 ASCII bytes, hashed before the seed
const COUNTER_LEN = 4;

const CHAIN_LENGTH = 4; // positions 0..3, w = 4
const V = 64; // chains
const TARGET_SUM = 128;

const TOP_HEIGHT = 10;
const LOWER_HEIGHT = 8;
const LAYERS = 3;
const HEIGHT = TOP_HEIGHT + 2 * LOWER_HEIGHT; // 26

const FORS_TREES = 24; // k
const FORS_HEIGHT = 10; // a
const DIGEST_CALLS = 2;

export const PUB_KEY_SIZE = N + PUBLIC_PARAM_LEN; // 32
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

const BOTTOM = 0, MIDDLE = 1, TOP = 2; // Layer.toNat: counted from the bottom, the address byte
const LAYER_HEIGHT = [LOWER_HEIGHT, LOWER_HEIGHT, TOP_HEIGHT]; // Layer.height
const LAYER_BELOW = [0, LOWER_HEIGHT, 2 * LOWER_HEIGHT]; // Layer.below

interface OtsKey {
  layer: number;
  tree: number;
  leaf: number;
}

/** ots_key_of_index (OtsKey.ofIndex): the key of `layer` on the way from index `idx` up. */
function otsKeyOfIndex(layer: number, idx: number): OtsKey {
  const below = LAYER_BELOW[layer], height = LAYER_HEIGHT[layer];
  // idx < 2^26, so plain 32-bit shifts are exact.
  return { layer, tree: idx >>> (below + height), leaf: (idx >>> below) & ((1 << height) - 1) };
}

// ---------------------------------------------------------------------------
// TweakableHash.lean
// ---------------------------------------------------------------------------

/** Counts keccak256 calls, for the sign progress callback. */
let hashCalls = 0;

/** keccak256: Ethereum Keccak-256. */
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

/** th_full (thFull): H(P | A | M), all 32 bytes. */
function thFull(pp: Uint8Array, address: Uint8Array, payload: Uint8Array): Uint8Array {
  return keccak256(concat(pp, address, payload));
}

/** th: Th(P, A, M) = H_0(P | A | M). */
function th(pp: Uint8Array, address: Uint8Array, payload: Uint8Array): Uint8Array {
  return thFull(pp, address, payload).subarray(0, N);
}

/** half_of (halfOf): H_0 is bytes 0..15, H_1 bytes 16..31. */
function halfOf(half: number, full: Uint8Array): Uint8Array {
  return full.subarray(16 * half, 16 * half + 16);
}

// ---------------------------------------------------------------------------
// Address.lean
// ---------------------------------------------------------------------------

// AddressType.code
const T_PRF = 0, T_CHAIN = 1, T_LEAF = 2, T_NODE = 3, T_ENCODING = 4, T_PARAM = 5;
const T_RND = 7, T_MSG = 12, T_FORS_PRF = 14, T_FORS_LEAF = 15, T_FORS_NODE = 17;

/** encode_address (encodeAddress): [ lo: 4 | hi: 3 | type + 32 step: 1 | layer: 1 | tree: 4 | zero: 3 ], LE. */
function encodeAddress(type: number, step: number, layer: number, tree: number, hi: number, lo: number): Uint8Array {
  const a = new Uint8Array(ADDRESS_LEN);
  a[0] = lo; a[1] = lo >>> 8; a[2] = lo >>> 16; a[3] = lo >>> 24;
  a[4] = hi; a[5] = hi >>> 8; a[6] = hi >>> 16;
  a[7] = type + 32 * step;
  a[8] = layer;
  a[9] = tree; a[10] = tree >>> 8; a[11] = tree >>> 16; a[12] = tree >>> 24;
  return a;
}

/** key_address (keyAddress): layer and tree of the key, its leaf in lo. */
const keyAddress = (type: number, step: number, key: OtsKey, hi: number) =>
  encodeAddress(type, step, key.layer, key.tree, hi, key.leaf);
const addrPrf = (key: OtsKey, j: number) => keyAddress(T_PRF, 0, key, j);
/** addr_chain: the step of chain i from position mu to mu + 1, hi = i, step = mu. */
const addrChain = (key: OtsKey, i: number, mu: number) => keyAddress(T_CHAIN, mu, key, i);
const addrLeaf = (key: OtsKey) => keyAddress(T_LEAF, 0, key, 0);
const addrEncoding = (key: OtsKey) => keyAddress(T_ENCODING, 0, key, 0);
/** addr_node (addrNode): hi = level, lo = j. */
const addrNode = (layer: number, tree: number, level: number, j: number) =>
  encodeAddress(T_NODE, 0, layer, tree, level, j);
const ADDR_PARAM = encodeAddress(T_PARAM, 0, 0, 0, 0, 0);
const ADDR_RND = encodeAddress(T_RND, 0, 0, 0, 0, 0);
const addrMsg = (call: number) => encodeAddress(T_MSG, 0, 0, 0, call, 0);
/** fors_hi (forsHi): kappa + 64 position. */
const forsHi = (kappa: number, position: number) => kappa + 64 * position;
/** fors_node_position (forsNodePosition): level + 16 j. */
const forsNodePosition = (level: number, j: number) => level + 16 * j;
const addrForsPrf = (idx: number, kappa: number, p: number) =>
  encodeAddress(T_FORS_PRF, 0, 0, 0, forsHi(kappa, p), idx);
const addrForsLeaf = (idx: number, kappa: number, leaf: number) =>
  encodeAddress(T_FORS_LEAF, 0, 0, 0, forsHi(kappa, leaf), idx);
const addrForsNode = (idx: number, kappa: number, level: number, j: number) =>
  encodeAddress(T_FORS_NODE, 0, 0, 0, forsHi(kappa, forsNodePosition(level, j)), idx);

// ---------------------------------------------------------------------------
// Encoding.lean
// ---------------------------------------------------------------------------

/** digits (Internal.digits): x_i = floor(LE^-1(D) / 4^i) mod 4, i < 64. */
function digits(d: Uint8Array): number[] {
  const x = new Array<number>(V);
  for (let i = 0; i < V; i++) x[i] = (d[i >> 2] >> (2 * (i & 3))) & 3;
  return x;
}

/** codeword (codeword?): the digits, when they sum to T. */
function codeword(d: Uint8Array): number[] | null {
  const x = digits(d);
  let sum = 0;
  for (const xi of x) sum += xi;
  return sum === TARGET_SUM ? x : null;
}

const le32 = (c: number) => new Uint8Array([c, c >>> 8, c >>> 16, c >>> 24]);

// ---------------------------------------------------------------------------
// Ots.lean
// ---------------------------------------------------------------------------

/** chain_starts (chainStarts): chains 2j and 2j + 1 start at the two halves of thFull(P, A_prf(K, j), S). */
function chainStarts(pp: Uint8Array, seed: Uint8Array, key: OtsKey): Uint8Array[] {
  const starts: Uint8Array[] = [];
  for (let j = 0; j < V / 2; j++) {
    const pair = thFull(pp, addrPrf(key, j), seed);
    starts.push(halfOf(0, pair), halfOf(1, pair));
  }
  return starts;
}

/** chain: walk chain i for `steps` steps from position `start`. */
function chain(pp: Uint8Array, key: OtsKey, i: number, start: number, steps: number, value: Uint8Array): Uint8Array {
  for (let s = 0; s < steps; s++) value = th(pp, addrChain(key, i, start + s), value);
  return value;
}

/** ots_leaf_hash */
const otsLeafHash = (pp: Uint8Array, key: OtsKey, ends: Uint8Array[]) => th(pp, addrLeaf(key), concat(...ends));

/** ots_public_leaf */
function otsPublicLeaf(pp: Uint8Array, seed: Uint8Array, key: OtsKey): Uint8Array {
  const starts = chainStarts(pp, seed, key);
  return otsLeafHash(pp, key, starts.map((s, i) => chain(pp, key, i, 0, CHAIN_LENGTH - 1, s)));
}

/** encode: codeword? (Th(P, A_enc(K), M | LE_32(c))). */
const encode = (pp: Uint8Array, key: OtsKey, msg: Uint8Array, counter: number) =>
  codeword(th(pp, addrEncoding(key), concat(msg, le32(counter))));

/** find_counter (Internal.findCounter from 0): the least counter whose encoding is a codeword. */
function findCounter(pp: Uint8Array, key: OtsKey, msg: Uint8Array): [number, number[]] {
  const buf = concat(pp, addrEncoding(key), msg, new Uint8Array(COUNTER_LEN));
  const at = buf.length - COUNTER_LEN;
  for (let c = 0; c <= 0xffffffff; c++) {
    buf[at] = c; buf[at + 1] = c >>> 8; buf[at + 2] = c >>> 16; buf[at + 3] = c >>> 24;
    const x = codeword(keccak256(buf).subarray(0, N));
    if (x !== null) return [c, x];
  }
  throw new Error(`no codeword within the counter limit on layer ${key.layer}`);
}

/** ots_sign */
function otsSign(pp: Uint8Array, seed: Uint8Array, key: OtsKey, msg: Uint8Array): [number, Uint8Array[]] {
  const [counter, x] = findCounter(pp, key, msg);
  const starts = chainStarts(pp, seed, key);
  return [counter, starts.map((s, i) => chain(pp, key, i, 0, x[i], s))];
}

/** ots_leaf (otsLeaf): the leaf a claimed one-time signature leads to, or null (not a codeword). */
function otsLeaf(pp: Uint8Array, key: OtsKey, msg: Uint8Array, counter: number, y: Uint8Array[]): Uint8Array | null {
  const x = encode(pp, key, msg, counter);
  if (x === null) return null;
  return otsLeafHash(pp, key, y.map((yi, i) => chain(pp, key, i, x[i], CHAIN_LENGTH - 1 - x[i], yi)));
}

// ---------------------------------------------------------------------------
// Merkle/Tree.lean (the shared Merkle tree) and Sphincs/Tree.lean
// ---------------------------------------------------------------------------

type NodeHash = (level: number, j: number, left: Uint8Array, right: Uint8Array) => Uint8Array;

/** merkle_ordered (Merkle.ordered): the low bit of j says whether `current` is the left child. */
const merkleOrdered = (j: number, current: Uint8Array, sibling: Uint8Array): [Uint8Array, Uint8Array] =>
  j % 2 === 0 ? [current, sibling] : [sibling, current];

/** merkle_climb (Merkle.climb): hash (level + 1, j / 2) from the ordered children, one sibling per level. */
function merkleClimb(h: NodeHash, level: number, j: number, current: Uint8Array, siblings: Uint8Array[]): Uint8Array {
  for (const sibling of siblings) {
    const [left, right] = merkleOrdered(j, current, sibling);
    current = h(level + 1, j >>> 1, left, right);
    level++;
    j >>>= 1;
  }
  return current;
}

/** merkle_levels: all nodes of the tree up to level `top`, levels[l][j] = Merkle.node l j. */
function merkleLevels(h: NodeHash, leaves: Uint8Array[], top: number): Uint8Array[][] {
  const levels = [leaves];
  for (let level = 1; level <= top; level++) {
    const below = levels[level - 1];
    const row: Uint8Array[] = [];
    for (let j = 0; j < below.length / 2; j++) row.push(h(level, j, below[2 * j], below[2 * j + 1]));
    levels.push(row);
  }
  return levels;
}

/** merkle_path (Merkle.path): pi_l = X_{l, floor(j / 2^l) xor 1}, from the leaf up. */
function merklePath(levels: Uint8Array[][], height: number, j: number): Uint8Array[] {
  const path: Uint8Array[] = [];
  for (let l = 0; l < height; l++) path.push(levels[l][(j >>> l) ^ 1]);
  return path;
}

/** node_hash (Tree.nodeHash): Th(P, A_node(layer, tree, level mod 11, j), left | right). */
const nodeHash = (pp: Uint8Array, layer: number, tree: number): NodeHash => (level, j, left, right) =>
  th(pp, addrNode(layer, tree, level % (TOP_HEIGHT + 1), j), concat(left, right));

/** tree_levels */
function treeLevels(pp: Uint8Array, seed: Uint8Array, layer: number, tree: number, tick: () => void): Uint8Array[][] {
  const height = LAYER_HEIGHT[layer];
  const leaves: Uint8Array[] = [];
  for (let j = 0; j < 1 << height; j++) {
    leaves.push(otsPublicLeaf(pp, seed, { layer, tree, leaf: j }));
    tick();
  }
  return merkleLevels(nodeHash(pp, layer, tree), leaves, height);
}

/** tree_fold (Tree.fold): the root a path leads to from the leaf of key e of tree `tree`. */
const treeFold = (pp: Uint8Array, layer: number, tree: number, e: number, leaf: Uint8Array, pi: Uint8Array[]) =>
  merkleClimb(nodeHash(pp, layer, tree), 0, e, leaf, pi);

// ---------------------------------------------------------------------------
// Fors.lean
// ---------------------------------------------------------------------------

/** fors_secret */
const forsSecret = (pp: Uint8Array, seed: Uint8Array, idx: number, kappa: number, leaf: number) =>
  halfOf(leaf % 2, thFull(pp, addrForsPrf(idx, kappa, leaf >>> 1), seed));

/** fors_leaf_hash */
const forsLeafHash = (pp: Uint8Array, idx: number, kappa: number, leaf: number, secret: Uint8Array) =>
  th(pp, addrForsLeaf(idx, kappa, leaf), secret);

/** fors_node_hash (forsNodeHash): the level modulo 16, the index modulo 2^10. */
const forsNodeHash = (pp: Uint8Array, idx: number, kappa: number): NodeHash => (level, j, left, right) =>
  th(pp, addrForsNode(idx, kappa, level % 16, j % (1 << FORS_HEIGHT)), concat(left, right));

/** fors_levels: Merkle.node up to level 9 only (forsNode), the scheme never hashes level 10. */
function forsLevels(pp: Uint8Array, seed: Uint8Array, idx: number, kappa: number): Uint8Array[][] {
  const leaves: Uint8Array[] = [];
  for (let p = 0; p < (1 << FORS_HEIGHT) / 2; p++) {
    // One PRF call gives the secrets of leaves 2p and 2p + 1 (fors_secret, without hashing twice).
    const pair = thFull(pp, addrForsPrf(idx, kappa, p), seed);
    leaves.push(forsLeafHash(pp, idx, kappa, 2 * p, halfOf(0, pair)));
    leaves.push(forsLeafHash(pp, idx, kappa, 2 * p + 1, halfOf(1, pair)));
  }
  return merkleLevels(forsNodeHash(pp, idx, kappa), leaves, FORS_HEIGHT - 1);
}

interface TreeOpening {
  secret: Uint8Array;
  path: Uint8Array[]; // FORS_HEIGHT nodes, level 0 first; the last is the other level-9 node
}

/** fors_key_bytes (forsKeyBytes): t_0[0] | t_0[1] | ... | t_23[1], 768 bytes. */
const forsKeyBytes = (key: [Uint8Array, Uint8Array][]) => concat(...key.flat());

/** tree_recover (treeRecover): climb levels 0..8, then order the reached level-9 node with path[9] by bit 9. */
function treeRecover(pp: Uint8Array, idx: number, kappa: number, leaf: number, o: TreeOpening): [Uint8Array, Uint8Array] {
  const node = forsLeafHash(pp, idx, kappa, leaf, o.secret);
  const reached = merkleClimb(forsNodeHash(pp, idx, kappa), 0, leaf, node, o.path.slice(0, FORS_HEIGHT - 1));
  return merkleOrdered(leaf >>> (FORS_HEIGHT - 1), reached, o.path[FORS_HEIGHT - 1]);
}

// ---------------------------------------------------------------------------
// Digest.lean
// ---------------------------------------------------------------------------

/** randomizer: R = H_0(P | A_rnd | S | m). */
const randomizer = (pp: Uint8Array, seed: Uint8Array, m: Uint8Array) => th(pp, ADDR_RND, concat(seed, m));

/** message_digest: D = D_0 | D_1, D_c = H(P | A_msg(c) | m | R). */
function messageDigest(pp: Uint8Array, m: Uint8Array, rho: Uint8Array): Uint8Array {
  const parts: Uint8Array[] = [];
  for (let c = 0; c < DIGEST_CALLS; c++) parts.push(thFull(pp, addrMsg(c), concat(m, rho)));
  return concat(...parts);
}

/** Little-endian bits [from, from + count) of `d`, count <= 24. */
function bitsLE(d: Uint8Array, from: number, count: number): number {
  let v = 0;
  for (let b = 0; b < count; b++) {
    const bit = from + b;
    v |= ((d[bit >> 3] >> (bit & 7)) & 1) << b;
  }
  return v >>> 0;
}

/** digest_index: bits 0..25 of D read little endian. */
const digestIndex = (d: Uint8Array) => bitsLE(d, 0, HEIGHT);

/** digest_leaves: leaf_kappa = bits 26 + 10 kappa .. 35 + 10 kappa. */
function digestLeaves(d: Uint8Array): number[] {
  const leaves: number[] = [];
  for (let kappa = 0; kappa < FORS_TREES; kappa++) leaves.push(bitsLE(d, HEIGHT + FORS_HEIGHT * kappa, FORS_HEIGHT));
  return leaves;
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

/** encode_signature (with encode_layer_signature). */
function encodeSignature(sig: Signature): Uint8Array {
  const parts: Uint8Array[] = [sig.randomizer];
  for (const o of sig.fors) parts.push(o.secret, ...o.path);
  for (const s of sig.layers) parts.push(le32(s.counter), ...s.chainValues, ...s.path);
  const out = concat(...parts);
  if (out.length !== SIG_SIZE) throw new Error("internal: bad signature size");
  return out;
}

/** decode_signature (decodeSignature): length is the only check. */
function decodeSignature(b: Uint8Array): Signature {
  if (b.length !== SIG_SIZE) throw new RangeError(`bad signature size: ${b.length}, expected ${SIG_SIZE}`);
  const fors: TreeOpening[] = [];
  for (let kappa = 0; kappa < FORS_TREES; kappa++) {
    const o = FORS_OFFSET + TREE_OPENING_SIZE * kappa;
    fors.push({ secret: b.subarray(o, o + N), path: digestsAt(b, o + N, FORS_HEIGHT) });
  }
  // decode_layer_signature
  const layers = [BOTTOM, MIDDLE, TOP].map((layer) => {
    const o = LAYER_OFFSET[layer];
    const counter = (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
    return {
      counter,
      chainValues: digestsAt(b, o + COUNTER_LEN, V),
      path: digestsAt(b, o + COUNTER_LEN + V * N, LAYER_HEIGHT[layer]),
    };
  });
  return { randomizer: b.subarray(0, RANDOMIZER_LEN), fors, layers };
}

/** decode_public_key (decodePublicKey): root ‖ P. */
function decodePublicKey(b: Uint8Array): [Uint8Array, Uint8Array] {
  if (b.length !== PUB_KEY_SIZE) throw new RangeError(`bad public key size: ${b.length}, expected ${PUB_KEY_SIZE}`);
  return [b.subarray(0, N), b.subarray(N)];
}

/** Trace: what verification computes, for the known-answer checks and for debugging. */
export interface Trace {
  digest: Uint8Array;
  idx: number;
  leaves: number[];
  forsKey: Uint8Array; // fors_key_bytes of the recovered FORS key, 768 bytes
  roots: (Uint8Array | null)[]; // bottom, middle, top (null from a failed layer on)
  counters: number[]; // bottom, middle, top, as decoded
  codewords: (number[] | null)[];
  otsLeaves: (Uint8Array | null)[]; // the one-time leaf each layer's signature leads to
}

/** verify_trace */
function verifyTraceDecoded(root: Uint8Array, pp: Uint8Array, m: Uint8Array, sig: Signature): [boolean, Trace] {
  const d = messageDigest(pp, m, sig.randomizer);
  const idx = digestIndex(d);
  const leaves = digestLeaves(d);
  const forsKey = forsKeyBytes(leaves.map((l, k) => treeRecover(pp, idx, k, l, sig.fors[k])));
  const roots: (Uint8Array | null)[] = [];
  const codewords: (number[] | null)[] = [];
  let msg = forsKey;
  const otsLeaves: (Uint8Array | null)[] = [];
  for (const layer of [BOTTOM, MIDDLE, TOP]) {
    const s = sig.layers[layer];
    // layer_root, unrolled to keep the codeword and the one-time leaf.
    const key = otsKeyOfIndex(layer, idx);
    codewords.push(encode(pp, key, msg, s.counter));
    const leaf = otsLeaf(pp, key, msg, s.counter, s.chainValues);
    otsLeaves.push(leaf);
    const r = leaf === null ? null : treeFold(pp, layer, key.tree, key.leaf, leaf, s.path);
    roots.push(r);
    if (r === null) break;
    msg = r;
  }
  const last = roots[LAYERS - 1];
  const ok = roots.length === LAYERS && last != null && equalBytes(last, root);
  const counters = sig.layers.map((s) => s.counter);
  return [ok, { digest: d, idx, leaves, forsKey, roots, counters, codewords, otsLeaves }];
}

/** verify_trace over encoded inputs (public key root ‖ P). Bad lengths throw. */
export function verifyTrace(publicKey: Uint8Array, m: Uint8Array, sig: Uint8Array): [boolean, Trace] {
  const [root, pp] = decodePublicKey(publicKey);
  checkMessage(m);
  return verifyTraceDecoded(root, pp, m, decodeSignature(sig));
}

/**
 * verify: true iff `sig` is a valid signature of the 32-byte `msg` under `publicKey` (root ‖ P).
 * Bad lengths throw a RangeError, as the Python raises ValueError (the EthLib vectors' `null`).
 */
export function verify(publicKey: Uint8Array, msg: Uint8Array, sig: Uint8Array): boolean {
  return verifyTrace(publicKey, msg, sig)[0];
}

// ---------------------------------------------------------------------------
// KeyGen.lean and Sign.lean
// ---------------------------------------------------------------------------

function checkMessage(m: Uint8Array): void {
  if (m.length !== MESSAGE_LEN) throw new RangeError(`bad message size: ${m.length}, expected ${MESSAGE_LEN}`);
}

/** scheme_seed (schemeSeed): S = H("leanSPHINCS" | S_0). */
export function schemeSeed(seed0: Uint8Array): Uint8Array {
  if (seed0.length !== SEED_LEN) throw new RangeError(`bad seed size: ${seed0.length}, expected ${SEED_LEN}`);
  return keccak256(concat(SEED_TAG, seed0));
}

/** public_param_of (publicParamOf): P = Th(0^128, A_param, S). */
export const publicParamOf = (seed: Uint8Array) => th(new Uint8Array(PUBLIC_PARAM_LEN), ADDR_PARAM, seed);

/** Progress of a long operation: `done` out of about `total` keccak256 calls (an estimate, the counter
 *  searches are random). The last call is always done === total. */
export type ProgressCallback = (done: number, total: number) => void;

// Calls per one-time public leaf: 32 PRF + 64 * 3 chain steps + 1 leaf hash.
const CALLS_PER_OTS_LEAF = V / 2 + V * (CHAIN_LENGTH - 1) + 1; // 225
const CALLS_PER_FORS_TREE = (1 << FORS_HEIGHT) / 2 + (1 << FORS_HEIGHT) + ((1 << FORS_HEIGHT) - 2) + 1; // 2559
const EXPECTED_COUNTER_TRIALS = 14_700; // 2^13.84, EthLib code_probability
const KEYGEN_CALLS = (1 << TOP_HEIGHT) * (CALLS_PER_OTS_LEAF + 1) + 2;
const SIGN_CALLS_AFTER_KEYGEN =
  3 + FORS_TREES * CALLS_PER_FORS_TREE + 2 * (1 << LOWER_HEIGHT) * (CALLS_PER_OTS_LEAF + 1) +
  LAYERS * (EXPECTED_COUNTER_TRIALS + V / 2 + 2 * V) + 466; // + the self-check

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
 * Signer: a key from its scheme seed S (the seed below the name hash, as the Lean known answer pins it).
 * Use Signer.fromSeed(S_0) for EthLib's keyGen / sign. The top tree is built once per Signer.
 */
export class Signer {
  readonly seed: Uint8Array;
  readonly pp: Uint8Array;
  readonly root: Uint8Array;
  private readonly top: Uint8Array[][];

  constructor(schemeSeedBytes: Uint8Array, onProgress?: ProgressCallback) {
    if (schemeSeedBytes.length !== SEED_LEN) throw new RangeError("bad scheme seed size");
    const p = progressReporter(onProgress, KEYGEN_CALLS);
    this.seed = schemeSeedBytes.slice();
    this.pp = publicParamOf(this.seed);
    this.top = treeLevels(this.pp, this.seed, TOP, 0, p.report);
    this.root = this.top[TOP_HEIGHT][0];
    p.finish();
  }

  static fromSeed(seed0: Uint8Array, onProgress?: ProgressCallback): Signer {
    return new Signer(schemeSeed(seed0), onProgress);
  }

  /** public_key (encodePublicKey): root ‖ P. */
  publicKey(): Uint8Array {
    return concat(this.root, this.pp);
  }

  /** _sign_layer */
  private signLayer(layer: number, idx: number, msg: Uint8Array, levels: Uint8Array[][]): LayerSignature {
    const key = otsKeyOfIndex(layer, idx);
    const [counter, chainValues] = otsSign(this.pp, this.seed, key, msg);
    return { counter, chainValues, path: merklePath(levels, LAYER_HEIGHT[layer], key.leaf) };
  }

  /** Signer.sign: deterministic in (seed, m), self-verified before it returns. */
  sign(m: Uint8Array, onProgress?: ProgressCallback): Uint8Array {
    checkMessage(m);
    const p = progressReporter(onProgress, SIGN_CALLS_AFTER_KEYGEN);
    const { pp, seed } = this;
    const rho = randomizer(pp, seed, m);
    const d = messageDigest(pp, m, rho);
    const idx = digestIndex(d);
    const leaves = digestLeaves(d);
    const fors: TreeOpening[] = [];
    const forsKey: [Uint8Array, Uint8Array][] = [];
    for (let kappa = 0; kappa < FORS_TREES; kappa++) {
      const lv = forsLevels(pp, seed, idx, kappa);
      const l = leaves[kappa];
      // treeOpen: the path of a tree of height 10; its last node is the other level-9 node.
      fors.push({ secret: forsSecret(pp, seed, idx, kappa, l), path: merklePath(lv, FORS_HEIGHT, l) });
      forsKey.push([lv[FORS_HEIGHT - 1][0], lv[FORS_HEIGHT - 1][1]]);
      p.report();
    }
    const bottomKey = otsKeyOfIndex(BOTTOM, idx);
    const middleKey = otsKeyOfIndex(MIDDLE, idx);
    const bottomLevels = treeLevels(pp, seed, BOTTOM, bottomKey.tree, p.report);
    const middleLevels = treeLevels(pp, seed, MIDDLE, middleKey.tree, p.report);
    const bottom = this.signLayer(BOTTOM, idx, forsKeyBytes(forsKey), bottomLevels);
    p.report();
    const middle = this.signLayer(MIDDLE, idx, bottomLevels[LOWER_HEIGHT][0], middleLevels);
    p.report();
    const top = this.signLayer(TOP, idx, middleLevels[LOWER_HEIGHT][0], this.top);
    const sig = encodeSignature({ randomizer: rho, fors, layers: [bottom, middle, top] });
    // Self-check, as every signer in this repo does before output.
    if (!verify(this.publicKey(), m, sig)) throw new Error("signer self-check: the signature does not verify");
    p.finish();
    return sig;
  }
}

export type Hex = `0x${string}`;

export interface KeyPair {
  /** The encoded public key root ‖ P, 32 bytes. */
  publicKey: Uint8Array;
  /** P ‖ 0^16, the verifier's high-aligned bytes32 key word. */
  pkSeed: Hex;
  /** root ‖ 0^16, the verifier's high-aligned bytes32 key word. */
  pkRoot: Hex;
}

function keyPairOf(s: Signer): KeyPair {
  return {
    publicKey: s.publicKey(),
    pkSeed: toHex(concat(s.pp, new Uint8Array(16))),
    pkRoot: toHex(concat(s.root, new Uint8Array(16))),
  };
}

/** key_gen (keyGen): the public key of a 32-byte seed S_0. About 231K keccak256 calls. */
export function keygen(seed: Uint8Array, onProgress?: ProgressCallback): KeyPair {
  return keyPairOf(Signer.fromSeed(seed, onProgress));
}

/**
 * sign: the 7,740-byte signature of the 32-byte `msg` under the key of seed S_0. Deterministic.
 * Rebuilds the top tree, so about half a million keccak256 calls; `onProgress` covers both parts.
 */
export function sign(seed: Uint8Array, msg: Uint8Array, onProgress?: ProgressCallback): Uint8Array {
  return signWithKey(seed, msg, onProgress).signature;
}

/** sign, also returning the key words (what the Python `sign` CLI prints). */
export function signWithKey(
  seed: Uint8Array,
  msg: Uint8Array,
  onProgress?: ProgressCallback,
): KeyPair & { signature: Uint8Array } {
  // The lengths first, before the top tree is built (EthLib's sign rejects either).
  schemeSeed(seed);
  checkMessage(msg);
  const total = KEYGEN_CALLS + SIGN_CALLS_AFTER_KEYGEN;
  const s = Signer.fromSeed(seed, onProgress && ((done) => onProgress(done, total)));
  const signature = s.sign(msg, onProgress && ((done) => onProgress(KEYGEN_CALLS + done, total)));
  return { ...keyPairOf(s), signature };
}

/** _abi_encode_sign_output: abi.encode(bytes32 pkSeed, bytes32 pkRoot, bytes sig). */
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

/** Hex to bytes; the 0x prefix is optional, as in the Python CLI. */
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
