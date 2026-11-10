# pq-sig

The goal is the first quantum-secure transaction on Ethereum Classic, signed with leanSPHINCS, a stateless hash-based signature from the SPHINCS+ family. Then we want anyone to be able to make their own through a web app at pq.classix.dev.

This is a demo project, built for fun. It's unaudited research code, so don't put more ETC in it than you're happy to lose.

## The Approach

ETC has no account abstraction and no [EIP-7702](https://eips.ethereum.org/EIPS/eip-7702). Core-Geth's classic config stops at Spiral, which is Shanghai without withdrawals, so there's no `MCOPY`, no transient storage and no type 2 transaction (see `params/config_classic.go` in Core-Geth). We checked what the chain runs today and designed for that.

What ETC does have is an EVM, Keccak and `CREATE2`. A smart contract wallet holds the funds. Its only owner check is a leanSPHINCS signature, verified on chain by a Solidity contract. Anyone can submit the signed call from any account and pay the gas, and the submitter's ECDSA key can't move the wallet's funds. A quantum computer that breaks every ECDSA key on the chain still can't spend from the wallet without breaking Keccak.

No fork is needed. The verifier is ordinary contract code.

The wallet's address is derived with `CREATE2` from its public key, so it can receive ETC before it exists. The signed message binds the chain ID, the wallet address, a nonce and the call (target, value, calldata hash), so a signature can't be replayed on ETH, on Mordor or against another wallet.

## The Scheme

We use leanSPHINCS as [EthLib](https://github.com/ethereum/EthLib/pull/152) specifies it in Lean (merged 2026-11-03). It's Tom Wambsgans' layered construction from [sphincs.art](https://sphincs.art), with Keccak-256 as the hash.

| | |
|---|---|
| hash | Keccak-256, outputs truncated to 16 bytes |
| structure | FORS (24 trees of height 10) under a three-layer hypertree (10 + 8 + 8) with WOTS+C one-time keys |
| public key | 32 bytes |
| signature | 7,740 bytes |
| lifetime | 2^30 signatures per key, no state kept by the signer |
| verification | 466 Keccak calls, 82,217 gas in Foundry |

The verifier is `LeanSphincsLayeredAsm` from [nconsigny/SPHINCS-](https://github.com/nconsigny/SPHINCS-) at commit [`4c76aaf`](https://github.com/nconsigny/SPHINCS-/commit/4c76aaf113d326df9adede63d015f3b394ab84f4), vendored unchanged in [src/vendor](src/vendor). Compiled for Shanghai it passes all 34 of its upstream tests here, including EthLib's own vectors and a fresh signature from the Python reference signer. Its runtime bytecode contains no Cancun opcodes.

The [leanSphincs](https://github.com/leanEthereum/leanSphincs) competition run by the Lean Ethereum project hasn't picked a final scheme yet. If the parameters change, we deploy a new verifier and new wallets point at it. Nothing here is audited.

## Current Limitations

The funds are quantum-secure, but the account that submits the transaction isn't. ETC has no way for a contract to pay its own gas, so an ordinary ECDSA account has to submit every call and pay for it. A quantum attacker who breaks that account can spend its gas money and nothing else. They can't move ETC out of the wallet, change the call, or replay the signature, because the wallet checks the leanSPHINCS signature over all of it. They could only delay a call by refusing to submit it, and anyone else can submit it.

Ethereum's answer is the frame transaction, [EIP-8141](https://eips.ethereum.org/EIPS/eip-8141), a draft from 2026-01-29 with transaction type `0x06`. Its abstract says it

> Adds a new transaction whose validity and gas payment can be defined abstractly.

The account's own code checks the signature in a VERIFY frame and approves the gas payment with a new `APPROVE` opcode, so no ECDSA key is involved at all. The [Devcon workshop](https://github.com/alessandrobaiocchi/Devcon_Workshop) sends exactly that kind of leanSPHINCS transaction on the Daisugi research testnet. ETC would need an ECIP and a hard fork to get frame transactions. Until then, a contract wallet with an ECDSA gas payer is what ETC supports.

Other limits today:

- Nothing here is audited, including the vendored verifier.
- Each signature is 7,740 bytes, so a send costs about 265,000 gas, around 13 times a plain transfer.
- leanSPHINCS isn't final. A new parameter set means a new verifier and new wallets.
- The web app keeps the key in the browser's local storage, which suits small amounts only.

## Status

As of 2026-11-10 the wallet contracts, a TypeScript signer, a command-line send script and the pq.classix.dev app are built and tested on a local chain. Next is the mainnet deploy and the first transaction. We skip Mordor. Milestones, gas figures and open questions are in [PLAN.md](PLAN.md).

## Building

Tools come from the Nix flake (Foundry, solc, Python with pycryptodome for the reference signer).

```sh
git clone --recurse-submodules git@github.com:classix-dev/pq-sig.git
cd pq-sig
nix develop
forge build
forge test
```

## Credits

This builds on other people's work.

- [SPHINCS-](https://github.com/nconsigny/SPHINCS-) by Nicolas Consigny (MIT). The leanSPHINCS verifier, its tests and the Python reference signer are vendored from it. Its [write-up on ethresear.ch](https://ethresear.ch/t/sphincs-minus-efficient-stateless-post-quantum-signature-verification-on-the-evm/25165) covers the EVM side.
- [sphincs.art](https://sphincs.art) by Tom Wambsgans, the leanSPHINCS exploration. The spec note and the Lean 4 security proofs are in [TomWambsgans/sphincs.art](https://github.com/TomWambsgans/sphincs.art).
- [EthLib](https://github.com/ethereum/EthLib/pull/152), whose Lean module is the normative leanSPHINCS spec we follow.
- [Devcon_Workshop](https://github.com/alessandrobaiocchi/Devcon_Workshop) by Alessandro Baiocchi, the Devcon 8 workshop that sends a leanSPHINCS-signed transaction on the Daisugi testnet. pq.classix.dev follows its flow. Its verifier is `SphincsVerifier_v2` from [RivaLabs-Core/Post-Quantum-AA-Infra](https://github.com/RivaLabs-Core/Post-Quantum-AA-Infra/blob/6078fd9306be250dfd12d3b9e57c56688b856a85/src/Verifiers/SphincsVerifier_v2.sol) at commit `6078fd93`.
- The [leanSphincs](https://github.com/leanEthereum/leanSphincs) competition from the Lean Ethereum project.
