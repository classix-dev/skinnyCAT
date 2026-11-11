# Frame Transactions Instead of Meta-Transactions

The long version of the frame transactions section on skinnycat.classix.dev, and the source for the write-up. Everything about EIP-8141 here is from the [draft](https://eips.ethereum.org/EIPS/eip-8141) as of 2026-11-11.

## What We Do Today

ETC has no way for an account to pay its own gas with anything but an ECDSA signature, so scETC uses meta-transactions.

1. Bob signs a scETC transfer with his leanSPHINCS key. The message covers the recipient, the amount, a fee, a nonce, a deadline and the chain.
2. A relayer puts that message in an ordinary transaction, signs the transaction with its own ECDSA key and pays the gas.
3. scETC checks Bob's signature, moves his balance and pays the relayer the fee Bob signed for.

It works on ETC today, with no fork. It needs three things we'd rather not have. Someone has to run a relayer. An ECDSA key sits in the path, although it only risks its own gas money. And Bob holds scETC in a wrapper contract, not ETC in his own account.

## With Frame Transactions

[EIP-8141](https://eips.ethereum.org/EIPS/eip-8141) adds transaction type `0x06`. Its abstract says it

> Adds a new transaction whose validity and gas payment can be defined abstractly.

The transaction is `[chain_id, nonce, sender, frames, signatures, fees, blob_versioned_hashes]`. Bob's account would be a small contract that holds ETC directly, and each frame is a call.

The `signatures` list holds `[scheme, signer, msg, signature]` entries. The protocol itself checks only secp256k1 and P256. leanSPHINCS isn't a scheme in the draft, so Bob's signature goes in as an `ARBITRARY` entry (scheme `0x0`) and his account checks it. With an empty `msg` the entry signs the transaction's signature hash, which is `keccak256(0x06 ‖ rlp(tx))` with the raw signature bytes replaced by their length. So Bob's signature covers every frame, the nonce and the fees.

1. A VERIFY frame. The protocol calls Bob's account read-only. The account reads the signature hash with `TXPARAM` and the 7,740 signature bytes with `SIGDATACOPY`, checks them, and if they're valid runs the new `APPROVE` opcode with the scope for execution and payment. That bumps Bob's nonce, makes his account the payer and takes the gas budget from it.
2. A SENDER frame. It runs as Bob's account and sends ETC to Alice.

There's no relayer, no ECDSA key anywhere, and no wrapped token. A VERIFY frame that reverts, or a transaction that ends with no payer, is invalid.

The meta-transaction case is built in too. If Bob has no ETC for gas, his own VERIFY frame approves execution only, and a paymaster's VERIFY frame comes next and approves payment. Payment approval has to follow the sender's approval, so the order is Bob, then the paymaster, then the SENDER frame. The paymaster's approval is contract code, so it can check that Bob pays it back in a token, or nothing at all.

The cost doesn't go away. As drafted, an `ARBITRARY` signature's bytes are charged as calldata, so the 7,740 bytes still cost about 124,000 gas, plus the check in Bob's account. Raw bytes of protocol schemes are deliberately hidden from the EVM "to allow future aggregation schemes".

The [Devcon workshop](https://github.com/alessandrobaiocchi/Devcon_Workshop) sends exactly this kind of transaction on the Daisugi research testnet, a VERIFY frame that checks a leanSPHINCS signature followed by a SENDER frame with the transfer.

A later draft, [EIP-8288](https://eips.ethereum.org/EIPS/eip-8288), goes further. Block builders would replace the leanSPHINCS signatures in a block with one aggregate proof, so each signature costs about 33,000 gas as written (3,000 for its dependency frame and 30,000 for the proof check) instead of carrying 7,740 bytes. It gives leanSPHINCS the scheme byte `0x10`, which scETC already uses to derive its addresses.

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
