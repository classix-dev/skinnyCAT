// Asks a deployed scETC for transferDigest, withdrawDigest and accountOf on a spread of inputs, and
// writes the answers to src/test/fixtures/digests.json. src/ledger.test.ts checks the page's
// JavaScript against them. e2e/run.sh runs this against anvil after deploying.
//
//   node scripts/digest-fixture.mjs <rpc url> <scETC address>
import { writeFileSync } from "node:fs";
import { createPublicClient, http, keccak256, stringToHex } from "viem";
import { ledgerAbi } from "../src/generated/contracts.ts";

const [rpc, ledger] = process.argv.slice(2);
if (!rpc || !ledger) throw new Error("usage: digest-fixture.mjs <rpc> <ledger>");
const c = createPublicClient({ transport: http(rpc) });
const chainId = await c.getChainId();

const h = (s) => keccak256(stringToHex(s));
const addr = (s) => `0x${h(s).slice(26)}`;
const MAX = 2n ** 256n - 1n;
const memos = [
  "The first payment using a quantum-safe signature on Ethereum Classic, by Classix.dev",
  "",
  "thanks",
  "Grüße 🔐, \"quoted\" and\nnew line",
  "x".repeat(300),
];
const cases = [];
memos.forEach((memo, i) => {
  for (const kind of ["transfer", "withdraw"]) {
    cases.push({
      kind,
      from: addr(`from ${i}`),
      nonce: [0n, 1n, 7n, 2n ** 64n, MAX][i],
      to: addr(`to ${i}`),
      amount: [4n * 10n ** 17n, 0n, 1n, MAX, 10n ** 18n][i],
      fee: [0n, 10n ** 15n, MAX, 1n, 0n][i],
      deadline: [1_800_000_000n, 0n, MAX, 1n, 2_000_000_000n][i],
      memo,
    });
  }
});
const digests = [];
for (const k of cases) {
  const digest = await c.readContract({
    address: ledger,
    abi: ledgerAbi,
    functionName: k.kind === "transfer" ? "transferDigest" : "withdrawDigest",
    args: [k.from, k.nonce, k.to, k.amount, k.fee, k.deadline, k.memo],
  });
  digests.push({ ...k, nonce: `${k.nonce}`, amount: `${k.amount}`, fee: `${k.fee}`, deadline: `${k.deadline}`, digest });
}
const accounts = [];
for (let i = 0; i < 4; i++) {
  // The contract reads bytes16 of each word, so the low halves shouldn't matter. Case 3 fills them.
  const pkSeed = i === 3 ? h("seed 3") : `${h(`seed ${i}`).slice(0, 34)}${"0".repeat(32)}`;
  const pkRoot = i === 3 ? h("root 3") : `${h(`root ${i}`).slice(0, 34)}${"0".repeat(32)}`;
  const account = await c.readContract({ address: ledger, abi: ledgerAbi, functionName: "accountOf", args: [pkSeed, pkRoot] });
  accounts.push({ pkSeed, pkRoot, account });
}
const tags = {
  TRANSFER_TAG: await c.readContract({ address: ledger, abi: ledgerAbi, functionName: "TRANSFER_TAG" }),
  WITHDRAW_TAG: await c.readContract({ address: ledger, abi: ledgerAbi, functionName: "WITHDRAW_TAG" }),
};
writeFileSync(
  new URL("../src/test/fixtures/digests.json", import.meta.url),
  JSON.stringify({ note: "Produced by scripts/digest-fixture.mjs from a deployed scETC on anvil.", chainId, ledger, tags, accounts, digests }, null, 1) + "\n",
);
console.log(`wrote ${digests.length} digests and ${accounts.length} accounts from scETC at ${ledger}, chain ${chainId}`);
