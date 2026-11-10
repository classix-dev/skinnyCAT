// Reads what script/Deploy.s.sol deploys, so the generators never hard-code a contract name.
// Everything here fails loudly: a wrong guess would ship a page that checks the wrong contract.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { keccak256, toHex } from "viem";

export const ROOT = new URL("../../", import.meta.url).pathname;
export const OUT = process.env.FOUNDRY_OUT ? new URL(`file://${process.env.FOUNDRY_OUT}/`).pathname : join(ROOT, "out");

export function fail(msg) {
  console.error(`\n${msg}\n`);
  process.exit(1);
}

function need(re, text, what) {
  const m = text.match(re);
  if (!m) fail(`script/Deploy.s.sol: can't find ${what} (looked for ${re}). Update web/scripts/deploy-info.mjs.`);
  return m;
}

/** The verifier and ledger names, the ledger's constructor strings and the CREATE2 salt. */
export function deployInfo() {
  const file = join(ROOT, "script/Deploy.s.sol");
  if (!existsSync(file)) fail(`missing ${file}`);
  const s = readFileSync(file, "utf8");
  const salt = need(/SALT\s*=\s*keccak256\(\s*"([^"]+)"\s*\)/, s, "the SALT")[1];
  const vVar = need(/\bverifier\s*=\s*vm\.computeCreate2Address\(\s*SALT\s*,\s*keccak256\(\s*(\w+)\s*\)\s*\)/, s, "the verifier address")[1];
  const vInit = need(new RegExp(`bytes\\s+memory\\s+${vVar}\\s*=\\s*([^;]+);`), s, `the definition of ${vVar}`)[1];
  const vm = vInit.match(/^type\((\w+)\)\.creationCode$/);
  if (!vm) fail(`script/Deploy.s.sol: the verifier's init code is "${vInit}". The generator handles only type(X).creationCode, a verifier without constructor arguments.`);
  const lVar = need(/\bledger\s*=\s*vm\.computeCreate2Address\(\s*SALT\s*,\s*keccak256\(\s*(\w+)\s*\)\s*\)/, s, "the ledger address")[1];
  const lm = need(
    new RegExp(
      `bytes\\s+memory\\s+${lVar}\\s*=\\s*abi\\.encodePacked\\(\\s*type\\((\\w+)\\)\\.creationCode\\s*,\\s*abi\\.encode\\(\\s*verifier\\s*,\\s*"([^"]*)"\\s*,\\s*"([^"]*)"\\s*\\)\\s*\\)`,
    ),
    s,
    `the ledger init code (abi.encodePacked(type(X).creationCode, abi.encode(verifier, "name", "symbol")))`,
  );
  return { salt, verifier: vm[1], ledger: lm[1], ledgerName: lm[2], ledgerSymbol: lm[3] };
}

/** The Foundry artifact of a contract under src/, checked against the current sources. */
export function artifact(name) {
  if (!existsSync(OUT)) fail(`no Foundry build at ${OUT}. Run \`forge build\` in the repo root first.`);
  const hits = [];
  for (const d of readdirSync(OUT, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    const f = join(OUT, d.name, `${name}.json`);
    if (!existsSync(f)) continue;
    const a = JSON.parse(readFileSync(f, "utf8"));
    const target = Object.entries(a.metadata?.settings?.compilationTarget ?? {});
    if (target.some(([path, n]) => n === name && path.startsWith("src/"))) hits.push({ file: f, a });
  }
  if (!hits.length) fail(`no artifact for ${name} under ${OUT}. Run \`forge build\` in the repo root (is src/${name}.sol there?).`);
  if (hits.length > 1) fail(`${hits.length} artifacts named ${name} under ${OUT}: ${hits.map((h) => h.file).join(", ")}`);
  const { a } = hits[0];
  // Every source the contract was compiled from must still hash the same, or the build is stale.
  for (const [path, meta] of Object.entries(a.metadata.sources ?? {})) {
    const p = join(ROOT, path);
    if (!existsSync(p)) fail(`${name} was built from ${path}, which no longer exists. Run \`forge build\`.`);
    const h = keccak256(toHex(readFileSync(p)));
    if (meta.keccak256 && h !== meta.keccak256) fail(`${path} changed since the last build of ${name}. Run \`forge build\`.`);
  }
  if (Object.keys(a.bytecode?.linkReferences ?? {}).length) fail(`${name} needs linked libraries, which the generator doesn't handle.`);
  return a;
}
