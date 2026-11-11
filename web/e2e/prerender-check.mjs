// Checks the built site: dist/index.html carries the pre-rendered page, and no file mentions the
// old testnet.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const dist = new URL("../dist/", import.meta.url).pathname;
const html = readFileSync(join(dist, "index.html"), "utf8");
const SYM = readFileSync(new URL("../src/generated/contracts.ts", import.meta.url), "utf8").match(/LEDGER_SYMBOL = "([^"]+)"/)[1];
let bad = 0;
const check = (ok, what) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
  if (!ok) bad++;
};

const root = html.match(/<div id="root">([\s\S]*)<\/div>\s*<noscript/)?.[1] ?? "";
check(root.length > 20_000, `#root is pre-rendered (${(root.length / 1024).toFixed(0)} KB)`);
check(!html.includes("<!--app-html-->"), "placeholder replaced");
const title = html.match(/<title>(.*?)<\/title>/)?.[1] ?? "";
check(!/wallet/i.test(title), `title doesn't say wallet: ${title}`);
const h1 = root.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1]?.replace(/<[^>]+>/g, "") ?? "";
check(h1 === "Quantum-Secure Payments on Ethereum Classic", `h1: ${h1}`);
check(!/wallet/i.test(h1), "h1 doesn't say wallet");
for (const s of [
  "skinnyCAT moves ETC with a leanSPHINCS signature, which a quantum computer can&#x27;t forge.",
  "An educational demo, not a production app.",
  "Two Cats, Two Keys",
  ">skinny<span",
  "Alice Deposits and Pays Bob",
  "Bob Pays Back Without ETC",
  "Create Key",
  "How It Works",
  `Alice&#x27;s browser wallet to ${SYM}: transfer, with 1 ETC attached.`,
  "Frame Transactions Instead of Meta-Transactions",
  "https://eips.ethereum.org/EIPS/eip-8141",
  "https://eips.ethereum.org/EIPS/eip-8288",
  "Aggregation</h2>",
  'id="aggregation"',
  "Five steps, shown here at the end.",
  "1 proof",
  "What ETC Can Do",
  "Key Degradation</h2>",
  "Never sign more than",
  "aria-label=\"On this page\"",
  "Current Limitations",
  "https://github.com/ethereum/EthLib/commit/dce7a2de23a973d84eac38126a1527763cd3465d",
  "Credits",
  "https://classix.dev",
])
  check(root.includes(s), `pre-rendered: ${s.replace(/&#x27;/g, "'")}`);

check(root.includes('data-testid="agg-stage-wide"') && root.includes('data-testid="agg-stage-tall"') && !root.includes("agg-go"), "pre-rendered: the aggregation picture, still, at the end of step 5");

// Nothing anywhere in the build mentions the old testnet.
const files = readdirSync(dist, { recursive: true }).filter((f) => /\.(html|js|css|json|webmanifest|txt)$/.test(f));
const hits = files.filter((f) => /mordor|\bMETC\b/i.test(readFileSync(join(dist, f), "utf8")));
check(hits.length === 0, `no "Mordor" or "METC" in ${files.length} built files${hits.length ? `: ${hits.join(", ")}` : ""}`);

if (bad) {
  console.log(`\n${bad} pre-render check(s) failed`);
  process.exit(1);
}
