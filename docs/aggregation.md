# Aggregation

The long version of the aggregation section on skinnycat.classix.dev, and the source for the README and the skinnyCAT post. EIP details are from the drafts as of 2026-11-10.

A leanSPHINCS signature is 7,740 bytes, about 119 times an ECDSA signature. On ETC today each one costs about 123,000 gas of calldata and 86,000 gas to verify. Aggregation is how Ethereum plans to make that cost go away, and none of it works on ETC yet.

## The Plan on Ethereum

[EIP-8288](https://eips.ethereum.org/EIPS/eip-8288), "In-mempool signature and proof aggregation", is a draft by Vitalik Buterin and Thomas Coratger from 2026-06-03. It states the problem like this.

> Current proposals for hash-based signatures are in the range of ~2-3 kB and ~150,000 to 200,000 gas to verify.

Its answer is that the signatures never reach the chain. Instead

> the block contains one single recursive STARK that proves their existence

Step by step.

1. A transaction doesn't carry its leanSPHINCS signature as calldata. It names it in a dependency frame, a new [EIP-8141](https://eips.ethereum.org/EIPS/eip-8141) frame mode, as a triple of the scheme byte (`0x10` for leanSPHINCS), the hash that was signed and the 32-byte public key.
2. The user sends the transaction to the mempool with its signature alongside, outside the transaction itself.
3. Every second, mempool nodes check the signatures they've seen and fold them into one recursive STARK, a hash-based proof that says "every one of these signatures is valid". They pass these aggregates to their peers, and each node merges what it receives into its own.
4. The block builder merges the aggregates for the transactions it includes and puts a single recursive STARK in the block header.
5. Validators check that one proof against the dependency triples of the block's transactions. No signature appears on chain.

The proof is hash-based too, so aggregation stays post-quantum. The draft builds it with the Lean Ethereum tooling (leanSTARK over the KoalaBear field) that Ethereum's consensus layer uses to aggregate validator signatures.

The cost moves off chain. As written, a transaction pays 3,000 gas per leanSPHINCS signature for its dependency frame, plus `LEANSTARK_VERIFICATION_GAS`, 30,000, per dependency as intrinsic gas, so about 33,000 gas for one signature. The draft doesn't add that up itself. Either way it's far below the roughly 209,000 gas a signature costs on ETC today, and the calldata is gone. The draft explains the low price.

> It is much cheaper than the onchain costs for similar operations because the cost is only paid by the builder and the mempool, not by all validating nodes.

Its open questions are the recursion circuit, the dependency hash (BLAKE2s today, BLAKE3 the likely replacement) and the aggregated verification key, all still to be specified, and more DoS exposure in the mempool. It needs EIP-8141 first.

## What ETC Could Do

### With a Fork

ETC would need EIP-8141 and EIP-8288 together, through ECIPs and a hard fork. Its nodes would also need to run the STARK aggregation in the mempool, which is new work for every client. That's the clean answer, and it's a long way off.

### Without a Fork

These work on ETC today, inside contracts, and each has a catch.

- **Sign a batch once.** A signer builds a Merkle tree of many messages and signs only the root. Each transfer then carries the 7,740-byte signature once per batch and a short Merkle path per item. It only helps one signer with many payments, an exchange or a payroll, not many users.
- **Relay many in one transaction.** A relayer can submit several signed scETC transfers in one call. That saves the 21,000 base cost per transaction, and each signature still costs its full calldata and verification.
- **Prove the batch with a STARK on chain.** A contract could verify one STARK that proves many leanSPHINCS signatures. EIP-8288 puts such proofs at 128 KB to 512 KB, which is 2 to 8 million gas of calldata alone against ETC's 8,000,000 gas block limit, so it doesn't fit.
- **Wrap it in a SNARK.** A Groth16 proof on ETC's BN254 precompiles verifies for a few hundred thousand gas. It rests on elliptic-curve pairings, which a quantum computer breaks, so the result is no longer quantum-safe. We rule it out.
