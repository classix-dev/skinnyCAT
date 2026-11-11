# Plan

The target is a leanSPHINCS-authorized transaction on ETC mainnet, then a public web app at skinnycat.classix.dev where anyone can make one. It's an educational demo, not a production app, and the site says so. The design is in [README.md](README.md).

## What ETC Supports Today

We checked Core-Geth's `params/config_classic.go` and queried the chain on 2026-11-10.

| | ETC mainnet |
|---|---|
| latest fork | Spiral (block 19,250,000) |
| EVM target | Shanghai, no withdrawals |
| `PUSH0`, `CREATE2` | yes |
| `MCOPY`, `TSTORE`, `TLOAD`, blobs | no |
| tx types | 0 and 1 (no 1559, no 7702) |
| block gas limit | 8,000,000 |
| gas price | about 3.95 gwei |
| CREATE2 deployer `0x4e59b448...956c` | present |
| ERC-4337 EntryPoint | not assumed |

Calldata costs 16 gas per non-zero byte (EIP-2028, Phoenix). ETC has no EIP-7623 calldata floor. The Daisugi workshop verifier needs Cancun because it uses `MCOPY` twice. It won't run on ETC as compiled. The EthLib-spec verifier we use needs no Cancun opcodes, so this doesn't block us.

## Milestones

### M0. Repo and Toolchain

Done 2026-11-10. Foundry with `evm_version = "shanghai"`, a Nix flake pinned to a nixpkgs revision where Foundry builds, and a script that checks every contract's bytecode for opcodes Spiral doesn't have.

### M1. Contracts

Done 2026-11-10, on the 2026-11-03 version of the spec.

- scETC ([src/LeanSphincsLedger.sol](src/LeanSphincsLedger.sol)), the main contract. ETC deposited to a leanSPHINCS key, moved by signed messages anyone can relay for a fee the key signs, with a deposit and a spend in one transaction and a signed memo emitted as an event. Accounts are `keccak256(0x10 ‖ PK.seed ‖ PK.root)[12:]`. Its tests follow the demo, where Alice pays Bob and Bob, holding no ETC, pays back through a relayer and withdraws to a fresh address.
- A contract wallet and its `CREATE2` factory ([src/LeanSphincsWallet.sol](src/LeanSphincsWallet.sol)), for keys that need to call other contracts.

### M2. Signer

Done 2026-11-10 in [signer](signer), a TypeScript signer the CLI, the tests and the web app share, checked byte for byte against EthLib's vectors. About 3.5 s per signature in Node and 1.2 s in a browser worker.

### M3. The Current Spec

Done 2026-11-10. 25 Foundry tests and 44 signer tests pass, every EthLib vector matches byte for byte, and a verify costs about 86,000 gas. EthLib moved leanSPHINCS to the FIPS 205 hash layout on 2026-11-08 ([#1555](https://github.com/ethereum/EthLib/commit/dce7a2de23a973d84eac38126a1527763cd3465d)), and no EVM verifier existed for it. We write [src/LeanSphincsVerifier.sol](src/LeanSphincsVerifier.sol), move the signer to the new layout, and check both against EthLib's new vectors. [README.md](README.md#why-we-follow-the-current-spec) gives the reasons.

### M4. Mainnet Deploy and the First Transaction

Deploy the verifier, scETC and the wallet factory through the CREATE2 deployer. Then Alice deposits ETC and sends scETC to Bob in one transaction, with the memo "The first payment using a quantum-secure signature on Ethereum Classic, by Classix.dev". Then Bob pays back through a relayer and withdraws to a fresh address. Addresses and transaction hashes go in `docs/deployments.md`.

It's waiting on about 0.01 ETC for the deployer `0x1D9B41938e972EAc20c35703571aD607Be0D6dbD`. At 1 gwei the deploys and the demo come to about 0.004 ETC. The etchd signer can't fund it, since its policy only signs zero-value calls to the anchor contract.

### M5. skinnycat.classix.dev

Live since 2026-11-11, built in [web](web) with React, Tailwind and Vite, pre-rendered at build time and then hydrated. It has its own blue look, a "by Classix" mark as on etchd and Triforce, and a title that doesn't call it a wallet. The intro says what skinnyCAT does and that it's an educational demo, not a production app. We cut the page's text to a minimum on 2026-11-11, and the long explanations live in [docs](docs).

Until scETC is on mainnet the site shows a "Not on mainnet yet" state. Keys and Sign Only work, balances read 0 and sending is off. Once the contracts have code it works with no rebuild.

The flow follows the [Devcon workshop](https://github.com/alessandrobaiocchi/Devcon_Workshop), with Alice and Bob on one page.

1. Make two leanSPHINCS keys in the browser, Alice and Bob. Each backs up as a 24-word BIP-39 phrase that encodes its 32-byte seed. We ruled out deriving the seed from an ECDSA wallet signature, because a quantum attacker who recovers the ECDSA key could recompute the seed.
2. Alice deposits ETC from a browser wallet and pays Bob in one transaction, with a message in a text box.
3. Bob, who holds no ETC, signs a payment back, and the browser wallet relays it for Bob's fee.
4. Each step shows the signature, the local and on-chain checks, the receipt and a Blockscout link.

On load the page checks the deployed verifier's code hash and runs EthLib vectors through its own verifier. It's a static site with no backend, served by the Cloudflare Worker `skinnycat` with static assets on the classix.dev zone, and it reads the chain through rpc.classix.dev. A table of contents sits under the hero. Below the demo come How It Works, a leanSPHINCS explainer in a Like I'm Five and a detailed version, key degradation with a slider from 2^16 to 2^40 signatures, a step-through comparison of today's meta-transaction with an EIP-8141 frame transaction, sponsored by a paymaster or paid by Bob, and frame transactions ([EIP-8141](https://eips.ethereum.org/EIPS/eip-8141)), aggregation ([EIP-8288](https://eips.ethereum.org/EIPS/eip-8288)) and the current limitations.

Testing, as of 2026-11-11.

- 138 Vitest unit tests with Testing Library and axe.
- An end-to-end run (`npm run test:e2e`) against anvil as chain 61 on Shanghai rules. It deploys with the real script, drives the whole Alice and Bob story in Playwright, fails on any console error or hydration warning, and checks the layout at six widths from 320 to 1440 px. From 768 px up Alice and Bob sit side by side.
- Lighthouse on the live site scores 100 for accessibility, best practices and SEO, 100 for desktop performance and 90 to 92 for mobile performance.

### M6. Write-Up

A post for classix.dev covering what we did and how to check it, crediting the sources in [README.md](README.md). Publishing it needs istora's go.

## Gas and Cost

Measured in Foundry. The current-spec verifier adds about 4,000 gas per verify over the 2026-11-03 one these were taken with.

| step | gas | ETC at 1 gwei |
|---|---|---|
| deploy verifier, scETC and wallet factory | about 2,200,000 | about 0.0022 |
| Alice deposits and pays Bob in one transaction | 333,000 | 0.00033 |
| a relayed scETC transfer | 289,000 | 0.00029 |
| a relayed withdrawal | 298,000 | 0.0003 |

Most of a send is the 7,740-byte signature, about 124,000 gas of calldata, and its verification, about 86,000. Everything fits well inside the 8,000,000 gas block limit.

## Open Questions

- Who funds the mainnet deployer, and from which key.
- Whether we verify contract source on Blockscout. That publishes the code, so we ask istora first. This repo stays private until istora says otherwise.
- leanSPHINCS isn't final. A new version means a new verifier and a new scETC, and we don't plan upgradeable contracts.
- Whether "first" holds. The claim is the first quantum-secure signature on ETC, not the first quantum-secure transaction, since hash-preimage locks exist. We haven't found an earlier post-quantum signature verified on ETC, but we haven't searched the chain. The memo wording needs istora's confirmation before the mainnet transaction.
- Audit. None of this is audited. The site says so and suggests tiny amounts only.
