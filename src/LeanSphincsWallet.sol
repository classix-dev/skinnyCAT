// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ILeanSphincsVerifier} from "./ILeanSphincsVerifier.sol";

/// @title LeanSphincsWallet
/// @notice A wallet whose only owner check is a leanSPHINCS signature. Anyone can submit a signed
///         call and pay its gas. The submitter's own key has no power over the wallet.
/// @dev Deployed as EIP-1167 clones by LeanSphincsWalletFactory, which initializes each clone in
///      the same call that creates it. Runs on Spiral (Shanghai without withdrawals).
contract LeanSphincsWallet {
    /// Domain tag for the signed message. Bump the version if the message layout changes.
    bytes32 public constant EXECUTE_TAG = keccak256("classix.skinnycat.LeanSphincsWallet.execute.v1");

    ILeanSphincsVerifier public immutable verifier;
    address public immutable factory;

    bytes32 public pkSeed;
    bytes32 public pkRoot;
    uint256 public nonce;

    event Initialized(bytes32 pkSeed, bytes32 pkRoot);
    event Executed(uint256 indexed nonce, address indexed to, uint256 value, bytes32 dataHash);

    error NotFactory();
    error AlreadyInitialized();
    error BadKey();
    error Expired();
    error BadSignature();
    error CallFailed(bytes returnData);

    constructor(ILeanSphincsVerifier verifier_, address factory_) {
        verifier = verifier_;
        factory = factory_;
        // Lock the implementation itself. Clones have their own (empty) storage.
        pkRoot = bytes32(type(uint256).max);
    }

    function initialize(bytes32 pkSeed_, bytes32 pkRoot_) external {
        if (msg.sender != factory) revert NotFactory();
        if (pkRoot != 0) revert AlreadyInitialized();
        if (pkRoot_ == 0) revert BadKey();
        pkSeed = pkSeed_;
        pkRoot = pkRoot_;
        emit Initialized(pkSeed_, pkRoot_);
    }

    /// @notice The 32-byte message a leanSPHINCS key signs to authorize one call.
    function messageHash(address to, uint256 value, bytes calldata data, uint256 nonce_, uint256 deadline)
        public
        view
        returns (bytes32)
    {
        return keccak256(
            abi.encode(EXECUTE_TAG, block.chainid, address(this), nonce_, to, value, keccak256(data), deadline)
        );
    }

    /// @notice Make one call authorized by a leanSPHINCS signature over `messageHash`.
    /// @dev The nonce moves before the call, so the call can't replay the same signature. A
    ///      failed call reverts the whole transaction, nonce included.
    function execute(address to, uint256 value, bytes calldata data, uint256 deadline, bytes calldata sig)
        external
        returns (bytes memory ret)
    {
        if (block.timestamp > deadline) revert Expired();
        uint256 n = nonce;
        bytes32 m = messageHash(to, value, data, n, deadline);
        if (!verifier.verify(pkSeed, pkRoot, m, sig)) revert BadSignature();
        nonce = n + 1;
        emit Executed(n, to, value, keccak256(data));
        bool ok;
        (ok, ret) = to.call{value: value}(data);
        if (!ok) revert CallFailed(ret);
    }

    receive() external payable {}
}
