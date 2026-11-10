// Screenshots of the explainer preview, every scene at 1440 and 390 px, into screenshots/viz/.
//
//   VIZ_URL=http://127.0.0.1:4518/viz.html node scripts/viz-shots.mjs [final|reduced|frames|live]
//
// final    every scene frozen on its last frame (?at=1), both widths
// reduced  prefers-reduced-motion, no freezing, both widths
// frames   a frame sequence of each scene at 1440 (?at=0.05 .. 1)
// live     the real animation, sampled every 400 ms for the first scenes, plus a signing run
// Needs Playwright's Chromium (see e2e/run.sh for the nix setup).
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const URL_BASE = process.env.VIZ_URL ?? "http://127.0.0.1:4518/viz.html";
const OUT = new URL("../screenshots/viz/", import.meta.url).pathname;
const SCENES = ["hash", "chain", "wots", "merkle", "fors", "hypertree", "anatomy", "verify"];
const mode = process.argv[2] ?? "final";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const errors = [];

async function open(width, query = "", opts = {}) {
  const ctx = await browser.newContext({
    viewport: { width, height: width < 600 ? 844 : 900 },
    deviceScaleFactor: width < 600 ? 2 : 1,
    reducedMotion: opts.reduced ? "reduce" : "no-preference",
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`${width}${query}: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && errors.push(`${width}${query}: ${m.text()}`));
  await page.goto(URL_BASE + query, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  return { ctx, page };
}

async function sceneShot(page, id, file) {
  const sec = page.locator(`#how-${id}`);
  await sec.scrollIntoViewIfNeeded();
  await sec.locator("figure").waitFor({ timeout: 10_000 });
  await page.waitForTimeout(250);
  await sec.screenshot({ path: OUT + file });
}

if (mode === "final" || mode === "reduced") {
  for (const width of [1440, 390]) {
    const reduced = mode === "reduced";
    const { ctx, page } = await open(width, reduced ? "" : "?at=1", { reduced });
    const tag = `${reduced ? "reduced" : "final"}-${width}`;
    await page.screenshot({ path: `${OUT}${tag}-00-intro.png` });
    for (const [i, id] of SCENES.entries()) await sceneShot(page, id, `${tag}-${String(i + 1).padStart(2, "0")}-${id}.png`);
    const q = page.locator("#how-quantum-h");
    await q.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${OUT}${tag}-09-quantum.png` });
    await ctx.close();
  }
}

if (mode === "frames") {
  const fracs = (process.env.FRACS ?? "0.05,0.15,0.3,0.45,0.6,0.75,0.9,1").split(",");
  const only = process.env.SCENES?.split(",") ?? SCENES;
  const width = Number(process.env.WIDTH ?? 1440);
  for (const f of fracs) {
    const { ctx, page } = await open(width, `?at=${f}`);
    for (const id of only) await sceneShot(page, id, `frames-${width}-${id}-${f}.png`);
    await ctx.close();
  }
}

if (mode === "live") {
  const width = Number(process.env.WIDTH ?? 1440);
  const { ctx, page } = await open(width);
  for (const id of (process.env.SCENES ?? "wots").split(",")) {
    const sec = page.locator(`#how-${id}`);
    await sec.scrollIntoViewIfNeeded();
    await sec.locator("figure").waitFor();
    const t0 = Date.now();
    for (let k = 0; Date.now() - t0 < Number(process.env.MS ?? 20000); k++) {
      await sec.screenshot({ path: `${OUT}live-${width}-${id}-${String(k).padStart(3, "0")}.png` });
      await page.waitForTimeout(350);
    }
  }
  if (process.env.SIGN) {
    await page.locator("#sx-msg").scrollIntoViewIfNeeded();
    await page.fill("#sx-msg", process.env.SIGN);
    const t0 = Date.now();
    await page.getByRole("button", { name: "Sign", exact: true }).click();
    await page.waitForSelector("text=Signed in this browser", { timeout: 60_000 });
    console.log(`signed in the page in ${Date.now() - t0} ms`);
    await page.screenshot({ path: `${OUT}live-${width}-signed.png` });
  }
  await ctx.close();
}

await browser.close();
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(`screenshots in ${OUT}`);
