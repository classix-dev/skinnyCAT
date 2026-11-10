// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import {LeanSphincsLayeredAsm} from "../src/vendor/LeanSphincs-LayeredAsm.sol";
import {ILeanSphincsVerifier} from "../src/ILeanSphincsVerifier.sol";
import {LeanSphincsWallet} from "../src/LeanSphincsWallet.sol";
import {LeanSphincsWalletFactory} from "../src/LeanSphincsWalletFactory.sol";

/// Signatures come from the Python reference signer over FFI (a few seconds each), so each test
/// signs as little as it can and reuses one signature for the rejection cases.
contract LeanSphincsWalletTest is Test {
    string constant SIGNER = "script/vendor/leansphincs_layered_signer.py";

    ILeanSphincsVerifier verifier;
    LeanSphincsWalletFactory factory;

    bytes32 seed = keccak256("pq-sig wallet test seed");
    bytes32 pkSeed;
    bytes32 pkRoot;
    address payable predicted;

    address relayer = makeAddr("relayer");
    address recipient = makeAddr("recipient");
    uint256 deadline;

    function setUp() public {
        verifier = ILeanSphincsVerifier(address(new LeanSphincsLayeredAsm()));
        factory = new LeanSphincsWalletFactory(verifier);
        (pkSeed, pkRoot) = _keygen(seed);
        predicted = payable(factory.walletAddress(pkSeed, pkRoot));
        vm.deal(predicted, 1 ether);
        vm.warp(1_800_000_000);
        deadline = block.timestamp + 1 days;
    }

    // ------------------------------------------------------------------
    // Happy path
    // ------------------------------------------------------------------

    function testFirstTransferFromCounterfactualWallet() public {
        assertEq(predicted.code.length, 0, "not deployed yet");
        bytes memory sig = _signCall(predicted, recipient, 0.1 ether, "", 0);

        vm.prank(relayer);
        factory.createAndExecute(pkSeed, pkRoot, recipient, 0.1 ether, "", deadline, sig);
        emit log_named_uint("createAndExecute gas, call frame", vm.lastCallGas().gasTotalUsed);

        LeanSphincsWallet w = LeanSphincsWallet(predicted);
        assertGt(predicted.code.length, 0, "deployed");
        assertEq(recipient.balance, 0.1 ether, "recipient paid");
        assertEq(predicted.balance, 0.9 ether, "wallet debited");
        assertEq(w.nonce(), 1, "nonce");
        assertEq(w.pkSeed(), pkSeed);
        assertEq(w.pkRoot(), pkRoot);
    }

    function testSecondTransferGas() public {
        LeanSphincsWallet w = factory.createWallet(pkSeed, pkRoot);
        bytes memory sig0 = _signCall(predicted, recipient, 0.1 ether, "", 0);
        w.execute(recipient, 0.1 ether, "", deadline, sig0);

        bytes memory sig1 = _signCall(predicted, recipient, 0.2 ether, "", 1);
        vm.prank(relayer);
        w.execute(recipient, 0.2 ether, "", deadline, sig1);
        emit log_named_uint("execute gas, second transfer, call frame", vm.lastCallGas().gasTotalUsed);
        assertEq(recipient.balance, 0.3 ether);
        assertEq(w.nonce(), 2);
    }

    // ------------------------------------------------------------------
    // Rejections, all from one valid signature
    // ------------------------------------------------------------------

    function testRejections() public {
        LeanSphincsWallet w = factory.createWallet(pkSeed, pkRoot);
        bytes memory sig = _signCall(predicted, recipient, 0.1 ether, "", 0);

        // The relayer can't change any field of the call.
        vm.expectRevert(LeanSphincsWallet.BadSignature.selector);
        w.execute(relayer, 0.1 ether, "", deadline, sig);
        vm.expectRevert(LeanSphincsWallet.BadSignature.selector);
        w.execute(recipient, 0.2 ether, "", deadline, sig);
        vm.expectRevert(LeanSphincsWallet.BadSignature.selector);
        w.execute(recipient, 0.1 ether, hex"00", deadline, sig);
        vm.expectRevert(LeanSphincsWallet.BadSignature.selector);
        w.execute(recipient, 0.1 ether, "", deadline + 1, sig);

        // A tampered signature fails.
        bytes memory bad = bytes.concat(sig);
        bad[100] ^= 0x01;
        vm.expectRevert(LeanSphincsWallet.BadSignature.selector);
        w.execute(recipient, 0.1 ether, "", deadline, bad);

        // Another chain (ETH is 1, Mordor 63) rejects an ETC signature.
        uint256 chainBefore = vm.getChainId();
        vm.chainId(chainBefore == 61 ? 63 : 61);
        vm.expectRevert(LeanSphincsWallet.BadSignature.selector);
        w.execute(recipient, 0.1 ether, "", deadline, sig);
        vm.chainId(chainBefore);

        // After the deadline.
        uint256 t = vm.getBlockTimestamp();
        vm.warp(deadline + 1);
        vm.expectRevert(LeanSphincsWallet.Expired.selector);
        w.execute(recipient, 0.1 ether, "", deadline, sig);
        vm.warp(t);

        // It works once, and only once.
        vm.prank(relayer);
        w.execute(recipient, 0.1 ether, "", deadline, sig);
        vm.expectRevert(LeanSphincsWallet.BadSignature.selector);
        w.execute(recipient, 0.1 ether, "", deadline, sig);
        assertEq(recipient.balance, 0.1 ether);
    }

    function testSignatureForOneWalletFailsOnAnother() public {
        // A second factory gives the same key a second wallet address.
        LeanSphincsWalletFactory other = new LeanSphincsWalletFactory(verifier);
        LeanSphincsWallet w2 = other.createWallet(pkSeed, pkRoot);
        vm.deal(address(w2), 1 ether);
        bytes memory sig = _signCall(predicted, recipient, 0.1 ether, "", 0);
        vm.expectRevert(LeanSphincsWallet.BadSignature.selector);
        w2.execute(recipient, 0.1 ether, "", deadline, sig);
    }

    function testRevertedCallKeepsNonce() public {
        LeanSphincsWallet w = factory.createWallet(pkSeed, pkRoot);
        bytes memory sig = _signCall(predicted, recipient, 5 ether, "", 0);
        vm.expectRevert(abi.encodeWithSelector(LeanSphincsWallet.CallFailed.selector, ""));
        w.execute(recipient, 5 ether, "", deadline, sig);
        assertEq(w.nonce(), 0);
        // Funded later, the same signature goes through.
        vm.deal(address(w), 5 ether);
        w.execute(recipient, 5 ether, "", deadline, sig);
        assertEq(recipient.balance, 5 ether);
    }

    // ------------------------------------------------------------------
    // Setup and access control, no signatures
    // ------------------------------------------------------------------

    function testCreateWalletIsIdempotentAndPredictable() public {
        LeanSphincsWallet a = factory.createWallet(pkSeed, pkRoot);
        LeanSphincsWallet b = factory.createWallet(pkSeed, pkRoot);
        assertEq(address(a), address(b));
        assertEq(address(a), predicted);
        assertEq(address(a).balance, 1 ether, "pre-funded balance kept");
    }

    function testOnlyFactoryInitializes() public {
        LeanSphincsWallet w = factory.createWallet(pkSeed, pkRoot);
        vm.expectRevert(LeanSphincsWallet.NotFactory.selector);
        w.initialize(bytes32(uint256(1) << 128), bytes32(uint256(1) << 128));

        LeanSphincsWallet impl = factory.implementation();
        vm.prank(address(factory));
        vm.expectRevert(LeanSphincsWallet.AlreadyInitialized.selector);
        impl.initialize(pkSeed, pkRoot);
    }

    function testImplementationCannotExecute() public {
        LeanSphincsWallet impl = factory.implementation();
        vm.expectRevert(); // the all-ones key is not canonical, the verifier reverts
        impl.execute(recipient, 0, "", deadline, new bytes(7740));
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    function _signCall(address payable wallet, address to, uint256 value, bytes memory data, uint256 nonce_)
        internal
        returns (bytes memory sig)
    {
        bytes32 m = keccak256(
            abi.encode(
                keccak256("classix.pq-sig.LeanSphincsWallet.execute.v1"),
                block.chainid,
                wallet,
                nonce_,
                to,
                value,
                keccak256(data),
                deadline
            )
        );
        if (wallet.code.length != 0) {
            assertEq(m, LeanSphincsWallet(wallet).messageHash(to, value, data, nonce_, deadline), "messageHash");
        }
        string[] memory inputs = new string[](5);
        inputs[0] = "python3";
        inputs[1] = SIGNER;
        inputs[2] = "sign";
        inputs[3] = vm.toString(seed);
        inputs[4] = vm.toString(m);
        (bytes32 s, bytes32 r, bytes memory out) = abi.decode(vm.ffi(inputs), (bytes32, bytes32, bytes));
        assertEq(s, pkSeed);
        assertEq(r, pkRoot);
        sig = out;
    }

    function _keygen(bytes32 seed_) internal returns (bytes32 s, bytes32 r) {
        string[] memory kg = new string[](4);
        kg[0] = "python3";
        kg[1] = SIGNER;
        kg[2] = "keygen";
        kg[3] = vm.toString(seed_);
        bytes memory pk = vm.ffi(kg); // root ‖ P
        require(pk.length == 32, "keygen output");
        assembly {
            let w := mload(add(pk, 0x20))
            r := shl(128, shr(128, w))
            s := shl(128, w)
        }
    }
}
