// The ledger (src/LeanSphincsLedger.sol, deployed as scETC) on the page's side: account addresses, the digests a key signs,
// and the calls a browser wallet submits. Pure functions, so tests can check them against the
// contract.

import {
  concatHex,
  decodeEventLog,
  encodeAbiParameters,
  encodeFunctionData,
  getAddress,
  keccak256,
  sliceHex,
  stringToHex,
  type Address,
  type Hex,
  type Log,
} from "viem";
import { ledgerAbi } from "./generated/contracts";

export const TRANSFER_TAG = keccak256(stringToHex("classix.skinnycat.LeanSphincsLedger.transfer.v1"));
export const WITHDRAW_TAG = keccak256(stringToHex("classix.skinnycat.LeanSphincsLedger.withdraw.v1"));
/** The scheme byte EIP-8288 gives leanSPHINCS. */
export const LEANSPHINCS_SCHEME = "0x10";

export type Kind = "transfer" | "withdraw";

/** accountOf: the last 20 bytes of keccak256(0x10 ‖ PK.seed ‖ PK.root). Takes the 32-byte words. */
export function accountOf(pkSeed: Hex, pkRoot: Hex): Address {
  const h = keccak256(concatHex([LEANSPHINCS_SCHEME, sliceHex(pkSeed, 0, 16), sliceHex(pkRoot, 0, 16)]));
  return getAddress(sliceHex(h, 12));
}

/** The verifier's two key words, PK.seed ‖ 0^16 and PK.root ‖ 0^16, from an encoded public key. */
export function keyWords(publicKey: Hex, layout: "seed-root" | "root-seed"): { pkSeed: Hex; pkRoot: Hex } {
  if (publicKey.length !== 66) throw new RangeError("a public key is 32 bytes");
  const a = sliceHex(publicKey, 0, 16);
  const b = sliceHex(publicKey, 16, 32);
  const pad = (x: Hex) => concatHex([x, `0x${"00".repeat(16)}`]);
  return layout === "seed-root" ? { pkSeed: pad(a), pkRoot: pad(b) } : { pkSeed: pad(b), pkRoot: pad(a) };
}

export interface Signed {
  chainId: number;
  ledger: Address;
  from: Address;
  nonce: bigint;
  to: Address;
  amount: bigint;
  fee: bigint;
  deadline: bigint;
  memo: string;
}

/** transferDigest or withdrawDigest, as the contract computes them. */
export function digest(kind: Kind, p: Signed): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "bytes32" },
        { type: "uint256" },
        { type: "address" },
        { type: "address" },
        { type: "uint256" },
        { type: "address" },
        { type: "uint256" },
        { type: "uint256" },
        { type: "uint256" },
        { type: "bytes32" },
      ],
      [
        kind === "transfer" ? TRANSFER_TAG : WITHDRAW_TAG,
        BigInt(p.chainId),
        p.ledger,
        p.from,
        p.nonce,
        p.to,
        p.amount,
        p.fee,
        p.deadline,
        keccak256(stringToHex(p.memo)),
      ],
    ),
  );
}

/** Calldata for transfer or withdraw. */
export function callData(
  kind: Kind,
  p: { pkSeed: Hex; pkRoot: Hex; to: Address; amount: bigint; fee: bigint; deadline: bigint; memo: string; sig: Hex },
): Hex {
  return encodeFunctionData({
    abi: ledgerAbi,
    functionName: kind,
    args: [p.pkSeed, p.pkRoot, p.to, p.amount, p.fee, p.deadline, p.memo, p.sig],
  });
}

export interface ReceiptEvents {
  memo: string | null;
  fee: { relayer: Address; amount: bigint } | null;
}

/** The Memo and FeePaid events the ledger emitted in a receipt. */
export function readEvents(logs: Pick<Log, "address" | "data" | "topics">[], ledger: Address): ReceiptEvents {
  const out: ReceiptEvents = { memo: null, fee: null };
  for (const l of logs) {
    if (l.address.toLowerCase() !== ledger.toLowerCase()) continue;
    try {
      const e = decodeEventLog({ abi: ledgerAbi, data: l.data, topics: l.topics as [Hex, ...Hex[]] });
      if (e.eventName === "Memo") out.memo = (e.args as { memo: string }).memo;
      if (e.eventName === "FeePaid") {
        const a = e.args as { relayer: Address; fee: bigint };
        out.fee = { relayer: a.relayer, amount: a.fee };
      }
    } catch {
      // another event
    }
  }
  return out;
}
