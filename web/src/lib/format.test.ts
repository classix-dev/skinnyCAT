import { encodeErrorResult } from "viem";
import { describe, expect, test } from "vitest";
import { ledgerAbi } from "../generated/contracts";
import { errMsg, fmt, parseAmount, revertName, short } from "./format";

describe("fmt", () => {
  test("drops trailing zeros and caps at six decimals", () => {
    expect(fmt(10n ** 18n)).toBe("1");
    expect(fmt(4n * 10n ** 17n, "scETC")).toBe("0.4 scETC");
    expect(fmt(1234567890123456789n, "ETC")).toBe("1.234567 ETC");
    expect(fmt(0n, "ETC")).toBe("0 ETC");
  });
  test("says so when an amount rounds to zero", () => {
    expect(fmt(1n, "ETC")).toBe("<0.000001 ETC");
  });
});

describe("parseAmount", () => {
  test("parses decimals", () => {
    expect(parseAmount("0.4")).toBe(4n * 10n ** 17n);
    expect(parseAmount(" 1 ")).toBe(10n ** 18n);
    expect(parseAmount(".5")).toBe(5n * 10n ** 17n);
    expect(parseAmount("2.")).toBe(2n * 10n ** 18n);
  });
  test("refuses zero unless allowed", () => {
    expect(() => parseAmount("0")).toThrow(/more than zero/);
    expect(parseAmount("0", { allowZero: true })).toBe(0n);
  });
  test("refuses junk and too many decimals", () => {
    for (const bad of ["", "abc", "1,5", "-1", "1e3", "0x10"]) expect(() => parseAmount(bad, { what: "The fee" })).toThrow(/The fee has to be a number/);
    expect(() => parseAmount("0.0000000000000000001")).toThrow(/18 decimals/);
  });
});

describe("errors", () => {
  test("decodes scETC's custom errors", () => {
    const data = encodeErrorResult({ abi: ledgerAbi, errorName: "BadSignature" });
    expect(revertName(data)).toBe("BadSignature()");
    expect(revertName("0x12345678")).toBeNull();
    expect(revertName(undefined)).toBeNull();
  });
  test("words plain errors", () => {
    expect(errMsg(new Error("nope"))).toBe("nope");
    expect(errMsg({ message: "User rejected", code: 4001 })).toBe("User rejected (code 4001)");
    expect(errMsg("x")).toBe("x");
  });
  test("short", () => {
    expect(short("0x1234567890abcdef")).toBe("0x1234…cdef");
    expect(short("0x12")).toBe("0x12");
  });
});
