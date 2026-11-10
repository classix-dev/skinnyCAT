// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import {LeanSphincsVerifier} from "../src/LeanSphincsVerifier.sol";
import {LeanSphincsFFI} from "./utils/LeanSphincsFFI.sol";
import {ILeanSphincsVerifier} from "../src/ILeanSphincsVerifier.sol";
import {LeanSphincsLedger} from "../src/LeanSphincsLedger.sol";

/// The demo story. Alice deposits ETC and pays Bob in one transaction. Bob has scETC but no ETC,
/// so his signed transfers go through a relayer, who takes the fee Bob signed for. Bob can
/// withdraw to a fresh address that never held ETC. Signatures come from the TypeScript signer
/// over FFI, a few seconds each.
contract LeanSphincsLedgerTest is LeanSphincsFFI {
    string constant MEMO = "The first quantum-secure transaction on Ethereum Classic, by Classix.dev";

    LeanSphincsLedger ledger;

    bytes32 aliceSeed = keccak256("pq-sig ledger test alice");
    bytes32 bobSeed = keccak256("pq-sig ledger test bob");
    bytes32 aSeed;
    bytes32 aRoot;
    bytes32 bSeed;
    bytes32 bRoot;
    address alice; // ledger accounts, no ECDSA key behind them
    address bob;

    address aliceEoa = makeAddr("alice's browser wallet");
    address relayer = makeAddr("relayer");
    address bobCold = makeAddr("bob's fresh address");
    uint256 deadline;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Memo(address indexed account, uint256 indexed nonce, string memo);
    event FeePaid(address indexed account, address indexed relayer, uint256 fee);

    function setUp() public {
        ledger = new LeanSphincsLedger(
            ILeanSphincsVerifier(address(new LeanSphincsVerifier())), "skinnyCAT ETC", "scETC"
        );
        (aSeed, aRoot) = _keygen(aliceSeed);
        (bSeed, bRoot) = _keygen(bobSeed);
        alice = ledger.accountOf(aSeed, aRoot);
        bob = ledger.accountOf(bSeed, bRoot);
        vm.deal(aliceEoa, 10 ether);
        vm.warp(1_800_000_000);
        deadline = block.timestamp + 1 hours;
    }

    function testMetadata() public view {
        assertEq(ledger.name(), "skinnyCAT ETC");
        assertEq(ledger.symbol(), "scETC");
        assertEq(ledger.decimals(), 18);
    }

    function testAliceAndBob() public {
        // 1. Alice deposits 1 ETC and pays Bob 0.4 scETC in one transaction, with the memo.
        bytes memory sigA =
            _sign(aliceSeed, ledger.transferDigest(alice, 0, bob, 0.4 ether, 0, deadline, MEMO));
        vm.expectEmit(address(ledger));
        emit Transfer(address(0), alice, 1 ether);
        vm.expectEmit(address(ledger));
        emit Transfer(alice, bob, 0.4 ether);
        vm.expectEmit(address(ledger));
        emit Memo(alice, 0, MEMO);
        vm.prank(aliceEoa);
        ledger.transfer{value: 1 ether}(aSeed, aRoot, bob, 0.4 ether, 0, deadline, MEMO, sigA);
        emit log_named_uint("deposit and transfer gas, call frame", vm.lastCallGas().gasTotalUsed);
        assertEq(ledger.balanceOf(alice), 0.6 ether);
        assertEq(ledger.balanceOf(bob), 0.4 ether);
        assertEq(ledger.totalSupply(), 1 ether);
        assertEq(address(ledger).balance, 1 ether);

        // 2. Bob has no ETC. He signs 0.1 scETC back to Alice with a 0.001 fee, and a relayer
        //    with an ordinary account submits it and gets the fee in ETC.
        assertEq(bob.balance, 0);
        bytes memory sigB =
            _sign(bobSeed, ledger.transferDigest(bob, 0, alice, 0.1 ether, 0.001 ether, deadline, "thanks"));
        vm.expectEmit(address(ledger));
        emit FeePaid(bob, relayer, 0.001 ether);
        vm.prank(relayer);
        ledger.transfer(bSeed, bRoot, alice, 0.1 ether, 0.001 ether, deadline, "thanks", sigB);
        emit log_named_uint("relayed transfer gas, call frame", vm.lastCallGas().gasTotalUsed);
        assertEq(relayer.balance, 0.001 ether, "relayer paid in ETC");
        assertEq(ledger.balanceOf(bob), 0.299 ether);
        assertEq(ledger.balanceOf(alice), 0.7 ether);
        assertEq(ledger.totalSupply(), 0.999 ether);

        // The same signature can't run twice.
        vm.expectRevert(LeanSphincsLedger.BadSignature.selector);
        ledger.transfer(bSeed, bRoot, alice, 0.1 ether, 0.001 ether, deadline, "thanks", sigB);

        // 3. Bob withdraws 0.2 ETC to a fresh address that never held anything, again relayed.
        bytes memory sigW =
            _sign(bobSeed, ledger.withdrawDigest(bob, 1, bobCold, 0.2 ether, 0.001 ether, deadline, ""));
        vm.prank(relayer);
        ledger.withdraw(bSeed, bRoot, payable(bobCold), 0.2 ether, 0.001 ether, deadline, "", sigW);
        emit log_named_uint("relayed withdraw gas, call frame", vm.lastCallGas().gasTotalUsed);
        assertEq(bobCold.balance, 0.2 ether);
        assertEq(relayer.balance, 0.002 ether);
        assertEq(ledger.balanceOf(bob), 0.098 ether);
        assertEq(ledger.totalSupply(), 0.798 ether);
        assertEq(address(ledger).balance, ledger.totalSupply(), "fully backed");
    }

    function testRejections() public {
        ledger.deposit{value: 1 ether}(aSeed, aRoot);
        bytes memory sig = _sign(aliceSeed, ledger.transferDigest(alice, 0, bob, 0.4 ether, 0.01 ether, deadline, MEMO));

        // A relayer can't change any field.
        vm.startPrank(relayer);
        vm.expectRevert(LeanSphincsLedger.BadSignature.selector);
        ledger.transfer(aSeed, aRoot, relayer, 0.4 ether, 0.01 ether, deadline, MEMO, sig);
        vm.expectRevert(LeanSphincsLedger.BadSignature.selector);
        ledger.transfer(aSeed, aRoot, bob, 0.5 ether, 0.01 ether, deadline, MEMO, sig);
        vm.expectRevert(LeanSphincsLedger.BadSignature.selector);
        ledger.transfer(aSeed, aRoot, bob, 0.4 ether, 0.02 ether, deadline, MEMO, sig);
        vm.expectRevert(LeanSphincsLedger.BadSignature.selector);
        ledger.transfer(aSeed, aRoot, bob, 0.4 ether, 0.01 ether, deadline + 1, MEMO, sig);
        vm.expectRevert(LeanSphincsLedger.BadSignature.selector);
        ledger.transfer(aSeed, aRoot, bob, 0.4 ether, 0.01 ether, deadline, "by someone else", sig);
        // Bob's key can't spend Alice's signature.
        vm.expectRevert(LeanSphincsLedger.BadSignature.selector);
        ledger.transfer(bSeed, bRoot, bob, 0.4 ether, 0.01 ether, deadline, MEMO, sig);
        // A transfer signature isn't a withdraw signature.
        vm.expectRevert(LeanSphincsLedger.BadSignature.selector);
        ledger.withdraw(aSeed, aRoot, payable(bob), 0.4 ether, 0.01 ether, deadline, MEMO, sig);
        vm.stopPrank();

        // Another chain.
        uint256 chainBefore = vm.getChainId();
        vm.chainId(chainBefore == 61 ? 1 : 61);
        vm.expectRevert(LeanSphincsLedger.BadSignature.selector);
        ledger.transfer(aSeed, aRoot, bob, 0.4 ether, 0.01 ether, deadline, MEMO, sig);
        vm.chainId(chainBefore);

        // After the deadline.
        uint256 t = vm.getBlockTimestamp();
        vm.warp(deadline + 1);
        vm.expectRevert(LeanSphincsLedger.Expired.selector);
        ledger.transfer(aSeed, aRoot, bob, 0.4 ether, 0.01 ether, deadline, MEMO, sig);
        vm.warp(t);

        // Plain ETC sends and zero addresses are refused.
        vm.deal(address(this), 1 ether);
        (bool ok,) = address(ledger).call{value: 1}("");
        assertFalse(ok, "receive reverts");
        vm.expectRevert(LeanSphincsLedger.ZeroAddress.selector);
        ledger.transfer(aSeed, aRoot, address(0), 0.4 ether, 0.01 ether, deadline, MEMO, sig);

        // The real call works.
        ledger.transfer(aSeed, aRoot, bob, 0.4 ether, 0.01 ether, deadline, MEMO, sig);
        assertEq(ledger.balanceOf(bob), 0.4 ether);
    }

    function testInsufficientBalance() public {
        ledger.deposit{value: 0.1 ether}(aSeed, aRoot);
        bytes memory sig = _sign(aliceSeed, ledger.transferDigest(alice, 0, bob, 0.1 ether, 1, deadline, ""));
        vm.expectRevert(LeanSphincsLedger.InsufficientBalance.selector);
        ledger.transfer(aSeed, aRoot, bob, 0.1 ether, 1, deadline, "", sig);
        // Topping up in the same call makes the same signature go through.
        ledger.transfer{value: 1}(aSeed, aRoot, bob, 0.1 ether, 1, deadline, "", sig);
        assertEq(ledger.balanceOf(alice), 0);
    }

    function testDepositTo() public {
        ledger.depositTo{value: 0.5 ether}(bob);
        assertEq(ledger.balanceOf(bob), 0.5 ether);
        vm.expectRevert(LeanSphincsLedger.ZeroAddress.selector);
        ledger.depositTo{value: 1}(address(0));
    }

    receive() external payable {}
}
