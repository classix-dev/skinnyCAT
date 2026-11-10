// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ILeanSphincsVerifier} from "./ILeanSphincsVerifier.sol";
import {LeanSphincsWallet} from "./LeanSphincsWallet.sol";

/// @title LeanSphincsWalletFactory
/// @notice Deploys one LeanSphincsWallet per leanSPHINCS public key, at an address that depends
///         only on the key, so a wallet can receive ETC before it exists.
contract LeanSphincsWalletFactory {
    LeanSphincsWallet public immutable implementation;

    event WalletCreated(address indexed wallet, bytes32 pkSeed, bytes32 pkRoot);

    constructor(ILeanSphincsVerifier verifier) {
        implementation = new LeanSphincsWallet(verifier, address(this));
    }

    function walletAddress(bytes32 pkSeed, bytes32 pkRoot) public view returns (address) {
        bytes32 h = keccak256(abi.encodePacked(bytes1(0xff), address(this), _salt(pkSeed, pkRoot), keccak256(_cloneCode())));
        return address(uint160(uint256(h)));
    }

    /// @notice Deploy and initialize the wallet for this key, or return it if it exists.
    function createWallet(bytes32 pkSeed, bytes32 pkRoot) public returns (LeanSphincsWallet wallet) {
        address a = walletAddress(pkSeed, pkRoot);
        if (a.code.length != 0) return LeanSphincsWallet(payable(a));
        bytes memory code = _cloneCode();
        bytes32 salt = _salt(pkSeed, pkRoot);
        address deployed;
        assembly ("memory-safe") {
            deployed := create2(0, add(code, 0x20), mload(code), salt)
        }
        require(deployed == a, "create2 failed");
        wallet = LeanSphincsWallet(payable(deployed));
        wallet.initialize(pkSeed, pkRoot);
        emit WalletCreated(deployed, pkSeed, pkRoot);
    }

    /// @notice Create the wallet if needed, then execute a signed call through it. Lets a first-time
    ///         user spend from a funded counterfactual address in one transaction.
    function createAndExecute(
        bytes32 pkSeed,
        bytes32 pkRoot,
        address to,
        uint256 value,
        bytes calldata data,
        uint256 deadline,
        bytes calldata sig
    ) external returns (bytes memory) {
        return createWallet(pkSeed, pkRoot).execute(to, value, data, deadline, sig);
    }

    function _salt(bytes32 pkSeed, bytes32 pkRoot) private pure returns (bytes32) {
        return keccak256(abi.encode(pkSeed, pkRoot));
    }

    /// EIP-1167 minimal proxy creation code for `implementation`.
    function _cloneCode() private view returns (bytes memory) {
        return abi.encodePacked(
            hex"3d602d80600a3d3981f3363d3d373d3d3d363d73", address(implementation), hex"5af43d82803e903d91602b57fd5bf3"
        );
    }
}
