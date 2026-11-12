// Renders the favicons, app icons and the OG image from the art in src/components/catArt.ts,
// with Playwright's Chromium, into public/.
//
//   PLAYWRIGHT_BROWSERS_PATH=$(nix build --no-link --print-out-paths nixpkgs#playwright-driver.browsers) \
//   nix shell nixpkgs#playwright-driver.browsers nixpkgs#nodejs_22 -c \
//     node --experimental-strip-types --no-warnings scripts/icons.mjs
//
// The browsers only find their libraries inside the nix shell, and headless Chromium wants a
// fontconfig setup (e2e/run.sh shows one).

import { readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
import { BRAND, faviconSvg, markSvg } from "../src/components/catArt.ts";

const pub = (f) => new URL(`../public/${f}`, import.meta.url).pathname;
// Fonts go in as data URLs, since a page made with setContent can't load file: URLs.
const font = (f) => `data:font/woff2;base64,${readFileSync(new URL(`../node_modules/${f}`, import.meta.url)).toString("base64")}`;

const page = async (browser, w, h, html) => {
  const p = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await p.setContent(`<!doctype html><html><head><style>html,body{margin:0;width:${w}px;height:${h}px;overflow:hidden;background:transparent}</style></head><body>${html}</body></html>`);
  await p.evaluate(() => document.fonts.ready);
  return p;
};
const png = async (browser, w, h, html, file, transparent = false) => {
  const p = await page(browser, w, h, html);
  const buf = await p.screenshot({ omitBackground: transparent, type: "png" });
  if (file) writeFileSync(pub(file), buf);
  await p.close();
  return buf;
};

/** An ICO file that wraps PNG images, as every current browser reads them. */
function ico(images) {
  const head = Buffer.alloc(6 + 16 * images.length);
  head.writeUInt16LE(0, 0);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(images.length, 4);
  let offset = head.length;
  images.forEach(({ size, data }, i) => {
    const e = 6 + 16 * i;
    head.writeUInt8(size >= 256 ? 0 : size, e);
    head.writeUInt8(size >= 256 ? 0 : size, e + 1);
    head.writeUInt16LE(1, e + 4);
    head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(data.length, e + 8);
    head.writeUInt32LE(offset, e + 12);
    offset += data.length;
  });
  return Buffer.concat([head, ...images.map((x) => x.data)]);
}

const fav = faviconSvg();
const favAt = (s) => `<div style="width:${s}px;height:${s}px">${fav.replace("<svg ", `<svg width="${s}" height="${s}" `)}</div>`;
// The whole mark on a navy tile, for app icons. rounded is for icons nobody masks for us.
const tile = (s, { pad = 0.14, radius = 0 } = {}) =>
  `<div style="width:${s}px;height:${s}px;background:radial-gradient(circle at 50% 35%,#0e1a3a,${BRAND.navy} 70%);border-radius:${radius * s}px;display:flex;align-items:center;justify-content:center">${markSvg(Math.round(s * (1 - 2 * pad)))}</div>`;

const og = `
<style>
@font-face{font-family:Bricolage;src:url(${font("@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-opsz-normal.woff2")}) format("woff2");font-weight:200 800}
@font-face{font-family:GeistMono;src:url(${font("@fontsource-variable/geist-mono/files/geist-mono-latin-wght-normal.woff2")}) format("woff2");font-weight:100 900}
.og{position:relative;width:1200px;height:630px;background:${BRAND.navy};overflow:hidden;font-family:Bricolage,sans-serif;color:#e9eeff}
.grid{position:absolute;inset:0;background-image:radial-gradient(700px 420px at 78% 0%,rgba(37,99,235,.28),transparent 70%),radial-gradient(520px 360px at 8% 100%,rgba(94,228,255,.10),transparent 70%),linear-gradient(to right,rgba(76,141,255,.07) 1px,transparent 1px),linear-gradient(to bottom,rgba(76,141,255,.07) 1px,transparent 1px);background-size:auto,auto,48px 48px,48px 48px}
.mark{position:absolute;left:70px;top:95px}
.text{position:absolute;left:560px;top:150px;right:60px}
h1{margin:0;font-size:124px;line-height:1;font-weight:650;letter-spacing:-.04em}
h1 b{color:${BRAND.cyan};font-weight:780;letter-spacing:-.01em}
p{margin:26px 0 0;font-size:38px;line-height:1.2;color:#c9d6ff;letter-spacing:-.015em}
.small{margin-top:22px;line-height:1.45;font-family:GeistMono,monospace;font-size:22px;color:#7d8bad;letter-spacing:0}
.foot{position:absolute;left:560px;bottom:70px;font-size:24px;color:#9aa8c8}
.foot span{color:#fbbf5b}
</style>
<div class="og"><div class="grid"></div>
<div class="mark">${markSvg(440)}</div>
<div class="text"><h1>skinny<b>CAT</b></h1>
<p>Quantum-safe payments on Ethereum Classic</p>
<div class="small">leanSPHINCS, hash-based signatures<br>made in your browser</div></div>
<div class="foot">An educational demo by Classix · <span>not a production app</span></div>
</div>`;

const browser = await chromium.launch();
try {
  writeFileSync(pub("favicon.svg"), `${fav}\n`);
  const sizes = {};
  for (const s of [16, 32, 48]) sizes[s] = await png(browser, s, s, favAt(s), s === 48 ? null : `favicon-${s}x${s}.png`, true);
  writeFileSync(pub("favicon.ico"), ico([16, 32, 48].map((size) => ({ size, data: sizes[size] }))));
  await png(browser, 180, 180, tile(180), "apple-touch-icon.png");
  await png(browser, 192, 192, tile(192, { radius: 0.2 }), "icon-192.png", true);
  await png(browser, 512, 512, tile(512, { radius: 0.2 }), "icon-512.png", true);
  await png(browser, 1200, 630, og, "og.png");
  console.log("wrote favicon.svg, favicon.ico, favicon-16x16.png, favicon-32x32.png, apple-touch-icon.png, icon-192.png, icon-512.png, og.png");
} finally {
  await browser.close();
}
