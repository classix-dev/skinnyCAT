// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Classix
// SPDX-FileCopyrightText: 2026 Nicolas Consigny <nicolas@ethereum.org> (structure and techniques)

pragma solidity ^0.8.28;

import {ILeanSphincsVerifier} from "./ILeanSphincsVerifier.sol";

/// @title LeanSphincsVerifier, leanSPHINCS in the FIPS 205 layout, over Keccak-256 (Yul)
/// @notice Verifies leanSPHINCS signatures as EthLib specifies them in the Lean module
///         EthLib/Cryptography/Sphincs/ of ethereum/EthLib, pinned at commit
///         dce7a2de23a973d84eac38126a1527763cd3465d (#1555, "feat(sphincs)!: follow the FIPS 205
///         layout"), the module's last change (checked at ccf5c1e10). Lean names below
///         (Verify.lean `verifyWith`, Fors.lean `treeRecover`, ...) are that module's.
///
///         Parameters (Constants.lean): n = 16, FORS of k = 24 trees of height a = 10 whose roots
///         T_k hashes into the FORS public key, WOTS+C with v = 64 chains of 4 positions and
///         target sum T = 128 (a counter, no checksum), a hypertree of heights 8, 8, 10 from the
///         bottom, 2^30 signatures. Public key PK.seed ‖ PK.root (32 bytes), signature 7,740
///         bytes, 491 Keccak-256 calls (515 Keccak-f[1600] permutations) per verification.
///
///         Structure and techniques come from LeanSphincsLayeredAsm of SPHINCS- by Nicolas
///         Consigny (github.com/nconsigny/SPHINCS- at 4c76aaf, MIT, src/LICENSE-SPHINCS-minus),
///         which verifies the earlier 2026-11-03 layout: the scratch-memory hash window, the unmasked 16-byte values whose low
///         halves never reach a hash input, the L/R placement of Merkle pairs with a 16-byte
///         calldatacopy, the SWAR digit sum and the per-chain switch. The address encoding, the
///         digest, the FORS public key and the memory map are this layout's and new here.
///
/// @dev    Interface: verify(pkSeed, pkRoot, message, sig), the key words high-aligned,
///         pkSeed = PK.seed ‖ 0^16 and pkRoot = PK.root ‖ 0^16 (EthLib's encodePublicKey split in
///         two). Reverts on a signature of the wrong length or a key word with a nonzero low half,
///         returns false on any 7,740-byte signature that does not verify.
///
///         Tweakable hash (TweakableHash.lean): Th(PK.seed, ADRS, M) = Keccak-256(PK.seed ‖ ADRS ‖
///         M)[0:16], the high 128 bits of the EVM word. F, H, T_l and PRF are all Th.
///
///         Address (Address.lean encodeAdrs), 32 bytes, every word big-endian:
///           [ layer: 4 | tree: 12 | type: 4 | keyPair: 4 | word2: 4 | word3: 4 ]
///         Verification uses these types (keyPair, word2, word3):
///           0 WOTS_HASH   leaf e, chain i, position mu (the step leaves mu)
///           1 WOTS_PK     leaf e, 0, 0
///           2 TREE        0, height z, node index j
///           3 FORS_TREE   bottom leaf e, height z, kappa 2^(10-z) + j
///           4 FORS_ROOTS  bottom leaf e, 0, 0
///           7 WOTS_ENC    leaf e, 0, 0
///         (5 WOTS_PRF and 6 FORS_PRF are the signer's.) The FORS calls carry layer 0 and the
///         bottom tree. A layer's key is OtsKey.ofIndex: bottom (0, idx >> 8, idx mod 2^8),
///         middle (1, idx >> 16, (idx >> 8) mod 2^8), top (2, 0, idx >> 16).
///
///         Digest (Digest.lean): with Z = R ‖ PK.seed ‖ PK.root ‖ M (80 bytes),
///         D = (Keccak(Z ‖ BE32(0)) ‖ Keccak(Z ‖ BE32(1)))[0:34]. Bits 10κ..10κ+9 of D, most
///         significant first, are FORS leaf s_κ. Bytes 30..32 big-endian mod 2^18 are the bottom
///         tree, byte 33 the bottom leaf, idx = tree · 2^8 + leaf.
///
///         Signature (Serialization.lean encodeSignature):
///              0                    R, the randomizer
///             16 + 176κ             FORS secret of tree κ               κ = 0..23
///             32 + 176κ + 16ℓ       FORS path node ℓ of tree κ          ℓ = 0..9
///           4240 / 5396 / 6552      bottom / middle / top layer, each:
///             +0                    counter c, BE32
///             +4 + 16i              chain value σ_i                     i = 0..63
///             +1028 + 16ℓ           sibling ℓ                           ℓ < 8 / 8 / 10
///
///         Memory map. Every addressed hash reads a window laid out as its input:
///           +0x00  PK.seed ‖ BE32(layer) ‖ BE96(tree)      one word, the PREFIX word
///           +0x20  BE32(type) ‖ BE32(keyPair) ‖ BE32(word2) ‖ BE32(word3)
///           +0x30  payload
///         The small window sits at 0x00 (inputs of 64, 68 and 80 bytes), the wide one at 0x80
///         (T_k over the 24 FORS roots, 432 bytes, and T_v over the 64 chain ends, 1072 bytes).
///         The address word is stored as a full word, so it is written before the payload, whose
///         first 16 bytes it overlaps. The highest byte written is 0x4BF.
///
///         MASKING. A 16-byte value arrives in a word whose low half is not zero (calldata carries
///         the next field, a hash word the 16 bytes Th drops). No value is masked, each store is
///         placed so that its low half never reaches a hash input:
///           chain and FORS values   stored at 0x30, hashed from 0x00 for 0x40 bytes (to 0x3F)
///           Merkle pairs            L/R PLACEMENT below
///           encoding message        stored at 0x30, the 4 counter bytes copied over 0x40..0x43
///           FORS node word3         t << (128 - z) in place of (t >> z) << 128: the z low bits
///                                   of t land on 0x30..0x3F, which the pair then rewrites
///           FORS roots, chain ends  word stores at 0xB0 + 16i in ascending order: each low half
///                                   lands on the next slot, which the next store rewrites, and
///                                   the last lands past the end of the hashed input
///         N_MASK is applied once, to the top root before the comparison.
///
///         L/R PLACEMENT. A pair L ‖ R is payload 0x30..0x4F. The current node is stored as a
///         word at p = 0x30 + 16·bit (bit = low bit of its index), then the sibling's 16 calldata
///         bytes are calldatacopy'd to the other slot, 0x70 - p. With the node first, its low
///         half lands on the sibling's slot (rewritten) or on 0x50..0x5F (never read).
///
///         The scratch writes cover Solidity's free memory pointer (0x40) and zero slot (0x60),
///         so every exit from the assembly block is a `return` or `revert`, and the block is not
///         memory-safe. Do not add a fall-through exit.
contract LeanSphincsVerifier is ILeanSphincsVerifier {
    function verify(bytes32 pkSeed, bytes32 pkRoot, bytes32 message, bytes calldata sig)
        external
        pure
        returns (bool)
    {
        assembly {
            let N_MASK := 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF00000000000000000000000000000000

            // Verify.lean `layerRoot`: the root one layer's signature leads to from the 16-byte
            // message it signs (the high half of `msgWord`). `prefix` is the layer's PREFIX word,
            // `e` the key's leaf. Ends the call with false when the counter gives no codeword.
            function layerRoot(prefix, msgWord, e, height, layerPtr) -> cur {
                // Ots.lean `encode`: Th(PK.seed, ADRS_enc(K), M ‖ BE32(c)), 68 bytes.
                mstore(0x00, prefix)
                mstore(0x20, or(shl(224, 7), shl(192, e)))
                mstore(0x30, msgWord)
                calldatacopy(0x40, layerPtr, 4)
                let h := keccak256(0x00, 0x44)

                // Encoding.lean `codeword?`: the 64 2-bit digits of d = h[0:16] must sum to 128.
                // The sum does not depend on the order of the digits, so a SWAR reduction of d:
                // pairs of digits into 32 nibbles (each at most 6), pairs of nibbles into 16 bytes
                // (each at most 12), then multiplying by 0x0101..01 sums the bytes into byte 15.
                // No partial sum exceeds 16 · 12 = 192, so no byte carries.
                {
                    let d := shr(128, h)
                    let t := add(
                        and(d, 0x33333333333333333333333333333333),
                        and(shr(2, d), 0x33333333333333333333333333333333)
                    )
                    t := and(add(t, shr(4, t)), 0x0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F)
                    if iszero(eq(and(shr(120, mul(t, 0x01010101010101010101010101010101)), 0xFF), 128)) {
                        mstore(0x00, 0)
                        return(0x00, 0x20)
                    }
                }

                // The wide window for T_v: PREFIX word and ADRS_pk(K) before the chain ends.
                mstore(0x80, prefix)
                mstore(0xA0, or(shl(224, 1), shl(192, e)))

                // Ots.lean `otsLeaf`: chain i walks from position x_i to 3, each step
                // F(PK.seed, ADRS_chain(K, i, mu), value) with word3 = mu, the position it leaves.
                // Digit x_i is bits 254 - 2i, 255 - 2i of h (base_2b, most significant first).
                // Within one chain only word3 changes, its low byte at 0x2F, so the later steps
                // rewrite that byte alone (the per-chain switch of SPHINCS-). End i goes to
                // 0xB0 + 16i (MASKING).
                let chainAdrs := shl(192, e) // type WOTS_HASH (0), keyPair e
                let wots := add(layerPtr, 4)
                // Unrolled by 4: byte k of h holds digits 4k..4k+3, digit 4k in its top two bits.
                for { let k := 0 } lt(k, 16) { k := add(k, 1) } {
                    let nb := byte(k, h)
                    let ptr := add(wots, shl(6, k)) // σ_{4k}
                    let slot := add(0xB0, shl(6, k)) // end_{4k}
                    let a := or(chainAdrs, shl(162, k)) // word2 = 4k
                    { // chain 4k + 0
                        let val := calldataload(ptr) // σ_i, unmasked (MASKING)
                        switch shr(6, nb)
                        case 0 {
                            mstore(0x20, a) // mu = 0
                            mstore(0x30, val)
                            val := keccak256(0x00, 0x40)
                            mstore8(0x2F, 1)
                            mstore(0x30, val)
                            val := keccak256(0x00, 0x40)
                            mstore8(0x2F, 2)
                            mstore(0x30, val)
                            val := keccak256(0x00, 0x40)
                        }
                        case 1 {
                            mstore(0x20, or(a, shl(128, 1)))
                            mstore(0x30, val)
                            val := keccak256(0x00, 0x40)
                            mstore8(0x2F, 2)
                            mstore(0x30, val)
                            val := keccak256(0x00, 0x40)
                        }
                        case 2 {
                            mstore(0x20, or(a, shl(128, 2)))
                            mstore(0x30, val)
                            val := keccak256(0x00, 0x40)
                        }
                        mstore(slot, val) // x = 3 leaves σ_i as the end
                    }
                    { // chain 4k + 1
                        let val := calldataload(add(ptr, 16)) // σ_i, unmasked (MASKING)
                        switch and(shr(4, nb), 3)
                        case 0 {
                            mstore(0x20, or(a, shl(160, 1))) // mu = 0
                            mstore(0x30, val)
                            val := keccak256(0x00, 0x40)
                            mstore8(0x2F, 1)
                            mstore(0x30, val)
                            val := keccak256(0x00, 0x40)
                            mstore8(0x2F, 2)
                            mstore(0x30, val)
                            val := keccak256(0x00, 0x40)
                        }
                        case 1 {
                            mstore(0x20, or(or(a, shl(160, 1)), shl(128, 1)))
                            mstore(0x30, val)
                            val := keccak256(0x00, 0x40)
                            mstore8(0x2F, 2)
                            mstore(0x30, val)
                            val := keccak256(0x00, 0x40)
                        }
                        case 2 {
                            mstore(0x20, or(or(a, shl(160, 1)), shl(128, 2)))
                            mstore(0x30, val)
                            val := keccak256(0x00, 0x40)
                        }
                        mstore(add(slot, 16), val) // x = 3 leaves σ_i as the end
                    }
                    { // chain 4k + 2
                        let val := calldataload(add(ptr, 32)) // σ_i, unmasked (MASKING)
                        switch and(shr(2, nb), 3)
                        case 0 {
                            mstore(0x20, or(a, shl(160, 2))) // mu = 0
                            mstore(0x30, val)
                            val := keccak256(0x00, 0x40)
                            mstore8(0x2F, 1)
                            mstore(0x30, val)
                            val := keccak256(0x00, 0x40)
                            mstore8(0x2F, 2)
                            mstore(0x30, val)
                            val := keccak256(0x00, 0x40)
                        }
                        case 1 {
                            mstore(0x20, or(or(a, shl(160, 2)), shl(128, 1)))
                            mstore(0x30, val)
                            val := keccak256(0x00, 0x40)
                            mstore8(0x2F, 2)
                            mstore(0x30, val)
                            val := keccak256(0x00, 0x40)
                        }
                        case 2 {
                            mstore(0x20, or(or(a, shl(160, 2)), shl(128, 2)))
                            mstore(0x30, val)
                            val := keccak256(0x00, 0x40)
                        }
                        mstore(add(slot, 32), val) // x = 3 leaves σ_i as the end
                    }
                    { // chain 4k + 3
                        let val := calldataload(add(ptr, 48)) // σ_i, unmasked (MASKING)
                        switch and(nb, 3)
                        case 0 {
                            mstore(0x20, or(a, shl(160, 3))) // mu = 0
                            mstore(0x30, val)
                            val := keccak256(0x00, 0x40)
                            mstore8(0x2F, 1)
                            mstore(0x30, val)
                            val := keccak256(0x00, 0x40)
                            mstore8(0x2F, 2)
                            mstore(0x30, val)
                            val := keccak256(0x00, 0x40)
                        }
                        case 1 {
                            mstore(0x20, or(or(a, shl(160, 3)), shl(128, 1)))
                            mstore(0x30, val)
                            val := keccak256(0x00, 0x40)
                            mstore8(0x2F, 2)
                            mstore(0x30, val)
                            val := keccak256(0x00, 0x40)
                        }
                        case 2 {
                            mstore(0x20, or(or(a, shl(160, 3)), shl(128, 2)))
                            mstore(0x30, val)
                            val := keccak256(0x00, 0x40)
                        }
                        mstore(add(slot, 48), val) // x = 3 leaves σ_i as the end
                    }
                }

                // otsLeafHash: T_v over the 64 ends, 48 + 1024 = 0x430 bytes from 0x80.
                cur := keccak256(0x80, 0x430)

                // Tree.lean `fold` (Merkle.climb from (0, e)): height z = 1..h hashes
                // H(PK.seed, ADRS_node(l, tau, z, e >> z), L ‖ R), the side from bit z - 1 of e,
                // sibling z - 1 at layer offset 1028 + 16(z - 1). The PREFIX word at 0x00 is the
                // layer's already.
                let path := add(layerPtr, 1012) // 1028 - 16, so sibling z - 1 is at path + 16z
                for { let z := 1 } iszero(gt(z, height)) { z := add(z, 1) } {
                    mstore(0x20, or(shl(224, 2), or(shl(160, z), shl(128, shr(z, e)))))
                    let p := add(0x30, shl(4, and(shr(sub(z, 1), e), 1)))
                    mstore(p, cur)
                    calldatacopy(sub(0x70, p), add(path, shl(4, z)), 0x10)
                    cur := keccak256(0x00, 0x50)
                }
            }

            // -----------------------------------------------------------------
            // Input checks
            // -----------------------------------------------------------------

            // 7740 = 16 + 24 · 176 + 2 · 1156 + 1188 (Constants.lean SIG_SIZE).
            if iszero(eq(sig.length, 7740)) {
                mstore(0x00, 0x08c379a000000000000000000000000000000000000000000000000000000000)
                mstore(0x04, 0x20)
                mstore(0x24, 18)
                mstore(0x44, "Invalid sig length")
                revert(0x00, 0x64)
            }
            // The key words are high-aligned. A nonzero low half would land in the layer and tree
            // of every address, or make pkRoot unreachable, so fail loudly instead of returning
            // false forever.
            if or(shl(128, pkSeed), shl(128, pkRoot)) {
                mstore(0x00, 0x08c379a000000000000000000000000000000000000000000000000000000000)
                mstore(0x04, 0x20)
                mstore(0x24, 18)
                mstore(0x44, "Invalid public key")
                revert(0x00, 0x64)
            }

            let sigBase := sig.offset

            // -----------------------------------------------------------------
            // 1. Digest.lean `hMsg`: Z ‖ BE32(i) for i = 0, 1, 84 bytes from 0x00:
            //    R at 0x00, PK.seed at 0x10, PK.root at 0x20, M at 0x30, the counter at 0x50.
            //    Each store's low half is overwritten by the next field.
            // -----------------------------------------------------------------
            mstore(0x00, calldataload(sigBase))
            mstore(0x10, pkSeed)
            mstore(0x20, pkRoot)
            mstore(0x30, message)
            mstore(0x50, 0)
            let D0 := keccak256(0x00, 0x54)
            mstore8(0x53, 1)
            let D1 := keccak256(0x00, 0x54)

            // digestTree: bytes 30, 31 of D0 and byte 0 of D1, big-endian, mod 2^18.
            // digestLeaf: byte 1 of D1. The bottom key is (0, tree, leaf).
            let tree := or(shl(8, and(D0, 0x3FF)), byte(0, D1))
            let leaf := byte(1, D1)

            // -----------------------------------------------------------------
            // 2. Fors.lean `forsRecover`: 24 · (1 + 10) hashes, then T_k.
            //    Tree κ, leaf s = bits 246 - 10κ .. 255 - 10κ of D0. Its tree index at height z
            //    is κ 2^(10-z) + (s >> z) = (κ 2^10 + s) >> z, word3 below.
            // -----------------------------------------------------------------
            let prefix := or(pkSeed, tree) // layer 0, tree idx >> 8
            mstore(0x00, prefix)
            mstore(0x80, prefix)
            mstore(0xA0, or(shl(224, 4), shl(192, leaf))) // ADRS_roots(idx)
            let forsAdrs := or(shl(224, 3), shl(192, leaf)) // FORS_TREE, keyPair e
            for { let kappa := 0 } lt(kappa, 24) { kappa := add(kappa, 1) } {
                let s := and(shr(sub(246, mul(10, kappa)), D0), 0x3FF)
                let t := or(shl(10, kappa), s)
                let treePtr := add(add(sigBase, 16), mul(176, kappa)) // the secret
                // Leaf: F(PK.seed, ADRS_fors(idx, 0, t), sk).
                mstore(0x20, or(forsAdrs, shl(128, t)))
                mstore(0x30, calldataload(treePtr))
                let node := keccak256(0x00, 0x40)
                // Heights 1..10, unrolled. Height z hashes under word2 = z, word3 = t >> z. The
                // word stores t << (128 - z): its low z bits land in payload bytes 0x30..0x3F,
                // which the pair overwrites, so no mask (MASKING). The side bit z - 1 of s goes
                // to bit 4, giving p = 0x30 or 0x40, the sibling at 0x70 xor p = the other slot.
                // Path node z - 1 is at treePtr + 16z.
                let p
                // z = 1: side bit 0 of s, path node 0
                p := add(0x30, and(shl(4, s), 0x10))
                mstore(0x20, or(or(forsAdrs, shl(160, 1)), shl(127, t)))
                mstore(p, node)
                calldatacopy(xor(p, 0x70), add(treePtr, 16), 0x10)
                node := keccak256(0x00, 0x50)
                // z = 2: side bit 1 of s, path node 1
                p := add(0x30, and(shl(3, s), 0x10))
                mstore(0x20, or(or(forsAdrs, shl(160, 2)), shl(126, t)))
                mstore(p, node)
                calldatacopy(xor(p, 0x70), add(treePtr, 32), 0x10)
                node := keccak256(0x00, 0x50)
                // z = 3: side bit 2 of s, path node 2
                p := add(0x30, and(shl(2, s), 0x10))
                mstore(0x20, or(or(forsAdrs, shl(160, 3)), shl(125, t)))
                mstore(p, node)
                calldatacopy(xor(p, 0x70), add(treePtr, 48), 0x10)
                node := keccak256(0x00, 0x50)
                // z = 4: side bit 3 of s, path node 3
                p := add(0x30, and(shl(1, s), 0x10))
                mstore(0x20, or(or(forsAdrs, shl(160, 4)), shl(124, t)))
                mstore(p, node)
                calldatacopy(xor(p, 0x70), add(treePtr, 64), 0x10)
                node := keccak256(0x00, 0x50)
                // z = 5: side bit 4 of s, path node 4
                p := add(0x30, and(s, 0x10))
                mstore(0x20, or(or(forsAdrs, shl(160, 5)), shl(123, t)))
                mstore(p, node)
                calldatacopy(xor(p, 0x70), add(treePtr, 80), 0x10)
                node := keccak256(0x00, 0x50)
                // z = 6: side bit 5 of s, path node 5
                p := add(0x30, and(shr(1, s), 0x10))
                mstore(0x20, or(or(forsAdrs, shl(160, 6)), shl(122, t)))
                mstore(p, node)
                calldatacopy(xor(p, 0x70), add(treePtr, 96), 0x10)
                node := keccak256(0x00, 0x50)
                // z = 7: side bit 6 of s, path node 6
                p := add(0x30, and(shr(2, s), 0x10))
                mstore(0x20, or(or(forsAdrs, shl(160, 7)), shl(121, t)))
                mstore(p, node)
                calldatacopy(xor(p, 0x70), add(treePtr, 112), 0x10)
                node := keccak256(0x00, 0x50)
                // z = 8: side bit 7 of s, path node 7
                p := add(0x30, and(shr(3, s), 0x10))
                mstore(0x20, or(or(forsAdrs, shl(160, 8)), shl(120, t)))
                mstore(p, node)
                calldatacopy(xor(p, 0x70), add(treePtr, 128), 0x10)
                node := keccak256(0x00, 0x50)
                // z = 9: side bit 8 of s, path node 8
                p := add(0x30, and(shr(4, s), 0x10))
                mstore(0x20, or(or(forsAdrs, shl(160, 9)), shl(119, t)))
                mstore(p, node)
                calldatacopy(xor(p, 0x70), add(treePtr, 144), 0x10)
                node := keccak256(0x00, 0x50)
                // z = 10: side bit 9 of s, path node 9
                p := add(0x30, and(shr(5, s), 0x10))
                mstore(0x20, or(or(forsAdrs, shl(160, 10)), shl(118, t)))
                mstore(p, node)
                calldatacopy(xor(p, 0x70), add(treePtr, 160), 0x10)
                node := keccak256(0x00, 0x50)
                mstore(add(0xB0, shl(4, kappa)), node) // root κ (MASKING)
            }
            // forsPkFromRoots: T_k, 48 + 24 · 16 = 0x1B0 bytes from 0x80.
            let msgWord := keccak256(0x80, 0x1B0)

            // -----------------------------------------------------------------
            // 3. The layers, bottom up (Verify.lean `verifyWith`, steps 3 to 5).
            // -----------------------------------------------------------------
            msgWord := layerRoot(prefix, msgWord, leaf, 8, add(sigBase, 4240))
            // Middle: layer 1, tree idx >> 16, leaf (idx >> 8) mod 2^8.
            msgWord := layerRoot(or(pkSeed, or(shl(96, 1), shr(8, tree))), msgWord, and(tree, 0xFF), 8, add(sigBase, 5396))
            // Top: layer 2, tree 0, leaf idx >> 16.
            msgWord := layerRoot(or(pkSeed, shl(97, 1)), msgWord, shr(8, tree), 10, add(sigBase, 6552))

            // Step 6: the top root is the key's.
            mstore(0x00, eq(and(msgWord, N_MASK), pkRoot))
            return(0x00, 0x20)
        }
    }
}
