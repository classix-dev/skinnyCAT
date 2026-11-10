# leanSPHINCS in the FIPS 205 Layout

On 2026-11-08 EthLib merged commit [`dce7a2de2`](https://github.com/ethereum/EthLib/commit/dce7a2de23a973d84eac38126a1527763cd3465d) (#1555), titled "feat(sphincs)!: follow the FIPS 205 layout". It changes every hash input of leanSPHINCS while keeping the parameters and the 7,740-byte signature. We implemented that version as [src/LeanSphincsVerifier.sol](../src/LeanSphincsVerifier.sol) for the EVM and as [signer/src/index.ts](../signer/src/index.ts) in TypeScript. Both reproduce every EthLib vector byte for byte. This note is for a reviewer who wants to check them against the Lean.

The Lean module is normative, and its README puts the change this way.

> It is SLH-DSA of FIPS 205 on Keccak-256, with WOTS+C as its one-time signature and a hypertree whose layers have different heights.

Links to Lean files below point at commit `dce7a2de2`, the module's last change as of EthLib `ccf5c1e10`.

## Parameters

Nothing here changed. FORS has 24 trees of height 10. WOTS+C has 64 chains of 4 positions with digit sum 128. The hypertree has layers of height 8, 8 and 10 from the bottom, so an index has 26 bits. Hashes are Keccak-256 cut to 16 bytes. A key signs at most 2^30 messages ([Constants.lean](https://github.com/ethereum/EthLib/blob/dce7a2de23a973d84eac38126a1527763cd3465d/EthLib/Cryptography/Sphincs/Constants.lean)).

## The Hash Layout

Every addressed call is `Th(PK.seed, ADRS, M) = Keccak-256(PK.seed ‖ ADRS ‖ M)[0:16]`, and F, H, T_l and PRF are all `Th` ([TweakableHash.lean](https://github.com/ethereum/EthLib/blob/dce7a2de23a973d84eac38126a1527763cd3465d/EthLib/Cryptography/Sphincs/TweakableHash.lean)). The address is the 32-byte one of FIPS 205 §4.2, eight big-endian words ([Address.lean](https://github.com/ethereum/EthLib/blob/dce7a2de23a973d84eac38126a1527763cd3465d/EthLib/Cryptography/Sphincs/Address.lean)).

```text
[ layer: 4 | tree: 12 | type: 4 | keyPair: 4 | word2: 4 | word3: 4 ]
```

| type | name | keyPair | word2 | word3 | payload |
|---|---|---|---|---|---|
| 0 | WOTS_HASH | leaf e | chain i | position mu | one value |
| 1 | WOTS_PK | leaf e | 0 | 0 | 64 chain ends |
| 2 | TREE | 0 | height z | node j | left ‖ right |
| 3 | FORS_TREE | bottom leaf e | height z | κ·2^(10-z) + j | secret, or left ‖ right |
| 4 | FORS_ROOTS | bottom leaf e | 0 | 0 | 24 roots |
| 5 | WOTS_PRF | leaf e | chain i | 0 | SK.seed |
| 6 | FORS_PRF | bottom leaf e | 0 | κ·2^10 + s | SK.seed |
| 7 | WOTS_ENC | leaf e | 0 | 0 | message ‖ BE32(counter) |

Type 7 is the one leanSPHINCS adds to FIPS 205. FORS calls carry layer 0 and the bottom key's tree and leaf.

Four inputs have no address ([KeyGen.lean](https://github.com/ethereum/EthLib/blob/dce7a2de23a973d84eac38126a1527763cd3465d/EthLib/Cryptography/Sphincs/KeyGen.lean), [Digest.lean](https://github.com/ethereum/EthLib/blob/dce7a2de23a973d84eac38126a1527763cd3465d/EthLib/Cryptography/Sphincs/Digest.lean)).

```text
PK.seed = Keccak("leanSPHINCS" ‖ SK.seed ‖ 0x00)[0:16]
SK.prf  = Keccak("leanSPHINCS" ‖ SK.seed ‖ 0x01)
R       = Keccak(SK.prf ‖ PK.seed ‖ 0x00 ‖ 0x0b ‖ "leanSPHINCS" ‖ M)[0:16]
D       = (Keccak(Z ‖ BE32(0)) ‖ Keccak(Z ‖ BE32(1)))[0:34],  Z = R ‖ PK.seed ‖ PK.root ‖ M
```

The digest splits as FIPS 205's Algorithm 19 does, most significant bit first. Bytes 0 to 29 hold the 24 FORS leaves of 10 bits each. Bytes 30 to 32, read big-endian and cut to 18 bits, are the bottom tree. Byte 33 is the bottom leaf, and `idx = tree · 2^8 + leaf`.

WOTS+C digits are FIPS 205's `base_2b` with `b = 2`, so digit 0 is the top two bits of byte 0 ([Encoding.lean](https://github.com/ethereum/EthLib/blob/dce7a2de23a973d84eac38126a1527763cd3465d/EthLib/Cryptography/Sphincs/Encoding.lean)). A counter is admissible when the 64 digits of its encoding sum to 128.

## The Signature Layout

The public key is `PK.seed ‖ PK.root`, 32 bytes. The signature is 7,740 bytes ([Serialization.lean](https://github.com/ethereum/EthLib/blob/dce7a2de23a973d84eac38126a1527763cd3465d/EthLib/Cryptography/Sphincs/Serialization.lean)).

| offset | length | field |
|---|---|---|
| 0 | 16 | randomizer R |
| 16 + 176κ | 16 | FORS secret of tree κ, κ = 0..23 |
| 32 + 176κ + 16ℓ | 16 | FORS path node ℓ of tree κ, ℓ = 0..9 |
| 4240 | 1156 | bottom layer |
| 5396 | 1156 | middle layer |
| 6552 | 1188 | top layer |

Each layer is `[ counter: 4 | 64 chain values: 1024 | h siblings: 16h ]` with a big-endian counter, `h` being 8, 8 and 10 from the bottom.

## Verification

[Verify.lean](https://github.com/ethereum/EthLib/blob/dce7a2de23a973d84eac38126a1527763cd3465d/EthLib/Cryptography/Sphincs/Verify.lean) runs these steps, and the contract follows them in the same order.

1. Hash R, PK.seed, PK.root and M into D, which gives `idx` and the 24 leaves.
2. For each FORS tree, hash the secret into its leaf and climb all 10 heights with the path. Hash the 24 roots under FORS_ROOTS into the 16-byte FORS public key ([Fors.lean](https://github.com/ethereum/EthLib/blob/dce7a2de23a973d84eac38126a1527763cd3465d/EthLib/Cryptography/Sphincs/Fors.lean)).
3. For the bottom, middle and top layers in turn, take the key `OtsKey.ofIndex(layer, idx)`. Hash the message and counter under WOTS_ENC and return false if the digits don't sum to 128. Walk chain i from position `x_i` to 3, hash the 64 ends under WOTS_PK, then climb the tree with the siblings ([Ots.lean](https://github.com/ethereum/EthLib/blob/dce7a2de23a973d84eac38126a1527763cd3465d/EthLib/Cryptography/Sphincs/Ots.lean), [Tree.lean](https://github.com/ethereum/EthLib/blob/dce7a2de23a973d84eac38126a1527763cd3465d/EthLib/Cryptography/Sphincs/Tree.lean)). The bottom layer signs the FORS public key and each higher layer signs the root below it.
4. Accept when the top root equals PK.root.

That is 491 Keccak calls and 515 Keccak-f permutations for every signature. The contract spends 85,990 to 86,205 gas on EthLib's three valid signatures in Foundry, compiled for Shanghai. It reverts on a signature of the wrong length and on key words with a nonzero low half, and returns false otherwise.

## What Changed Since 2026-11-03

We compared the merged module with the [PR #152](https://github.com/ethereum/EthLib/pull/152) version that our earlier verifier, `LeanSphincsLayeredAsm` from [SPHINCS-](https://github.com/nconsigny/SPHINCS-), implemented.

| | 2026-11-03 (PR #152) | 2026-11-08 (dce7a2de2) |
|---|---|---|
| address | 16 bytes, little-endian fields, its own type codes | 32 bytes, FIPS 205 §4.2, big-endian |
| public key | root ‖ P | PK.seed ‖ PK.root |
| key derivation | S = H(tag ‖ S_0), P = Th(0, A_param, S) | PK.seed and SK.prf from tag ‖ SK.seed ‖ domain |
| randomizer | Th(P, A_rnd, S ‖ m) | PRF_msg over the framed message M' |
| digest | two calls H(P ‖ A_msg(c) ‖ m ‖ R), read little-endian | MGF1 over Z, split as Algorithm 19 |
| FORS output | the 48 level-9 nodes, 768 bytes, signed directly | 10-level roots hashed by T_k into 16 bytes |
| chain starts, FORS secrets | one PRF output split between two values | one PRF call each |
| counters, digits | little-endian | big-endian, most significant digit first |
| hashes per verification | 466 (492 permutations) | 491 (515 permutations) |

The signature keeps its size and field order. A signature from either version fails under the other, so a key and its wallet belong to one version.

## Where the Contract Departs from the Old One

The contract keeps the structure of `LeanSphincsLayeredAsm` (MIT, credited in its header). Hashes run in scratch memory laid out as their inputs, 16-byte values go in unmasked where their stray low halves never reach a hash input, and Merkle pairs are placed with a 16-byte `calldatacopy`. The FIPS 205 address helps here. `PK.seed ‖ layer ‖ tree` fills one EVM word, and `type ‖ keyPair ‖ word2 ‖ word3` is the high half of the next, so the payload starts at byte 48. The contract's header gives the memory map and the masking argument in full.

We don't know of another EVM verifier for this version.
