// The user's ordinary web3 wallet, found through EIP-6963 with window.ethereum as a fallback.
// It only pays gas and submits transactions. It has no power over the leanSPHINCS wallet.

import {
  createWalletClient,
  custom,
  numberToHex,
  type Address,
  type EIP1193Provider,
  type WalletClient,
} from "viem";
import { chainOf } from "./chain";
import type { NetworkConfig } from "./config";

export interface ProviderInfo {
  uuid: string;
  name: string;
  icon: string;
  rdns: string;
}

export interface Discovered {
  info: ProviderInfo;
  provider: EIP1193Provider;
}

interface AnnounceEvent extends Event {
  detail: { info: ProviderInfo; provider: EIP1193Provider };
}

declare global {
  interface Window {
    ethereum?: EIP1193Provider;
  }
}

/** Collects EIP-6963 announcements. Calls onChange whenever the list grows. */
export function discoverProviders(onChange: (list: Discovered[]) => void): () => Discovered[] {
  const found = new Map<string, Discovered>();
  // Defined before the request below, because wallets answer it synchronously.
  const list = (): Discovered[] => {
    const l = [...found.values()];
    if (!l.length && window.ethereum) {
      l.push({
        info: { uuid: "window.ethereum", name: "Browser Wallet", icon: "", rdns: "window.ethereum" },
        provider: window.ethereum,
      });
    }
    return l;
  };
  window.addEventListener("eip6963:announceProvider", (e) => {
    const { info, provider } = (e as AnnounceEvent).detail;
    if (!info?.uuid || found.has(info.uuid)) return;
    found.set(info.uuid, { info, provider });
    onChange(list());
  });
  window.dispatchEvent(new Event("eip6963:requestProvider"));
  return list;
}

export interface Connection {
  info: ProviderInfo;
  provider: EIP1193Provider;
  client: WalletClient;
  account: Address;
}

export async function connect(d: Discovered): Promise<Connection> {
  const accounts = (await d.provider.request({ method: "eth_requestAccounts" })) as Address[];
  if (!accounts?.length) throw new Error("The wallet returned no accounts.");
  return { ...d, client: createWalletClient({ transport: custom(d.provider) }), account: accounts[0] };
}

/** Asks the wallet to switch to the network, adding it first if the wallet doesn't know it. */
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
  if (after !== n.chainId) throw new Error(`The wallet is on chain ${after}, not ${n.name} (${n.chainId}).`);
}
