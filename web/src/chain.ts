// Reads and calls against the chain through the public RPC, with viem.

import {
  concatHex,
  createPublicClient,
  getContractAddress,
  defineChain,
  encodeAbiParameters,
  encodeFunctionData,
  fallback,
  http,
  keccak256,
  stringToHex,
  type Address,
  type Chain,
  type Hex,
  type PublicClient,
} from "viem";
import type { NetworkConfig } from "./config";
import { factoryAbi, verifierAbi, walletAbi } from "./generated/contracts";

export function chainOf(n: NetworkConfig): Chain {
  return defineChain({
    id: n.chainId,
    name: n.name,
    nativeCurrency: n.currency,
    rpcUrls: { default: { http: n.rpcUrls } },
    blockExplorers: { default: { name: "Blockscout", url: n.explorer } },
    testnet: n.testnet,
  });
}

export function publicClientOf(n: NetworkConfig): PublicClient {
  return createPublicClient({
    chain: chainOf(n),
    transport: fallback(n.rpcUrls.map((u) => http(u, { batch: false, retryCount: 1 }))),
  });
}

export const EXECUTE_TAG = keccak256(stringToHex("classix.pq-sig.LeanSphincsWallet.execute.v1"));

/** The 32-byte message the leanSPHINCS key signs, as LeanSphincsWallet.messageHash computes it. */
export function messageHash(p: {
  chainId: number;
  wallet: Address;
  nonce: bigint;
  to: Address;
  value: bigint;
  data: Hex;
  deadline: bigint;
}): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "bytes32" },
        { type: "uint256" },
        { type: "address" },
        { type: "uint256" },
        { type: "address" },
        { type: "uint256" },
        { type: "bytes32" },
        { type: "uint256" },
      ],
      [EXECUTE_TAG, BigInt(p.chainId), p.wallet, p.nonce, p.to, p.value, keccak256(p.data), p.deadline],
    ),
  );
}

export interface WalletState {
  address: Address;
  balance: bigint;
  deployed: boolean;
  nonce: bigint;
}

export async function walletAddress(c: PublicClient, n: NetworkConfig, pkSeed: Hex, pkRoot: Hex): Promise<Address> {
  return c.readContract({ address: n.factory, abi: factoryAbi, functionName: "walletAddress", args: [pkSeed, pkRoot] });
}

export async function walletState(c: PublicClient, address: Address): Promise<WalletState> {
  const [balance, code] = await Promise.all([c.getBalance({ address }), c.getCode({ address })]);
  const deployed = !!code && code !== "0x";
  const nonce = deployed ? await c.readContract({ address, abi: walletAbi, functionName: "nonce" }) : 0n;
  return { address, balance, deployed, nonce };
}

export async function verifyOnChain(
  c: PublicClient,
  n: NetworkConfig,
  pkSeed: Hex,
  pkRoot: Hex,
  message: Hex,
  sig: Hex,
): Promise<boolean> {
  return c.readContract({ address: n.verifier, abi: verifierAbi, functionName: "verify", args: [pkSeed, pkRoot, message, sig] });
}

/** The transaction the web3 wallet submits: createAndExecute on first use, else execute. */
export function buildCall(p: {
  n: NetworkConfig;
  wallet: WalletState;
  pkSeed: Hex;
  pkRoot: Hex;
  to: Address;
  value: bigint;
  data: Hex;
  deadline: bigint;
  sig: Hex;
}): { to: Address; data: Hex; method: "createAndExecute" | "execute" } {
  if (p.wallet.deployed) {
    return {
      to: p.wallet.address,
      method: "execute",
      data: encodeFunctionData({ abi: walletAbi, functionName: "execute", args: [p.to, p.value, p.data, p.deadline, p.sig] }),
    };
  }
  return {
    to: p.n.factory,
    method: "createAndExecute",
    data: encodeFunctionData({
      abi: factoryAbi,
      functionName: "createAndExecute",
      args: [p.pkSeed, p.pkRoot, p.to, p.value, p.data, p.deadline, p.sig],
    }),
  };
}

export const txUrl = (n: NetworkConfig, hash: Hex) => `${n.explorer}/tx/${hash}`;
export const addressUrl = (n: NetworkConfig, a: Address) => `${n.explorer}/address/${a}`;

/**
 * The wallet address computed locally, as LeanSphincsWalletFactory.walletAddress does. The
 * implementation is the factory's first CREATE (contract nonces start at 1), and the wallet is an
 * EIP-1167 clone of it deployed with CREATE2, salted with keccak256(abi.encode(pkSeed, pkRoot)).
 */
export function predictWalletAddress(n: NetworkConfig, pkSeed: Hex, pkRoot: Hex): Address {
  const implementation = getContractAddress({ from: n.factory, nonce: 1n });
  const cloneCode = concatHex([
    "0x3d602d80600a3d3981f3363d3d373d3d3d363d73",
    implementation,
    "0x5af43d82803e903d91602b57fd5bf3",
  ]);
  const salt = keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "bytes32" }], [pkSeed, pkRoot]));
  return getContractAddress({ opcode: "CREATE2", from: n.factory, salt, bytecode: cloneCode });
}
