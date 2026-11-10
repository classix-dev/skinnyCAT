// Browser wallets found through EIP-6963, with window.ethereum as a fallback. Kept apart from
// web3.ts, so finding them doesn't pull viem's wallet client into the first chunk.

import type { EIP1193Provider } from "viem";

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
  // Defined before the request below, because browser wallets answer it synchronously.
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
