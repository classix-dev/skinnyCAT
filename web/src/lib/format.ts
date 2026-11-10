import { BaseError, decodeErrorResult, formatUnits, parseUnits, type Hex } from "viem";
import type { NetworkConfig } from "../config";
import { factoryAbi, verifierAbi, walletAbi } from "../generated/contracts";

export const short = (s: string, a = 6, b = 4) => (s.length > a + b + 1 ? `${s.slice(0, a)}…${s.slice(-b)}` : s);

/** A balance with at most six decimals and the network's symbol. */
export function fmt(n: NetworkConfig, wei: bigint, symbol = true): string {
  const s = formatUnits(wei, n.currency.decimals);
  const [i, f = ""] = s.split(".");
  const frac = f.slice(0, 6).replace(/0+$/, "");
  return `${i}${frac ? `.${frac}` : ""}${symbol ? ` ${n.currency.symbol}` : ""}`;
}

export function parseAmount(n: NetworkConfig, s: string): bigint {
  const t = s.trim();
  if (!/^\d*\.?\d+$|^\d+\.$/.test(t)) throw new Error("Enter an amount like 0.01.");
  const v = parseUnits(t, n.currency.decimals);
  if (v <= 0n) throw new Error("The amount has to be more than zero.");
  return v;
}

/** RPC and wallet errors, shown as the node or wallet worded them. */
const ERROR_ABI = [...factoryAbi, ...walletAbi, ...verifierAbi].filter((x) => x.type === "error");
export function errMsg(e: unknown): string {
  if (e instanceof BaseError) {
    const raw = e.walk((x) => typeof (x as { data?: unknown }).data === "string") as { data?: Hex } | null;
    let decoded = "";
    if (raw?.data && raw.data.length >= 10) {
      try {
        const r = decodeErrorResult({ abi: ERROR_ABI, data: raw.data });
        decoded = `\nreverted with ${r.errorName}(${(r.args ?? []).map(String).join(", ")})`;
      } catch {
        decoded = `\nrevert data ${short(raw.data, 42, 8)}`;
      }
    }
    const details = e.details && !e.shortMessage.includes(e.details) ? `\n${e.details}` : "";
    return `${e.shortMessage}${details}${decoded}`;
  }
  if (e && typeof e === "object" && "message" in e) {
    const o = e as { message: string; code?: number; data?: unknown };
    return `${o.message}${o.code !== undefined ? ` (code ${o.code})` : ""}${o.data ? `\n${JSON.stringify(o.data)}` : ""}`;
  }
  return String(e);
}
