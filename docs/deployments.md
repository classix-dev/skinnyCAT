# Deployments

## Ethereum Classic Mainnet

Deployed on 2026-11-16 between 00:48:02 and 00:48:43 UTC with [script/Deploy.s.sol](../script/Deploy.s.sol) at commit `1fb4367`, through the CREATE2 deployer `0x4e59b44847b379578588920ca78fbf26c0b4956c` with the salt `keccak256("classix.skinnycat.v1")`. The addresses depend only on the code and the salt, so they match [web/src/generated/contracts.ts](../web/src/generated/contracts.ts).

| contract | address |
|---|---|
| LeanSphincsVerifier | [`0xafdAC7394b7e73b231bCf364EcB1bcB31F37e13d`](https://etc.blockscout.com/address/0xafdAC7394b7e73b231bCf364EcB1bcB31F37e13d) |
| LeanSphincsWalletFactory | [`0x0b71Aa05c360B7d847739228103D8C1954CbB81b`](https://etc.blockscout.com/address/0x0b71Aa05c360B7d847739228103D8C1954CbB81b) |
| LeanSphincsWallet (implementation) | [`0xBC16025Adf156Cb4f010546c3788Ca03ea220Bc3`](https://etc.blockscout.com/address/0xBC16025Adf156Cb4f010546c3788Ca03ea220Bc3) |
| LeanSphincsLedger (scETC) | [`0x18246174c60D33997A2Dbfe167EE6af4B5cf2909`](https://etc.blockscout.com/address/0x18246174c60D33997A2Dbfe167EE6af4B5cf2909) |

| transaction | block | gas used |
|---|---|---|
| verifier, [`0x4d48355c…0438`](https://etc.blockscout.com/tx/0x4d48355cda00c0142f089dbfbca898001c0b25286b5709ee2ed436ebf26e0438) | 25,742,218 | 659,987 |
| wallet factory and implementation, [`0x2cb0abe1…496a`](https://etc.blockscout.com/tx/0x2cb0abe1045ede7c847faef2c8d9de658add15ec42b4102ca47affde2727496a) | 25,742,221 | 801,094 |
| scETC, [`0x77086f0e…2a6e`](https://etc.blockscout.com/tx/0x77086f0eb6f9e3902ca78c159f48efc2557f0fae86a16bdbb8484f9126302a6e) | 25,742,223 | 875,452 |

Legacy transactions at 1.00001 gwei, 2,336,533 gas in all, about 0.00234 ETC. The deployer `0x1D9B41938e972EAc20c35703571aD607Be0D6dbD` has no rights over any of the contracts. None of them has an owner, an admin, a pause or an upgrade path.

The source isn't verified on Blockscout yet, since that publishes the code.

## First Payment

Sent from skinnycat.classix.dev on 2026-11-16, relayed and paid for by the browser wallet `0x1f546DB9C440818715Ac689f0EBF9F618f5928D7`. Alice's scETC account is `0x849087b169f70ecbb3c29859ded187f6179a5cad` and Bob's is `0x3dcab726fad5f6bc2f004aa83e55757f5084f65f`.

| step | transaction | block | time (UTC) | gas used |
|---|---|---|---|---|
| Alice deposits 0.01 ETC and sends Bob 0.004 scETC, memo "The first payment using a quantum-safe signature on Ethereum Classic, by Classix.dev" | [`0x120ca292…c4ad`](https://etc.blockscout.com/tx/0x120ca292224e17de96101e2ff3f34966a9e601001cc2519a73219bbbf055c4ad) | 25,742,237 | 00:52:16 | 337,467 |
| Bob sends Alice 0.001 scETC for a 0.0015 ETC fee to the relayer, memo "Code is Law" | [`0x22cbcb0c…fa5e`](https://etc.blockscout.com/tx/0x22cbcb0c898ac5a344fe1745bfe194f4e5b83947373318f09e22c88c0c20fa5e) | 25,742,244 | 00:53:18 | 292,748 |
| Bob withdraws 0.0001 ETC to `0x06e909c2Ad640400D0Bf66c32a7310E6af5FC400` for a 0.00001 ETC fee | [`0xdf35e65f…9c08`](https://etc.blockscout.com/tx/0xdf35e65fb5774a9e7eaaafa07e47dcb21ee45b98a2fb14c64b334b1446e69c08) | 25,742,255 | 00:55:29 | 302,407 |

Afterwards Alice holds 0.007 scETC and Bob 0.00139, and the contract holds 0.00839 ETC, equal to the scETC supply.
