// ETC mainnet only. The verifier and the ledger sit at the CREATE2 addresses script/Deploy.s.sol
// computes, which scripts/gen-contracts.mjs copies into src/generated/contracts.ts.

import type { Address, Hex } from "viem";
import { LEDGER_ADDRESS, VERIFIER_ADDRESS, VERIFIER_CODE_HASH } from "./generated/contracts";

export interface NetworkConfig {
  name: string;
  chainId: number;
  currency: { name: string; symbol: string; decimals: number };
  /** Tried in order, the first that answers wins. */
  rpcUrls: string[];
  /** Blockscout base URL, no trailing slash. */
  explorer: string;
  verifier: Address;
  ledger: Address;
  /** keccak256(eth_getCode(verifier)), checked by the self-test on load. */
  verifierCodeHash: Hex;
}

export const NETWORK: NetworkConfig = {
  name: "Ethereum Classic",
  chainId: 61,
  currency: { name: "Ether Classic", symbol: "ETC", decimals: 18 },
  rpcUrls: ["https://rpc.classix.dev", "https://etc.etcdesktop.com"],
  explorer: "https://etc.blockscout.com",
  verifier: VERIFIER_ADDRESS,
  ledger: LEDGER_ADDRESS,
  verifierCodeHash: VERIFIER_CODE_HASH,
};

/** Gas limits used when eth_estimateGas fails. A send costs about 290,000 to 335,000. */
export const GAS_FALLBACK = 450_000n;

/** How long a signature stays valid, in seconds. */
export const DEADLINE_SECONDS = 3600;

/** Defaults for the forms, small on purpose. */
export const DEFAULTS = {
  deposit: "0.01",
  send: "0.004",
  memo: "The first payment using a quantum-safe signature on Ethereum Classic, by Classix.dev",
  bobAmount: "0.001",
  bobFee: "0.0015",
};

/**
 * Test-only override. The end-to-end test sets `window.__PQ_CONFIG_OVERRIDE__` before the app loads,
 * to point the page at a local anvil node. Nothing in production sets it. Read after hydration only,
 * so the pre-rendered HTML never depends on it.
 */
declare global {
  interface Window {
    __PQ_CONFIG_OVERRIDE__?: Partial<NetworkConfig>;
  }
}

export function network(): NetworkConfig {
  const o = (typeof window !== "undefined" && window.__PQ_CONFIG_OVERRIDE__) || {};
  return { ...NETWORK, ...o };
}

export const txUrl = (n: NetworkConfig, hash: Hex) => `${n.explorer}/tx/${hash}`;
export const addressUrl = (n: NetworkConfig, a: Address) => `${n.explorer}/address/${a}`;
