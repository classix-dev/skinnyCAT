// Copies three of EthLib's leanSPHINCS verify vectors (valid, tampered, malformed) into
// src/generated/vectors.json for the page's self-test. Which vectors to read follows the verifier
// that script/Deploy.s.sol deploys, since the spec versions don't verify each other's signatures
// and lay out the public key differently.
//
// Reads EthLib's own files (<dir>/verify/<case>/data.yaml, copied unchanged from EthLib), or a single
// JSON file with a `verify` array. Override with
//   PQ_VECTORS=path PQ_PK_LAYOUT=seed-root node scripts/extract-vectors.mjs
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, deployInfo, fail } from "./deploy-info.mjs";

// pk layout: "seed-root" is PK.seed ‖ PK.root (FIPS 205, EthLib dce7a2d), "root-seed" is the
// 2026-11-03 version's root ‖ P.
const FIXTURES = {
  LeanSphincsVerifier: { path: "test/fixtures/ethlib-sphincs", layout: "seed-root" },
  LeanSphincsLayeredAsm: { path: "test/fixtures/leansphincs-layered-ethlib.json", layout: "root-seed" },
};

const { verifier } = deployInfo();
const pick = process.env.PQ_VECTORS
  ? { path: process.env.PQ_VECTORS, layout: process.env.PQ_PK_LAYOUT ?? fail("PQ_VECTORS needs PQ_PK_LAYOUT (seed-root or root-seed)") }
  : FIXTURES[verifier];
if (!pick) fail(`script/Deploy.s.sol deploys ${verifier}, and scripts/extract-vectors.mjs doesn't know its vectors. Add it to FIXTURES.`);
if (!["seed-root", "root-seed"].includes(pick.layout)) fail(`unknown public key layout ${pick.layout}`);
const path = pick.path.startsWith("/") ? pick.path : join(ROOT, pick.path);
if (!existsSync(path)) fail(`missing vectors for ${verifier}: ${path}`);

/** EthLib's data.yaml (format.md): `input:`, indented `key: '0x..'` lines, then `output: ...`. */
function readYaml(file) {
  const value = (s) => (s === "null" ? null : s === "true" ? true : s === "false" ? false : s.replace(/^'|'$/g, "").toLowerCase());
  const input = {};
  let output;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    let m = line.match(/^ {2}(\w+): (.*)$/);
    if (m) input[m[1]] = value(m[2].trim());
    m = line.match(/^output: (.*)$/);
    if (m) output = value(m[1].trim());
  }
  if (output === undefined) fail(`${file}: no output`);
  return { ...input, output };
}

let all;
let commit = null;
if (statSync(path).isDirectory()) {
  const dir = join(path, "verify");
  if (!existsSync(dir)) fail(`${path} has no verify/ directory`);
  all = readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(dir, e.name, "data.yaml")))
    .map((e) => ({ name: e.name, ...readYaml(join(dir, e.name, "data.yaml")) }));
  const readme = join(path, "README.md");
  if (existsSync(readme)) commit = (readFileSync(readme, "utf8").match(/\b[0-9a-f]{40}\b/) ?? [null])[0];
} else {
  const src = JSON.parse(readFileSync(path, "utf8"));
  // `output` true/false/null, or `outcome` "true"/"false"/"reject".
  all = (src.verify ?? []).map((v) => ({
    ...v,
    output: "outcome" in v ? (v.outcome === "reject" ? null : v.outcome === "true") : v.output,
  }));
  commit = src.source?.commit ?? null;
}
if (!all.length) fail(`${path} has no verify vectors`);
for (const v of all)
  if (![true, false, null].includes(v.output) || !v.public_key || !v.message || !v.signature) fail(`${path}: can't read ${v.name}`);

const choose = (preferred, want) =>
  all.find((v) => v.name === preferred && v.output === want) ?? all.find((v) => v.output === want) ?? fail(`${path} has no verify vector with output ${want}`);
const verify = [
  choose("verify_valid_known_answer", true),
  choose("verify_tampered_fors_secret", false),
  choose("verify_short_signature", null),
].map(({ name, public_key, message, signature, output }) => ({ name, public_key, message, signature, output }));
const valid = verify[0];
if (valid.public_key.length !== 66 || valid.message.length !== 66 || valid.signature.length !== 2 + 2 * 7740)
  fail(`${path}: ${valid.name} doesn't have a 32-byte key, a 32-byte message and a 7,740-byte signature`);

writeFileSync(
  new URL("../src/generated/vectors.json", import.meta.url),
  JSON.stringify({ verifier, fixture: pick.path, pkLayout: pick.layout, commit, verify }, null, 1) + "\n",
);
console.log(`vectors for ${verifier} from ${pick.path} (${pick.layout}, ${commit ?? "commit unknown"}):`, verify.map((v) => `${v.name}=${v.output}`).join(", "));
