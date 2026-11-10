// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Script.sol";
import {LeanSphincsVerifier} from "../src/LeanSphincsVerifier.sol";
import {ILeanSphincsVerifier} from "../src/ILeanSphincsVerifier.sol";
import {LeanSphincsWalletFactory} from "../src/LeanSphincsWalletFactory.sol";
import {LeanSphincsLedger} from "../src/LeanSphincsLedger.sol";

/// Deploys the verifier, the wallet factory and the pqETC ledger through the CREATE2 deployer at
/// 0x4e59b44847b379578588920ca78fbf26c0b4956c, so the addresses depend only on the code and the salt.
/// Skips any contract that is already deployed.
///
///   forge script script/Deploy.s.sol --rpc-url classic --private-key $(cat key) --broadcast --legacy
contract Deploy is Script {
    bytes32 constant SALT = keccak256("classix.pq-sig.v1");

    function run() external returns (address verifier, address factory, address ledger) {
        bytes memory vInit = type(LeanSphincsVerifier).creationCode;
        verifier = vm.computeCreate2Address(SALT, keccak256(vInit));
        bytes memory fInit = abi.encodePacked(type(LeanSphincsWalletFactory).creationCode, abi.encode(verifier));
        factory = vm.computeCreate2Address(SALT, keccak256(fInit));
        bytes memory lInit = abi.encodePacked(
            type(LeanSphincsLedger).creationCode, abi.encode(verifier, "Post-Quantum ETC", "pqETC")
        );
        ledger = vm.computeCreate2Address(SALT, keccak256(lInit));

        vm.startBroadcast();
        if (verifier.code.length == 0) new LeanSphincsVerifier{salt: SALT}();
        if (factory.code.length == 0) new LeanSphincsWalletFactory{salt: SALT}(ILeanSphincsVerifier(verifier));
        if (ledger.code.length == 0) {
            new LeanSphincsLedger{salt: SALT}(ILeanSphincsVerifier(verifier), "Post-Quantum ETC", "pqETC");
        }
        vm.stopBroadcast();

        console.log("chain id  ", block.chainid);
        console.log("verifier  ", verifier);
        console.log("factory   ", factory);
        console.log("wallet impl", address(LeanSphincsWalletFactory(factory).implementation()));
        console.log("pqETC      ", ledger);
    }
}
