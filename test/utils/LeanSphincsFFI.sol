// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";

/// Keys and signatures from the TypeScript signer (signer/src/cli.ts) over FFI, run with the tsx in
/// signer/node_modules, so no network and no build step. Needs `npm ci` in signer once and `node`
/// on the PATH (`nix develop` has nodejs_22). A signature takes about 4 seconds.
abstract contract LeanSphincsFFI is Test {
    function _cli(string memory cmd, uint256 nargs) private pure returns (string[] memory inputs) {
        inputs = new string[](4 + nargs);
        inputs[0] = "node";
        inputs[1] = "signer/node_modules/tsx/dist/cli.mjs";
        inputs[2] = "signer/src/cli.ts";
        inputs[3] = cmd;
    }

    /// The key words of a seed: PK.seed ‖ 0^16 and PK.root ‖ 0^16.
    function _keygen(bytes32 seed) internal returns (bytes32 pkSeed, bytes32 pkRoot) {
        string[] memory inputs = _cli("keygen", 1);
        inputs[4] = vm.toString(seed);
        bytes memory pk = vm.ffi(inputs); // PK.seed ‖ PK.root
        require(pk.length == 32, "keygen output");
        assembly {
            let w := mload(add(pk, 0x20))
            pkSeed := shl(128, shr(128, w))
            pkRoot := shl(128, w)
        }
    }

    /// A signature of `message` under the key of `seed`, with the key words the signer reports.
    function _signWithKey(bytes32 seed, bytes32 message)
        internal
        returns (bytes32 pkSeed, bytes32 pkRoot, bytes memory sig)
    {
        string[] memory inputs = _cli("sign", 2);
        inputs[4] = vm.toString(seed);
        inputs[5] = vm.toString(message);
        (pkSeed, pkRoot, sig) = abi.decode(vm.ffi(inputs), (bytes32, bytes32, bytes));
    }

    function _sign(bytes32 seed, bytes32 message) internal returns (bytes memory sig) {
        (,, sig) = _signWithKey(seed, message);
    }
}
