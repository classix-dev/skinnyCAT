// Copies two of EthLib's leanSPHINCS verify vectors (one valid, one tampered) out of the
// 450 KB fixture into src/generated/vectors.json for the page's self-test.
import { readFileSync, writeFileSync } from "node:fs";

const src = JSON.parse(
  readFileSync(new URL("../../test/fixtures/leansphincs-layered-ethlib.json", import.meta.url), "utf8"),
);
const pick = ["verify_valid_known_answer", "verify_tampered_fors_secret"];
const verify = pick.map((name) => {
  const c = src.verify.find((v) => v.name === name);
  if (!c) throw new Error(`missing ${name}`);
  return { name: c.name, public_key: c.public_key, message: c.message, signature: c.signature, output: c.output };
});
writeFileSync(
  new URL("../src/generated/vectors.json", import.meta.url),
  JSON.stringify({ source: src.source.pr, commit: src.source.commit, verify }, null, 1) + "\n",
);
console.log("wrote", verify.map((v) => `${v.name}=${v.output}`).join(", "));
