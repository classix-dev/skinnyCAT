// The user's ordinary browser wallet. It pays gas, deposits ETC and relays signed messages. It
// can't change what a key signed. Loaded on demand, discovery lives in discover.ts.

import { createWalletClient, custom, numberToHex, type Address, type EIP1193Provider, type WalletClient } from "viem";
import { chainOf } from "./chain";
import type { NetworkConfig } from "./config";
import type { Discovered, ProviderInfo } from "./discover";

export interface Connection {
  info: ProviderInfo;
  provider: EIP1193Provider;
  client: WalletClient;
  account: Address;
}

export async function connect(d: Discovered): Promise<Connection> {
  const accounts = (await d.provider.request({ method: "eth_requestAccounts" })) as Address[];
  if (!accounts?.length) throw new Error("The browser wallet returned no accounts.");
  return { ...d, client: createWalletClient({ transport: custom(d.provider) }), account: accounts[0] };
}

/** Asks the browser wallet to switch to the network, adding it first if the wallet doesn't know it. */
export async function ensureChain(c: Connection, n: NetworkConfig): Promise<void> {
  const current = Number(await c.provider.request({ method: "eth_chainId" }));
  if (current === n.chainId) return;
  const chainId = numberToHex(n.chainId);
  try {
    await c.provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId }] });
  } catch (e) {
    const code = (e as { code?: number; data?: { originalError?: { code?: number } } }).code;
    const inner = (e as { data?: { originalError?: { code?: number } } }).data?.originalError?.code;
    if (code !== 4902 && inner !== 4902 && !/unrecognized|not added|unknown chain/i.test(String((e as Error).message))) throw e;
    const chain = chainOf(n);
    await c.provider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId,
          chainName: chain.name,
          nativeCurrency: chain.nativeCurrency,
          rpcUrls: n.rpcUrls,
          blockExplorerUrls: [n.explorer],
        },
      ],
    });
  }
  const after = Number(await c.provider.request({ method: "eth_chainId" }));
  if (after !== n.chainId) throw new Error(`The browser wallet is on chain ${after}, not ${n.name} (${n.chainId}).`);
}
