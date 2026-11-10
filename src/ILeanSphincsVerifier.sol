// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice The leanSPHINCS verifier interface (EthLib spec, Keccak-256, 7,740-byte signatures).
///         `pkSeed` is P ‖ 0^16 and `pkRoot` is root ‖ 0^16. Reverts on a malformed key or a
///         signature of the wrong length, returns false on an invalid signature.
interface ILeanSphincsVerifier {
    function verify(bytes32 pkSeed, bytes32 pkRoot, bytes32 message, bytes calldata sig)
        external
        pure
        returns (bool);
}
