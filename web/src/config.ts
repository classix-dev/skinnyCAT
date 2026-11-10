// Networks the app knows about. Flip `enabled` to show a network in the page.
// The verifier and factory sit at the same CREATE2 addresses on every chain (script/Deploy.s.sol).

import type { Address, Hex } from "viem";
import { VERIFIER_CODE_HASH } from "./generated/contracts";

export interface NetworkConfig {
  key: string;
  name: string;
  chainId: number;
  testnet: boolean;
  enabled: boolean;
  currency: { name: string; symbol: string; decimals: number };
  /** Tried in order, the first that answers wins. */
  rpcUrls: string[];
  /** Blockscout base URL, no trailing slash. */
  explorer: string;
  verifier: Address;
  factory: Address;
  /** keccak256(eth_getCode(verifier)), checked by the self-test on load. */
  verifierCodeHash: Hex;
  /** Default amount (in ETC) offered in the fund and send forms. */
  defaultAmount: string;
}

const VERIFIER: Address = "0x14e305EF06959B2317AaB31e6cc8749d41FC8C04";
const FACTORY: Address = "0x3e770624D601F6F6e5D7258ad83AC84927181139";

export const NETWORKS: NetworkConfig[] = [
  {
    key: "mordor",
    name: "Mordor",
    chainId: 63,
    testnet: true,
    enabled: true,
    currency: { name: "Mordor Ether", symbol: "METC", decimals: 18 },
    rpcUrls: ["https://rpc.mordor.etccooperative.org"],
    explorer: "https://etc-mordor.blockscout.com",
    verifier: VERIFIER,
    factory: FACTORY,
    verifierCodeHash: VERIFIER_CODE_HASH,
    defaultAmount: "0.01",
  },
  {
    key: "classic",
    name: "Ethereum Classic",
    chainId: 61,
    testnet: false,
    enabled: false,
    currency: { name: "Ether Classic", symbol: "ETC", decimals: 18 },
    rpcUrls: ["https://etc.rivet.link", "https://etc.etcdesktop.com"],
    explorer: "https://etc.blockscout.com",
    verifier: VERIFIER,
    factory: FACTORY,
    verifierCodeHash: VERIFIER_CODE_HASH,
    defaultAmount: "0.001",
  },
];

/** Gas limits used when eth_estimateGas fails. */
// eth_estimateGas on anvil gives about 401,000 for createAndExecute and 264,000 for execute (289,000 to a
// new account). anvil's receipts overstate execute at about 333,000, because they apply an EIP-7623 style
// calldata floor that ETC doesn't have.
export const GAS_FALLBACK = { createAndExecute: 500_000n, execute: 360_000n, fund: 60_000n };

/** How long a signature stays valid, in seconds. */
export const DEADLINE_SECONDS = 3600;

/**
 * Test-only override. The end-to-end test sets `window.__PQ_CONFIG_OVERRIDE__` before the app loads,
 * to point a network at a local anvil node. Nothing in production sets it.
 */
type Override = Partial<Record<string, Partial<NetworkConfig>>>;
declare global {
  interface Window {
    __PQ_CONFIG_OVERRIDE__?: Override;
  }
}

export function enabledNetworks(): NetworkConfig[] {
  const o = (typeof window !== "undefined" && window.__PQ_CONFIG_OVERRIDE__) || {};
  return NETWORKS.map((n) => ({ ...n, ...(o[n.key] ?? {}) })).filter((n) => n.enabled);
}
