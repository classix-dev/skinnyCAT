// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {LeanSphincsVerifier} from "../src/LeanSphincsVerifier.sol";
import {LeanSphincsFFI} from "./utils/LeanSphincsFFI.sol";

/// LeanSphincsVerifier against EthLib's vectors (test/fixtures/ethlib-sphincs, the data.json of each
/// case built from EthLib's data.yaml by script/ethlib-vectors.mjs), fresh signatures from the TypeScript signer,
/// tampering of every field, bad lengths and gas.
contract LeanSphincsVerifierTest is LeanSphincsFFI {
    LeanSphincsVerifier verifier;
    string constant DIR = "test/fixtures/ethlib-sphincs/";

    uint256 constant SIG_LEN = 7740;
    // Serialization.lean offsets.
    uint256 constant FORS = 16;
    uint256 constant BOTTOM = 4240;
    uint256 constant MIDDLE = 5396;
    uint256 constant TOP = 6552;
    uint256 constant GAS_CEILING = 90_000;

    // A signature for the tamper tests: EthLib's sign_known_answer.
    bytes32 kaSeed;
    bytes32 kaRoot;
    bytes32 kaMessage;
    bytes kaSig;

    function setUp() public {
        verifier = new LeanSphincsVerifier();
        (kaSeed, kaRoot) = _words(_bytes(_case("key_gen", "key_gen_known_answer"), ".output"));
        string memory ka = _case("sign", "sign_known_answer");
        kaMessage = bytes32(_bytes(ka, ".message"));
        kaSig = _bytes(ka, ".output");
    }

    // ------------------------------------------------------------------
    // EthLib's vectors
    // ------------------------------------------------------------------

    /// Every verify case: true and false as EthLib says, and `null` (a rejected input) as a revert.
    /// A key or message of the wrong length can't be a bytes32, so `verifyBytes` rejects it before
    /// the call, as any ABI caller would. A signature of the wrong length reaches the verifier.
    function testEthLibVerifyVectors() public {
        string[] memory names = _names("verify");
        assertEq(names.length, 26);
        uint256 accepted;
        uint256 rejected;
        uint256 reverted;
        for (uint256 i; i < names.length; i++) {
            string memory c = _case("verify", names[i]);
            string memory name = names[i];
            string memory outcome = _str(c, ".outcome");
            bytes memory pk = _bytes(c, ".public_key");
            bytes memory m = _bytes(c, ".message");
            bytes memory sig = _bytes(c, ".signature");
            if (_eq(outcome, "reject")) {
                vm.expectRevert();
                this.verifyBytes(pk, m, sig);
                reverted++;
            } else {
                bool want = _eq(outcome, "true");
                assertEq(this.verifyBytes(pk, m, sig), want, name);
                want ? accepted++ : rejected++;
            }
        }
        assertEq(accepted, 3);
        assertEq(rejected, 19);
        assertEq(reverted, 4);
    }

    /// The signatures of EthLib's sign cases verify on chain, under the keys of its key_gen cases.
    function testEthLibSignKnownAnswersVerify() public view {
        string[] memory names = _names("sign");
        uint256 checked;
        for (uint256 i; i < names.length; i++) {
            string memory c = _case("sign", names[i]);
            if (!_eq(_str(c, ".outcome"), "bytes")) continue;
            (bytes32 s, bytes32 r) = _keyOfSeed(_bytes(c, ".seed"));
            bytes memory sig = _bytes(c, ".output");
            assertEq(sig.length, SIG_LEN);
            bytes32 m = bytes32(_bytes(c, ".message"));
            assertTrue(verifier.verify(s, r, m, sig), names[i]);
            checked++;
        }
        assertEq(checked, 3);
    }

    /// The TypeScript CLI gives EthLib's key_gen answers and its sign_known_answer signature.
    function testSignerMatchesEthLib() public {
        string[] memory names = _names("key_gen");
        for (uint256 i; i < names.length; i++) {
            string memory c = _case("key_gen", names[i]);
            if (!_eq(_str(c, ".outcome"), "bytes")) continue;
            (bytes32 s, bytes32 r) = _keygen(bytes32(_bytes(c, ".seed")));
            (bytes32 ws, bytes32 wr) = _words(_bytes(c, ".output"));
            assertEq(s, ws);
            assertEq(r, wr);
        }
        (bytes32 s2, bytes32 r2, bytes memory sig) = _signWithKey(bytes32(_bytes(_case("sign", "sign_known_answer"), ".seed")), kaMessage);
        assertEq(s2, kaSeed);
        assertEq(r2, kaRoot);
        assertEq(keccak256(sig), keccak256(kaSig));
    }

    // ------------------------------------------------------------------
    // Fresh signatures
    // ------------------------------------------------------------------

    function testFreshSignaturesFromTheSigner() public {
        bytes32[2] memory seeds = [keccak256("pq-sig verifier test 1"), keccak256("pq-sig verifier test 2")];
        bytes32[2] memory msgs = [keccak256("message one"), bytes32(type(uint256).max)];
        for (uint256 i; i < 2; i++) {
            (bytes32 s, bytes32 r, bytes memory sig) = _signWithKey(seeds[i], msgs[i]);
            assertEq(uint256(s) << 128, 0);
            assertEq(uint256(r) << 128, 0);
            assertTrue(verifier.verify(s, r, msgs[i], sig), "fresh signature");
            assertFalse(verifier.verify(s, r, msgs[1 - i], sig), "other message");
            // The other key.
            (bytes32 s2, bytes32 r2) = _keygen(seeds[1 - i]);
            assertFalse(verifier.verify(s2, r2, msgs[i], sig), "other key");
        }
    }

    // ------------------------------------------------------------------
    // Tampering
    // ------------------------------------------------------------------

    /// One flipped bit anywhere in a field makes the signature fail. Covers the randomizer, every
    /// FORS secret and every path node of tree 0 and tree 23, and on every layer the four counter
    /// bytes, the first, a middle and the last chain value, and every sibling.
    function testTamperEverySection() public view {
        assertTrue(verifier.verify(kaSeed, kaRoot, kaMessage, kaSig));
        _flip(0, "randomizer first byte");
        _flip(15, "randomizer last byte");
        for (uint256 k; k < 24; k++) _flip(FORS + 176 * k, "FORS secret");
        for (uint256 l; l < 10; l++) {
            _flip(FORS + 16 + 16 * l, "FORS path node, tree 0");
            _flip(FORS + 176 * 23 + 16 + 16 * l + 15, "FORS path node, tree 23");
        }
        uint256[3] memory layers = [BOTTOM, MIDDLE, TOP];
        uint256[3] memory heights = [uint256(8), 8, 10];
        for (uint256 j; j < 3; j++) {
            uint256 o = layers[j];
            for (uint256 b; b < 4; b++) _flip(o + b, "counter");
            _flip(o + 4, "chain value 0");
            _flip(o + 4 + 16 * 31 + 7, "chain value 31");
            _flip(o + 4 + 16 * 63 + 15, "chain value 63");
            for (uint256 l; l < heights[j]; l++) _flip(o + 1028 + 16 * l, "sibling");
        }
        _flip(SIG_LEN - 1, "last byte");
    }

    function testTamperKeyAndMessage() public view {
        for (uint256 b; b < 128; b += 9) {
            bytes32 bit = bytes32(uint256(1) << (255 - b));
            assertFalse(verifier.verify(kaSeed ^ bit, kaRoot, kaMessage, kaSig), "PK.seed");
            assertFalse(verifier.verify(kaSeed, kaRoot ^ bit, kaMessage, kaSig), "PK.root");
        }
        for (uint256 b; b < 256; b += 17) {
            assertFalse(verifier.verify(kaSeed, kaRoot, kaMessage ^ bytes32(uint256(1) << b), kaSig), "message");
        }
        // The key words swapped.
        assertFalse(verifier.verify(kaRoot, kaSeed, kaMessage, kaSig));
    }

    /// Random single-bit flips anywhere in the signature.
    function testFuzzTamper(uint256 pos, uint8 bit) public view {
        pos = bound(pos, 0, SIG_LEN - 1);
        bytes memory bad = bytes.concat(kaSig);
        bad[pos] ^= bytes1(uint8(1) << (bit % 8));
        assertFalse(verifier.verify(kaSeed, kaRoot, kaMessage, bad));
    }

    // ------------------------------------------------------------------
    // Malformed inputs
    // ------------------------------------------------------------------

    function testBadSignatureLengthsRevert() public {
        uint256[6] memory lens = [uint256(0), 1, 7739, 7741, 7772, 15480];
        for (uint256 i; i < lens.length; i++) {
            bytes memory sig = new bytes(lens[i]);
            for (uint256 j; j < sig.length && j < SIG_LEN; j++) sig[j] = kaSig[j];
            vm.expectRevert(bytes("Invalid sig length"));
            verifier.verify(kaSeed, kaRoot, kaMessage, sig);
        }
    }

    function testNonCanonicalKeyWordsRevert() public {
        vm.expectRevert(bytes("Invalid public key"));
        verifier.verify(kaSeed | bytes32(uint256(1)), kaRoot, kaMessage, kaSig);
        vm.expectRevert(bytes("Invalid public key"));
        verifier.verify(kaSeed, kaRoot | bytes32(uint256(1) << 127), kaMessage, kaSig);
        vm.expectRevert(bytes("Invalid public key"));
        verifier.verify(bytes32(type(uint256).max), bytes32(type(uint256).max), kaMessage, new bytes(SIG_LEN));
    }

    function testZeroSignatureIsFalse() public view {
        assertFalse(verifier.verify(kaSeed, kaRoot, kaMessage, new bytes(SIG_LEN)));
        assertFalse(verifier.verify(0, 0, 0, new bytes(SIG_LEN)));
    }

    /// The verifier reads the signature at its calldata offset, wherever the encoder put it.
    function testNonStandardCalldataOffset() public view {
        bytes memory std = abi.encodeCall(verifier.verify, (kaSeed, kaRoot, kaMessage, kaSig));
        // Move the bytes 32 further back: head offset 0xa0, one junk word in between.
        bytes memory head = new bytes(4 + 32 * 4);
        for (uint256 i; i < head.length; i++) head[i] = std[i];
        head[4 + 32 * 3 + 31] = 0xa0;
        bytes memory tail = new bytes(std.length - head.length);
        for (uint256 i; i < tail.length; i++) tail[i] = std[head.length + i];
        (bool ok, bytes memory ret) =
            address(verifier).staticcall(bytes.concat(head, bytes32(type(uint256).max), tail));
        assertTrue(ok);
        assertTrue(abi.decode(ret, (bool)));
    }

    // ------------------------------------------------------------------
    // Gas
    // ------------------------------------------------------------------

    /// Gas of the verifier's call frame, from calldata built beforehand, for every valid vector.
    /// The work is the same 491 hashes for every signature, only the chain dispatch varies a little.
    function testGas() public {
        string[3] memory names = ["sign_known_answer", "sign_zero_message", "sign_zero_seed"];
        for (uint256 i; i < 3; i++) {
            string memory c = _case("sign", names[i]);
            (bytes32 s, bytes32 r) = _keyOfSeed(_bytes(c, ".seed"));
            bytes memory data =
                abi.encodeCall(verifier.verify, (s, r, bytes32(_bytes(c, ".message")), _bytes(c, ".output")));
            (bool ok, bytes memory ret) = address(verifier).staticcall(data);
            assertTrue(ok && abi.decode(ret, (bool)));
            uint256 used = vm.lastCallGas().gasTotalUsed;
            emit log_named_uint(string.concat("verify gas, call frame, ", names[i]), used);
            assertLt(used, GAS_CEILING, "gas ceiling");
        }
        // A rejected signature costs no more: here the top root differs.
        bytes memory bad = bytes.concat(kaSig);
        bad[SIG_LEN - 1] ^= 0x01;
        bytes memory d = abi.encodeCall(verifier.verify, (kaSeed, kaRoot, kaMessage, bad));
        (bool ok2, bytes memory ret2) = address(verifier).staticcall(d);
        assertTrue(ok2 && !abi.decode(ret2, (bool)));
        emit log_named_uint("verify gas, call frame, tampered last sibling", vm.lastCallGas().gasTotalUsed);
        assertLt(vm.lastCallGas().gasTotalUsed, GAS_CEILING, "gas ceiling");
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    function verifyBytes(bytes calldata pk, bytes calldata m, bytes calldata sig) external view returns (bool) {
        require(pk.length == 32, "public key length");
        require(m.length == 32, "message length");
        (bytes32 s, bytes32 r) = _words(pk);
        return verifier.verify(s, r, bytes32(m), sig);
    }

    function _flip(uint256 pos, string memory what) internal view {
        bytes memory bad = bytes.concat(kaSig);
        bad[pos] ^= 0x01;
        assertFalse(verifier.verify(kaSeed, kaRoot, kaMessage, bad), what);
    }

    /// PK.seed ‖ PK.root to the high-aligned key words.
    function _words(bytes memory pk) internal pure returns (bytes32 s, bytes32 r) {
        require(pk.length == 32, "public key length");
        bytes32 w = bytes32(pk);
        s = w & bytes32(~uint256(type(uint128).max));
        r = w << 128;
    }

    function _keyOfSeed(bytes memory seed) internal view returns (bytes32 s, bytes32 r) {
        string[] memory names = _names("key_gen");
        for (uint256 i; i < names.length; i++) {
            string memory c = _case("key_gen", names[i]);
            if (keccak256(_bytes(c, ".seed")) == keccak256(seed)) return _words(_bytes(c, ".output"));
        }
        revert("no key_gen case for this seed");
    }

    function _names(string memory op) internal view returns (string[] memory) {
        return vm.parseJsonStringArray(vm.readFile(string.concat(DIR, "index.json")), string.concat(".", op));
    }

    function _case(string memory op, string memory name) internal view returns (string memory) {
        return vm.readFile(string.concat(DIR, op, "/", name, "/data.json"));
    }

    function _str(string memory json, string memory key) internal pure returns (string memory) {
        return vm.parseJsonString(json, key);
    }

    function _bytes(string memory json, string memory key) internal pure returns (bytes memory) {
        return vm.parseJsonBytes(json, key);
    }

    function _eq(string memory a, string memory b) internal pure returns (bool) {
        return keccak256(bytes(a)) == keccak256(bytes(b));
    }
}
