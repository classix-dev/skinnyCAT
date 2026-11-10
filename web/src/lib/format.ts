import { BaseError, decodeErrorResult, formatUnits, parseUnits, type Hex } from "viem";
import { ledgerAbi, verifierAbi } from "../generated/contracts";

export const short = (s: string, a = 6, b = 4) => (s.length > a + b + 1 ? `${s.slice(0, a)}…${s.slice(-b)}` : s);

/** An 18-decimal amount with at most six decimals, and a symbol if given. */
export function fmt(wei: bigint, symbol?: string): string {
  const s = formatUnits(wei, 18);
  const [i, f = ""] = s.split(".");
  const frac = f.slice(0, 6).replace(/0+$/, "");
  const shown = `${i}${frac ? `.${frac}` : ""}`;
  const tiny = wei > 0n && shown === "0";
  return `${tiny ? "<0.000001" : shown}${symbol ? ` ${symbol}` : ""}`;
}

/** Parses an amount like 0.01. Zero only when `allowZero`. */
export function parseAmount(s: string, { allowZero = false, what = "The amount" } = {}): bigint {
  const t = s.trim();
  if (!/^(\d+\.?\d*|\.\d+)$/.test(t)) throw new Error(`${what} has to be a number like 0.01.`);
  const [, frac = ""] = t.split(".");
  if (frac.length > 18) throw new Error(`${what} has more than 18 decimals.`);
  const v = parseUnits(t, 18);
  if (v === 0n && !allowZero) throw new Error(`${what} has to be more than zero.`);
  return v;
}

/** RPC and wallet errors, shown as the node or wallet worded them, with revert reasons decoded. */
const ERROR_ABI = [...ledgerAbi, ...verifierAbi].filter((x) => x.type === "error");
export function revertName(data: Hex | undefined): string | null {
  if (!data || data.length < 10) return null;
  try {
    const r = decodeErrorResult({ abi: ERROR_ABI, data });
    return `${r.errorName}(${(r.args ?? []).map(String).join(", ")})`;
  } catch {
    return null;
  }
}

export function errMsg(e: unknown): string {
  if (e instanceof BaseError) {
    const raw = e.walk((x) => typeof (x as { data?: unknown }).data === "string") as { data?: Hex } | null;
    const name = revertName(raw?.data);
    const decoded = name ? `\nreverted with ${name}` : raw?.data && raw.data.length >= 10 ? `\nrevert data ${short(raw.data, 42, 8)}` : "";
    const details = e.details && !e.shortMessage.includes(e.details) ? `\n${e.details}` : "";
    return `${e.shortMessage}${details}${decoded}`;
  }
  if (e && typeof e === "object" && "message" in e) {
    const o = e as { message: string; code?: number; data?: unknown };
    return `${o.message}${o.code !== undefined ? ` (code ${o.code})` : ""}${o.data ? `\n${JSON.stringify(o.data)}` : ""}`;
  }
  return String(e);
}
