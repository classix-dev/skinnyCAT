// Pre-renders the page: renders App with the SSR build in .ssr/ and puts the HTML into
// dist/index.html, where the client hydrates it.
import { readFileSync, rmSync, writeFileSync } from "node:fs";

const dist = new URL("../dist/index.html", import.meta.url);
const html = readFileSync(dist, "utf8");
const MARK = "<!--app-html-->";
if (!html.includes(MARK)) throw new Error(`dist/index.html has no ${MARK}`);
const { render } = await import(new URL("../.ssr/entry-server.js", import.meta.url).href);
const body = render();
for (const s of ["How It Works", "Frame Transactions Instead of Meta-Transactions", "Current Limitations", "Two Keys"])
  if (!body.includes(s)) throw new Error(`pre-rendered HTML lacks "${s}"`);
writeFileSync(dist, html.replace(MARK, body));
rmSync(new URL("../.ssr/", import.meta.url), { recursive: true, force: true });
console.log(`pre-rendered ${(body.length / 1024).toFixed(1)} KB into dist/index.html`);
