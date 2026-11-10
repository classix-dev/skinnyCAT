// A fake chain and browser wallet for store and component tests.
import { encodeAbiParameters, encodeEventTopics, type Address, type Hex } from "viem";
import { NETWORK } from "../config";
import { ledgerAbi } from "../generated/contracts";
import { digest, type Kind } from "../ledger";

export const SIG = `0x${"ab".repeat(7740)}` as Hex;
export const HASH = `0x${"77".repeat(32)}` as Hex;
export const RELAYER = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as Address;

export function keyFor(seed: Hex) {
  const b = seed.slice(2, 34);
  const r = seed.slice(34, 66);
  return { publicKey: `0x${b}${r}` as Hex, pkSeed: `0x${b}${"0".repeat(32)}` as Hex, pkRoot: `0x${r}${"0".repeat(32)}` as Hex };
}

export function fakeChain() {
  const balances = new Map<string, bigint>();
  const nonces = new Map<string, bigint>();
  const sent: { to: Address; data: Hex; value: bigint }[] = [];
  let memo: string | null = null;
  const client = {
    getChainId: async () => 61,
    getBalance: async () => 10n ** 18n,
    getGasPrice: async () => 4_000_000_000n,
    call: async () => ({ data: "0x" }),
    estimateGas: async () => 300_000n,
    getTransaction: async () => ({ input: "0x" }),
    readContract: async ({ functionName, args }: { functionName: string; args: unknown[] }) => {
      const a = String(args?.[0] ?? "").toLowerCase();
      if (functionName === "balanceOf") return balances.get(a) ?? 0n;
      if (functionName === "nonces") return nonces.get(a) ?? 0n;
      if (functionName === "transferDigest" || functionName === "withdrawDigest") {
        const [from, nonce, to, amount, fee, deadline, m] = args as [Address, bigint, Address, bigint, bigint, bigint, string];
        const kind: Kind = functionName === "transferDigest" ? "transfer" : "withdraw";
        return digest(kind, { chainId: 61, ledger: NETWORK.ledger, from, nonce, to, amount, fee, deadline, memo: m });
      }
      throw new Error(`fake readContract ${functionName}`);
    },
    waitForTransactionReceipt: async () => ({
      status: "success",
      blockNumber: 12n,
      gasUsed: 301_234n,
      logs:
        memo === null
          ? []
          : [
              {
                address: NETWORK.ledger,
                topics: encodeEventTopics({ abi: ledgerAbi, eventName: "Memo", args: { account: RELAYER, nonce: 0n } }),
                data: encodeAbiParameters([{ type: "string" }], [memo]),
              },
            ],
    }),
  };
  const provider = {
    request: async ({ method, params }: { method: string; params?: unknown[] }) => {
      switch (method) {
        case "eth_requestAccounts":
        case "eth_accounts":
          return [RELAYER];
        case "eth_chainId":
          return "0x3d";
        case "eth_sendTransaction": {
          const tx = (params as { to: Address; data: Hex; value?: Hex }[])[0];
          sent.push({ to: tx.to, data: tx.data, value: BigInt(tx.value ?? 0) });
          return HASH;
        }
        default:
          throw new Error(`fake provider ${method}`);
      }
    },
    on: () => {},
  };
  return {
    client,
    provider,
    discovered: { info: { uuid: "fake", name: "Fake Wallet", icon: "", rdns: "dev.fake" }, provider },
    balances,
    nonces,
    sent,
    setMemo: (m: string | null) => (memo = m),
  };
}
