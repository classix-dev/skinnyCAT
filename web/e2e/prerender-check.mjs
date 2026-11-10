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
  "A proof of concept and an experiment, built for fun.",
  "quantum computer can&#x27;t spend the funds",
  "Two Keys",
  "Alice Deposits and Pays Bob",
  "Bob Pays Back Without ETC",
  "Bob never needs ETC.",
  "Create Key",
  "How It Works",
  `Alice&#x27;s browser wallet to ${SYM}: transfer, with 1 ETC attached.`,
  "Frame Transactions Instead of Meta-Transactions",
  "https://eips.ethereum.org/EIPS/eip-8141",
  "https://eips.ethereum.org/EIPS/eip-8288",
  "Current Limitations",
  "https://github.com/ethereum/EthLib/commit/dce7a2de23a973d84eac38126a1527763cd3465d",
  "Credits",
  "https://classix.dev",
])
  check(root.includes(s), `pre-rendered: ${s.replace(/&#x27;/g, "'")}`);

// Nothing anywhere in the build mentions the old testnet.
const files = readdirSync(dist, { recursive: true }).filter((f) => /\.(html|js|css|json|webmanifest|txt)$/.test(f));
const hits = files.filter((f) => /mordor|\bMETC\b/i.test(readFileSync(join(dist, f), "utf8")));
check(hits.length === 0, `no "Mordor" or "METC" in ${files.length} built files${hits.length ? `: ${hits.join(", ")}` : ""}`);

if (bad) {
  console.log(`\n${bad} pre-render check(s) failed`);
  process.exit(1);
}
