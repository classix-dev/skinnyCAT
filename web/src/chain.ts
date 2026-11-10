// Reads and calls against the chain through the public RPC, with viem.

import { createPublicClient, defineChain, fallback, http, type Chain, type Hex, type PublicClient } from "viem";
import type { NetworkConfig } from "./config";
import { verifierAbi } from "./generated/contracts";

export function chainOf(n: NetworkConfig): Chain {
  return defineChain({
    id: n.chainId,
    name: n.name,
    nativeCurrency: n.currency,
    rpcUrls: { default: { http: n.rpcUrls } },
    blockExplorers: { default: { name: "Blockscout", url: n.explorer } },
  });
}

export function publicClientOf(n: NetworkConfig): PublicClient {
  return createPublicClient({
    chain: chainOf(n),
    transport: fallback(n.rpcUrls.map((u) => http(u, { batch: false, retryCount: 1 }))),
  });
}

export async function verifyOnChain(c: PublicClient, n: NetworkConfig, pkSeed: Hex, pkRoot: Hex, message: Hex, sig: Hex): Promise<boolean> {
  return c.readContract({ address: n.verifier, abi: verifierAbi, functionName: "verify", args: [pkSeed, pkRoot, message, sig] });
}

