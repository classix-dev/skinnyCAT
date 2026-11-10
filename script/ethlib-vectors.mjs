#!/usr/bin/env node
// Converts EthLib's leanSPHINCS vectors (test/fixtures/ethlib-sphincs/<op>/<case>/data.yaml, copied
// unchanged from EthLib) to JSON, since Foundry reads JSON but not YAML. It writes a data.json next
// to each data.yaml and index.json with the case names, which the Foundry tests read (one small
// file per case keeps them from copying 500 KB of JSON into EVM memory for every field). It also
// writes vectors.json, every case in one file, which web/scripts/extract-vectors.mjs reads.
//
//   node script/ethlib-vectors.mjs
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = new URL("../test/fixtures/ethlib-sphincs/", import.meta.url).pathname;

function parseValue(s) {
  s = s.trim();
  if (s === "null") return null;
  if (s === "true") return true;
  if (s === "false") return false;
  if (s.startsWith("'") && s.endsWith("'")) return s.slice(1, -1).toLowerCase();
  throw new Error(`unexpected value ${s.slice(0, 40)}`);
}

// The shape is fixed by format.md: `input:`, indented `key: '0x..'` lines, then `output: ...`.
function parseCase(text) {
  const input = {};
  let output;
  for (const line of text.split("\n")) {
    if (line === "" || line === "input:") continue;
    let m = line.match(/^ {2}(\w+): (.*)$/);
    if (m) {
      input[m[1]] = parseValue(m[2]);
      continue;
    }
    m = line.match(/^output: (.*)$/);
    if (m) {
      output = parseValue(m[1]);
      continue;
    }
    throw new Error(`unexpected line ${line.slice(0, 40)}`);
  }
  if (output === undefined) throw new Error("no output");
  return { input, output };
}

const index = {};
const all = {
  source: "ethereum/EthLib tests/cryptography/sphincs",
  commit: "dce7a2de23a973d84eac38126a1527763cd3465d",
};
for (const op of ["key_gen", "sign", "verify"]) {
  const names = readdirSync(join(dir, op), { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
  for (const name of names) {
    const { input, output } = parseCase(readFileSync(join(dir, op, name, "data.yaml"), "utf8"));
    // Foundry's JSON reader wants one type per key: the outcome is a string, and a bytes output
    // is "0x" when the input is rejected.
    const outcome = output === null ? "reject" : typeof output === "boolean" ? String(output) : "bytes";
    const json = { name, ...input, outcome, output: typeof output === "string" ? output : "0x" };
    writeFileSync(join(dir, op, name, "data.json"), JSON.stringify(json, null, 1) + "\n");
    (all[op] ??= []).push(json);
  }
  index[op] = names;
}
writeFileSync(join(dir, "index.json"), JSON.stringify(index, null, 1) + "\n");
writeFileSync(join(dir, "vectors.json"), JSON.stringify(all, null, 1) + "\n");
console.log(Object.fromEntries(Object.entries(index).map(([k, v]) => [k, v.length])));
