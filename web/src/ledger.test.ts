import { decodeFunctionData, encodeEventTopics, encodeAbiParameters, type Address, type Hex } from "viem";
import { describe, expect, test } from "vitest";
import { ledgerAbi } from "./generated/contracts";
import { TRANSFER_TAG, WITHDRAW_TAG, accountOf, callData, digest, keyWords, readEvents, type Kind } from "./ledger";
import fixture from "./test/fixtures/digests.json";

// The fixture holds what a deployed ledger returned for these inputs (scripts/digest-fixture.mjs).
describe("against the ledger on chain", () => {
  test("domain tags", () => {
    expect(TRANSFER_TAG).toBe(fixture.tags.TRANSFER_TAG);
    expect(WITHDRAW_TAG).toBe(fixture.tags.WITHDRAW_TAG);
  });

  test.each(fixture.digests.map((d, i) => [i, d.kind, d] as const))("digest %i (%s)", (_i, kind, d) => {
    const got = digest(kind as Kind, {
      chainId: fixture.chainId,
      ledger: fixture.ledger as Address,
      from: d.from as Address,
      nonce: BigInt(d.nonce),
      to: d.to as Address,
      amount: BigInt(d.amount),
      fee: BigInt(d.fee),
      deadline: BigInt(d.deadline),
      memo: d.memo,
    });
    expect(got).toBe(d.digest);
  });

  test("a changed field or chain changes the digest", () => {
    const d = fixture.digests[0];
    const base = {
      chainId: fixture.chainId,
      ledger: fixture.ledger as Address,
      from: d.from as Address,
      nonce: BigInt(d.nonce),
      to: d.to as Address,
      amount: BigInt(d.amount),
      fee: BigInt(d.fee),
      deadline: BigInt(d.deadline),
      memo: d.memo,
    };
    const ref = digest("transfer", base);
    expect(digest("withdraw", base)).not.toBe(ref);
    expect(digest("transfer", { ...base, chainId: 1 })).not.toBe(ref);
    expect(digest("transfer", { ...base, amount: base.amount + 1n })).not.toBe(ref);
    expect(digest("transfer", { ...base, memo: base.memo + " " })).not.toBe(ref);
  });

  test.each(fixture.accounts.map((a, i) => [i, a] as const))("accountOf %i", (_i, a) => {
    expect(accountOf(a.pkSeed as Hex, a.pkRoot as Hex)).toBe(a.account);
  });
});

describe("key words", () => {
  const pk = "0x00112233445566778899aabbccddeeffffeeddccbbaa99887766554433221100" as Hex;
  test("FIPS 205 layout, PK.seed first", () => {
    expect(keyWords(pk, "seed-root")).toEqual({
      pkSeed: "0x00112233445566778899aabbccddeeff00000000000000000000000000000000",
      pkRoot: "0xffeeddccbbaa9988776655443322110000000000000000000000000000000000",
    });
  });
  test("the older layout, root first", () => {
    expect(keyWords(pk, "root-seed").pkRoot).toBe("0x00112233445566778899aabbccddeeff00000000000000000000000000000000");
  });
  test("rejects other lengths", () => {
    expect(() => keyWords("0x1234", "seed-root")).toThrow(RangeError);
  });
});

describe("calls and events", () => {
  const ledger = "0x9b3A40aD5F27F7E44d9A0d20D348C4588169cf60" as Address;
  test("callData encodes transfer and withdraw", () => {
    const p = {
      pkSeed: `0x${"11".repeat(32)}` as Hex,
      pkRoot: `0x${"22".repeat(32)}` as Hex,
      to: "0x000000000000000000000000000000000000dEaD" as Address,
      amount: 5n,
      fee: 1n,
      deadline: 99n,
      memo: "hi",
      sig: `0x${"ab".repeat(7740)}` as Hex,
    };
    for (const kind of ["transfer", "withdraw"] as const) {
      const d = decodeFunctionData({ abi: ledgerAbi, data: callData(kind, p) });
      expect(d.functionName).toBe(kind);
      expect(d.args).toEqual([p.pkSeed, p.pkRoot, p.to, 5n, 1n, 99n, "hi", p.sig]);
    }
  });
  test("readEvents finds the memo and the fee", () => {
    const account = "0x1111111111111111111111111111111111111111" as Address;
    const relayer = "0x2222222222222222222222222222222222222222" as Address;
    const memoLog = {
      address: ledger,
      topics: encodeEventTopics({ abi: ledgerAbi, eventName: "Memo", args: { account, nonce: 3n } }) as [Hex, ...Hex[]],
      data: encodeAbiParameters([{ type: "string" }], ["thanks"]),
    };
    const feeLog = {
      address: ledger,
      topics: encodeEventTopics({ abi: ledgerAbi, eventName: "FeePaid", args: { account, relayer } }) as [Hex, ...Hex[]],
      data: encodeAbiParameters([{ type: "uint256" }], [7n]),
    };
    const other = { ...memoLog, address: relayer };
    expect(readEvents([other], ledger)).toEqual({ memo: null, fee: null });
    expect(readEvents([memoLog, feeLog], ledger)).toEqual({ memo: "thanks", fee: { relayer, amount: 7n } });
  });
});
