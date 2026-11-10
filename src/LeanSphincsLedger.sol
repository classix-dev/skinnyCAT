// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ILeanSphincsVerifier} from "./ILeanSphincsVerifier.sol";

/// @title LeanSphincsLedger
/// @notice Wrapped ETC that only a leanSPHINCS key can move. Deposit ETC to a key, then move it
///         with signed messages that anyone can submit. The submitter collects a fee the key
///         signed for, so the owner needs no ECDSA account at all.
/// @dev Demo project, built for fun, unaudited. Each key is shown to ERC-20 readers as an
///      account address derived from its hash, which no ECDSA key controls. There is no
///      msg.sender-based transfer or approve, since that would bring ECDSA back.
contract LeanSphincsLedger {
    bytes32 public constant TRANSFER_TAG = keccak256("classix.pq-sig.LeanSphincsLedger.transfer.v1");
    bytes32 public constant WITHDRAW_TAG = keccak256("classix.pq-sig.LeanSphincsLedger.withdraw.v1");

    ILeanSphincsVerifier public immutable verifier;
    string public name;
    string public symbol;
    uint8 public constant decimals = 18;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => uint256) public nonces;

    /// ERC-20 event, so explorers and indexers track balances. Deposits come from address(0),
    /// withdrawals go to address(0).
    event Transfer(address indexed from, address indexed to, uint256 value);
    /// A signed note that travels with a transfer or withdrawal.
    event Memo(address indexed account, uint256 indexed nonce, string memo);
    event FeePaid(address indexed account, address indexed relayer, uint256 fee);

    error Expired();
    error BadSignature();
    error InsufficientBalance();
    error SendFailed();
    error UseDeposit();
    error ZeroAddress();

    constructor(ILeanSphincsVerifier verifier_, string memory name_, string memory symbol_) {
        verifier = verifier_;
        name = name_;
        symbol = symbol_;
    }

    /// The scheme byte EIP-8288 gives leanSPHINCS (LEANSPHINCS_SCHEME).
    bytes1 public constant LEANSPHINCS_SCHEME = 0x10;

    /// @notice The ledger account of a leanSPHINCS public key: the last 20 bytes of
    ///         keccak256(0x10 ‖ PK.seed ‖ PK.root), Ethereum's usual address shape, tagged with the
    ///         scheme byte so another scheme's key can't land on the same account.
    function accountOf(bytes32 pkSeed, bytes32 pkRoot) public pure returns (address) {
        return address(uint160(uint256(keccak256(abi.encodePacked(LEANSPHINCS_SCHEME, bytes16(pkSeed), bytes16(pkRoot))))));
    }

    /// @notice Deposit ETC to a key.
    function deposit(bytes32 pkSeed, bytes32 pkRoot) external payable {
        _mint(accountOf(pkSeed, pkRoot), msg.value);
    }

    /// @notice Deposit ETC to a ledger account by its address. ETC sent to an address no key
    ///         hashes to is lost, so prefer `deposit` when you have the key.
    function depositTo(address account) external payable {
        if (account == address(0)) revert ZeroAddress();
        _mint(account, msg.value);
    }

    function transferDigest(
        address from,
        uint256 nonce,
        address to,
        uint256 amount,
        uint256 fee,
        uint256 deadline,
        string calldata memo
    ) public view returns (bytes32) {
        return keccak256(
            abi.encode(
                TRANSFER_TAG, block.chainid, address(this), from, nonce, to, amount, fee, deadline, keccak256(bytes(memo))
            )
        );
    }

    function withdrawDigest(
        address from,
        uint256 nonce,
        address to,
        uint256 amount,
        uint256 fee,
        uint256 deadline,
        string calldata memo
    ) public view returns (bytes32) {
        return keccak256(
            abi.encode(
                WITHDRAW_TAG, block.chainid, address(this), from, nonce, to, amount, fee, deadline, keccak256(bytes(memo))
            )
        );
    }

    /// @notice Move `amount` from the key's account to ledger account `to`, and pay `fee` in ETC
    ///         to whoever submits this. ETC sent with the call is deposited to the key first, so
    ///         a deposit and a signed spend fit in one transaction.
    function transfer(
        bytes32 pkSeed,
        bytes32 pkRoot,
        address to,
        uint256 amount,
        uint256 fee,
        uint256 deadline,
        string calldata memo,
        bytes calldata sig
    ) external payable {
        if (to == address(0)) revert ZeroAddress();
        address from = accountOf(pkSeed, pkRoot);
        if (msg.value != 0) _mint(from, msg.value);
        uint256 nonce = nonces[from];
        bytes32 digest = transferDigest(from, nonce, to, amount, fee, deadline, memo);
        _authorize(pkSeed, pkRoot, from, digest, deadline, amount + fee, sig);
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
        _finish(from, nonce, fee, memo);
    }

    /// @notice Burn `amount` from the key's account and send that much ETC to `to`, and pay
    ///         `fee` in ETC to whoever submits this. ETC sent with the call is deposited first.
    function withdraw(
        bytes32 pkSeed,
        bytes32 pkRoot,
        address payable to,
        uint256 amount,
        uint256 fee,
        uint256 deadline,
        string calldata memo,
        bytes calldata sig
    ) external payable {
        if (to == address(0)) revert ZeroAddress();
        address from = accountOf(pkSeed, pkRoot);
        if (msg.value != 0) _mint(from, msg.value);
        uint256 nonce = nonces[from];
        bytes32 digest = withdrawDigest(from, nonce, to, amount, fee, deadline, memo);
        _authorize(pkSeed, pkRoot, from, digest, deadline, amount + fee, sig);
        totalSupply -= amount;
        emit Transfer(from, address(0), amount);
        _finish(from, nonce, fee, memo);
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert SendFailed();
    }

    receive() external payable {
        revert UseDeposit();
    }

    function _authorize(
        bytes32 pkSeed,
        bytes32 pkRoot,
        address from,
        bytes32 digest,
        uint256 deadline,
        uint256 debit,
        bytes calldata sig
    ) private {
        if (block.timestamp > deadline) revert Expired();
        if (!verifier.verify(pkSeed, pkRoot, digest, sig)) revert BadSignature();
        if (balanceOf[from] < debit) revert InsufficientBalance();
        nonces[from] += 1;
        balanceOf[from] -= debit;
    }

    function _finish(address from, uint256 nonce, uint256 fee, string calldata memo) private {
        if (bytes(memo).length != 0) emit Memo(from, nonce, memo);
        if (fee != 0) {
            totalSupply -= fee;
            emit Transfer(from, address(0), fee);
            emit FeePaid(from, msg.sender, fee);
            (bool ok,) = payable(msg.sender).call{value: fee}("");
            if (!ok) revert SendFailed();
        }
    }

    function _mint(address account, uint256 amount) private {
        totalSupply += amount;
        balanceOf[account] += amount;
        emit Transfer(address(0), account, amount);
    }
}
