# Frame Transactions Instead of Meta-Transactions

The long version of the frame transactions section on skinnycat.classix.dev, and the source for the write-up. Everything about EIP-8141 here is from the [draft](https://eips.ethereum.org/EIPS/eip-8141) as of 2026-11-10.

## What We Do Today

ETC has no way for an account to pay its own gas with anything but an ECDSA signature, so scETC uses meta-transactions.

1. Bob signs a scETC transfer with his leanSPHINCS key. The message covers the recipient, the amount, a fee, a nonce, a deadline and the chain.
2. A relayer puts that message in an ordinary transaction, signs the transaction with its own ECDSA key and pays the gas.
3. scETC checks Bob's signature, moves his balance and pays the relayer the fee Bob signed for.

It works on ETC today, with no fork. It needs three things we'd rather not have. Someone has to run a relayer. An ECDSA key sits in the path, although it only risks its own gas money. And Bob holds scETC in a wrapper contract, not ETC in his own account.

## With Frame Transactions

[EIP-8141](https://eips.ethereum.org/EIPS/eip-8141) adds transaction type `0x06`. Its abstract says it

> Adds a new transaction whose validity and gas payment can be defined abstractly.

Bob's account would be a small contract that holds ETC directly. His transaction is a list of frames, each one a call.

1. A VERIFY frame. The protocol calls Bob's account as a static call. The account reads the transaction's signature hash, passes it and Bob's 7,740-byte signature to the leanSPHINCS verifier, and if it's valid runs the new `APPROVE` opcode with the scope for execution and payment. That bumps Bob's nonce, makes his account the payer and takes the gas budget from it.
2. A SENDER frame. It runs as Bob's account and sends ETC to Alice.

The signature hash is `keccak256(0x06 ‖ rlp(tx))` with the signature bytes left out, so Bob's leanSPHINCS signature covers the whole transaction, gas included. There's no relayer, no ECDSA key anywhere, and no wrapped token.

The meta-transaction case is built in too. If Bob has no ETC for gas, a paymaster adds its own VERIFY frame that approves payment only, and pays. Its approval is contract code, so it can check that Bob pays it back in a token, or nothing at all.

The [Devcon workshop](https://github.com/alessandrobaiocchi/Devcon_Workshop) sends exactly this kind of transaction on the Daisugi research testnet, a VERIFY frame that checks a leanSPHINCS signature followed by a SENDER frame with the transfer.

A later draft, [EIP-8288](https://eips.ethereum.org/EIPS/eip-8288), goes further. Block builders would replace the leanSPHINCS signatures in a block with one aggregate proof, so each signature costs about 3,000 gas on chain instead of carrying 7,740 bytes. It gives leanSPHINCS the scheme byte `0x10`, which scETC already uses to derive its addresses.

## What ETC Would Need

Frame transactions change what makes a transaction valid, so ETC would need an ECIP and a hard fork. EIP-8141 is a draft and still changes, and its fee fields follow EIP-1559, which ETC doesn't have yet. [ECIP-1120](https://github.com/orgs/ethereumclassic/discussions/541) proposes a basefee market for ETC. Until then, meta-transactions are how ETC can do this, and scETC is the demo.

## Side by Side

| | scETC today | frame transactions |
|---|---|---|
| fork needed | no | yes, an ECIP |
| who submits | a relayer | anyone, or Bob |
| ECDSA in the path | the relayer's key, gas money only | none |
| what Bob holds | scETC, wrapped ETC | ETC in his own account |
| gas paid by | the relayer, repaid from Bob's fee | Bob's account, or a paymaster |
| signature on chain | 7,740 bytes in calldata | 7,740 bytes, or an aggregate proof with EIP-8288 |
