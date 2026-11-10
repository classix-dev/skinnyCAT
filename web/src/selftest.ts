// Checks run on page load, in the background. Each one either passes or says what went wrong.

import { keccak256, type Hex, type PublicClient } from "viem";
import { verifyOnChain } from "./chain";
import type { NetworkConfig } from "./config";
import { LEDGER_SYMBOL, ledgerAbi } from "./generated/contracts";
import vectors from "./generated/vectors.json";
import { keyWords } from "./ledger";
import { verifyLocal } from "./signer-client";

export interface Check {
  name: string;
  ok: boolean;
  detail: string;
}

const short = (h: string) => `${h.slice(0, 10)}…${h.slice(-6)}`;

async function run(name: string, fn: () => Promise<string>): Promise<Check> {
  try {
    return { name, ok: true, detail: await fn() };
  } catch (e) {
    return { name, ok: false, detail: e instanceof Error ? e.message.split("\n")[0] : String(e) };
  }
}

export async function selfTests(c: PublicClient, n: NetworkConfig): Promise<Check[]> {
  const valid = vectors.verify.find((v) => v.output === true)!;
  const layout = vectors.pkLayout as "seed-root" | "root-seed";

  return Promise.all([
    run("chain id", async () => {
      const id = await c.getChainId();
      if (id !== n.chainId) throw new Error(`RPC reports chain ${id}, expected ${n.chainId}`);
      return `${id}`;
    }),
    run("verifier code hash", async () => {
      const code = await c.getCode({ address: n.verifier });
      if (!code || code === "0x") throw new Error(`no code at ${n.verifier}`);
      const h = keccak256(code);
      if (h !== n.verifierCodeHash) throw new Error(`code hash ${short(h)}, expected ${short(n.verifierCodeHash)}`);
      return short(h);
    }),
    run(`${LEDGER_SYMBOL} uses that verifier`, async () => {
      const [v, sym] = await Promise.all([
        c.readContract({ address: n.ledger, abi: ledgerAbi, functionName: "verifier" }),
        c.readContract({ address: n.ledger, abi: ledgerAbi, functionName: "symbol" }),
      ]);
      if (v.toLowerCase() !== n.verifier.toLowerCase()) throw new Error(`${LEDGER_SYMBOL} points at ${v}`);
      if (sym !== LEDGER_SYMBOL) throw new Error(`symbol ${sym}`);
      return short(n.ledger);
    }),
    run("EthLib vectors, JS verifier", async () => {
      for (const v of vectors.verify) {
        const got = await verifyLocal(v.public_key as Hex, v.message as Hex, v.signature as Hex);
        if (got !== v.output) throw new Error(`${v.name} gave ${got}, expected ${v.output}`);
      }
      return `${vectors.verify.length} vectors`;
    }),
    run("EthLib vector, on-chain verifier", async () => {
      const { pkSeed, pkRoot } = keyWords(valid.public_key as Hex, layout);
      const ok = await verifyOnChain(c, n, pkSeed, pkRoot, valid.message as Hex, valid.signature as Hex);
      if (!ok) throw new Error(`${valid.name} returned false`);
      return valid.name;
    }),
  ]);
}
