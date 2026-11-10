# Plan

The target is a leanSPHINCS-authorized transaction on ETC mainnet, then a public web app at pq.classix.dev where anyone can make one. istora asked on 2026-11-10 for this to run on mainnet in production. Mordor comes first as the rehearsal. The design is in [README.md](README.md).

## What ETC Supports Today

We checked Core-Geth's `params/config_classic.go` and `config_mordor.go` and queried both chains on 2026-11-10.

| | ETC mainnet | Mordor |
|---|---|---|
| latest fork | Spiral (block 19,250,000) | Spiral (block 9,957,000) |
| EVM target | Shanghai, no withdrawals | same |
| `PUSH0`, `CREATE2` | yes | yes |
| `MCOPY`, `TSTORE`, `TLOAD`, blobs | no | no |
| tx types | 0 and 1 (no 1559, no 7702) | same |
| block gas limit | 8,000,000 | 8,000,000 |
| gas price | about 3.95 gwei | 1 gwei |
| CREATE2 deployer `0x4e59b448...956c` | present | present |
| ERC-4337 EntryPoint | not assumed | not assumed |

Calldata costs 16 gas per non-zero byte (EIP-2028, Phoenix). ETC has no EIP-7623 calldata floor. The Daisugi workshop verifier needs Cancun because it uses `MCOPY` twice. It won't run on ETC as compiled. The EthLib-spec verifier we use needs no Cancun opcodes, so this doesn't block us.

## Milestones

### M0. Repo and Toolchain

Done 2026-11-10. Foundry with `evm_version = "shanghai"`, a Nix flake pinned to a nixpkgs revision where Foundry builds, and the vendored verifier passing its 34 upstream tests.

### M1. Wallet Contracts

Done 2026-11-10. 8 tests in [test/LeanSphincsWallet.t.sol](test/LeanSphincsWallet.t.sol) pass with signatures from the Python signer.

- `LeanSphincsWallet` holds the 32-byte public key, a verifier address and a nonce. `execute(to, value, data, sig)` checks the signature over `keccak256(abi.encode(tag, chainid, wallet, nonce, to, value, keccak256(data)))`, bumps the nonce and makes the call. Anyone can submit it.
- `LeanSphincsWalletFactory` deploys wallets as EIP-1167 clones with `CREATE2`, salted by the public key, and initializes them in the same call so nobody can front-run the key setup.
- Tests sign with the Python reference signer over FFI. They cover a valid transfer, replay, wrong chain, wrong wallet, tampering, and calls from a third party.
- A script checks the runtime bytecode of every contract for opcodes Spiral doesn't have.

### M2. Signer

Done 2026-11-10 in [signer](signer). 44 tests pass, about 3.5 s per signature in Node and about 1.2 s in a browser worker.

A TypeScript leanSPHINCS signer, ported from the Python reference and checked byte for byte against EthLib's vectors and the KAT fixture. The CLI and the web app both use it. The Python signer stays as the cross-check.

### M3. First Transaction on Mordor

[script/pq-send.sh](script/pq-send.sh) does it from the command line and works on a local Shanghai anvil. The deploy dry run puts the verifier at `0x14e305EF06959B2317AaB31e6cc8749d41FC8C04` and the factory at `0x3e770624D601F6F6e5D7258ad83AC84927181139`. Waiting on Mordor ETC for the deployer `0x0797c50015a94e79d7713fcFa9165f228E2bB5e8`. The faucet at faucet.etcmc-monitor.org took our claim on 2026-11-10 but hasn't paid any claim since 2026-08-08, and the GHOST faucet needs a captcha.

Deploy the verifier and factory through the CREATE2 deployer so the addresses match on Mordor and mainnet. Create a wallet, fund it from a Mordor faucet, and send ETC out of it with a leanSPHINCS signature. Record addresses and transaction hashes in `docs/deployments.md`.

### M4. pq.classix.dev

Built in [web](web), with a Playwright test of the whole flow against a local anvil. Not deployed yet. It goes live once M3 puts the contracts on Mordor.

A static web app in Classix branding, modeled on the flow of the [Devcon workshop](https://github.com/alessandrobaiocchi/Devcon_Workshop).

1. Generate a leanSPHINCS key in the browser and show the backup.
2. Show the counterfactual wallet address so the user can fund it.
3. Connect any injected web3 wallet (EIP-6963 discovery) on chain 61 or 63.
4. Sign the transfer with leanSPHINCS in a Web Worker, verify it locally and with `eth_call`, then have the web3 wallet submit `execute`. On first use the same transaction creates the wallet through the factory.
5. Show the receipt and a Blockscout link.

On load the page runs self-tests against the EthLib vectors and checks the deployed verifier's code hash, as the workshop does. It's served as a Cloudflare Worker with static assets on the classix.dev zone, like the other Classix static sites. It runs on Mordor until M5.

### M5. Mainnet

Deploy the verifier and factory at the same CREATE2 addresses on chain 61, make the first quantum-secure transaction, and switch pq.classix.dev to mainnet with Mordor as an option. This spends real ETC from a funded deployer, so we confirm with istora which key pays before it runs.

### M6. Write-Up

A post for classix.dev covering what we did and how to check it, crediting the sources in [README.md](README.md). Publishing it needs istora's go.

## Gas and Cost Estimates

These are estimates from the Foundry measurement and EVM pricing. M1 replaces them with measured numbers.

| step | gas | ETC at 3.95 gwei |
|---|---|---|
| deploy verifier (3.3 KB runtime) | about 760,000 | about 0.003 |
| deploy factory and wallet implementation | about 600,000 | about 0.0024 |
| first send, wallet created in the same tx | 395,000 (measured on anvil) | about 0.0016 |
| later sends | about 265,000 | about 0.0011 |

A transfer breaks down like this.

- 21,000 base
- about 124,000 for the 7,740-byte signature in calldata
- about 82,000 for verification
- 22,100 for the first nonce write, 5,000 after
- 11,600 for the value call, plus 25,000 if the recipient is a new account

Everything fits well inside the 8,000,000 gas block limit.

## Open Questions

- Who funds the mainnet deployer, and from which key. We ask istora before M5.
- How users back up keys. EthLib's secret key is a 32-byte seed. A BIP-39 phrase that encodes it is the likely choice. We rule out deriving the seed from an ECDSA wallet signature, because a quantum attacker who recovers the ECDSA key could recompute the seed.
- Whether we verify contract source on Blockscout. That publishes the code, so we ask istora first. This repo stays private until istora says otherwise.
- The leanSPHINCS parameters aren't final. The leanSphincs competition hasn't run yet. We think new verifiers and wallets per parameter set are enough, and we don't plan upgradeable wallets.
- Whether "first" holds. We haven't found an earlier hash-based signature transaction on ETC, but we haven't searched the chain.
- Audit. The verifier is unaudited research code and so is ours. pq.classix.dev should say so and cap what it suggests people move.
