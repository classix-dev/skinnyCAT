// Drives the built app against anvil: create key, fund, send (createAndExecute), send again
// (execute), forget and re-import the key. Takes screenshots into web/screenshots/.
//
// Run through e2e/run.sh, which starts anvil, deploys and serves the app.

import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { createPublicClient, http, parseEther } from "viem";

const RPC = process.env.ANVIL_RPC ?? "http://127.0.0.1:8545";
const APP = process.env.APP_URL ?? "http://127.0.0.1:4173/";
const SHOTS = new URL("../screenshots/", import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });

// anvil's default account 1 pays gas. Account 0 deployed the contracts.
const GAS_ACCOUNT = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const RECIPIENT_1 = "0x000000000000000000000000000000000000dEaD";
const RECIPIENT_2 = "0x1111111111111111111111111111111111111111";

const rpc = createPublicClient({ transport: http(RPC) });

let failures = 0;
function check(cond, what) {
  console.log(`${cond ? "ok  " : "FAIL"} ${what}`);
  if (!cond) failures++;
}

/** Runs in the page before the app. An EIP-1193 provider backed by an unlocked anvil account. */
function injectTestWallet({ rpc, account }) {
  window.__PQ_CONFIG_OVERRIDE__ = {
    mordor: { rpcUrls: [rpc], explorer: "https://etc-mordor.blockscout.com" },
  };
  let id = 0;
  const listeners = {};
  const forward = async (method, params) => {
    const res = await fetch(rpc, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params: params ?? [] }),
    });
    const j = await res.json();
    if (j.error) throw Object.assign(new Error(j.error.message), { code: j.error.code, data: j.error.data });
    return j.result;
  };
  window.__walletCalls = [];
  const provider = {
    isTestWallet: true,
    async request({ method, params }) {
      window.__walletCalls.push(method);
      switch (method) {
        case "eth_requestAccounts":
        case "eth_accounts":
          return [account];
        case "wallet_switchEthereumChain":
          if (params?.[0]?.chainId !== "0x3f") throw Object.assign(new Error("Unrecognized chain"), { code: 4902 });
          return null;
        case "wallet_addEthereumChain":
          return null;
        default:
          return forward(method, params);
      }
    },
    on(ev, fn) {
      (listeners[ev] ??= []).push(fn);
    },
    removeListener(ev, fn) {
      listeners[ev] = (listeners[ev] ?? []).filter((f) => f !== fn);
    },
  };
  const info = {
    uuid: "4b1f9c1e-0000-4000-8000-00000000anvil",
    name: "Anvil Test Wallet",
    icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1'%3E%3Crect width='1' height='1' fill='%23a8f0a0'/%3E%3C/svg%3E",
    rdns: "dev.classix.anvil-test",
  };
  const announce = () =>
    window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: Object.freeze({ info, provider }) }));
  window.addEventListener("eip6963:requestProvider", announce);
  announce();
}

async function newPage(browser, viewport) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: viewport.width < 500 ? 2 : 1 });
  await ctx.addInitScript(injectTestWallet, { rpc: RPC, account: GAS_ACCOUNT });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => check(false, `page error: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && console.log("console:", m.text()));
  await page.goto(APP);
  return { ctx, page };
}

const balanceOf = (address) => rpc.getBalance({ address });

async function waitStep(page, id, timeout = 120_000) {
  await page.waitForFunction(
    (id) => ["ok", "fail"].includes(document.getElementById(`step-${id}`)?.dataset.state ?? ""),
    id,
    { timeout },
  );
  const state = await page.getAttribute(`#step-${id}`, "data-state");
  const detail = await page.textContent(`#step-${id} .detail`);
  return { state, detail };
}

async function send(page, to, amount) {
  await page.fill("#send-to", to);
  await page.fill("#send-amount", amount);
  await page.click("#send-go");
  const steps = {};
  for (const id of ["message", "signature", "local", "onchain", "simulate", "sent", "confirmed"]) {
    steps[id] = await waitStep(page, id);
    if (steps[id].state !== "ok") {
      console.log(`step ${id} failed: ${steps[id].detail}`);
      break;
    }
  }
  return steps;
}

async function shot(page, name, fullPage = true) {
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.screenshot({ path: `${SHOTS}${name}.png`, fullPage });
}

const browser = await chromium.launch();
try {
  // ---- desktop flow
  const { page } = await newPage(browser, { width: 1280, height: 900 });
  await page.waitForSelector("#selftest[data-state]", { timeout: 60_000 });
  const label = await page.textContent("#selftest-label");
  check((await page.getAttribute("#selftest", "data-state")) === "ok", `self-tests: ${label}`);
  if ((await page.getAttribute("#selftest", "data-state")) !== "ok") {
    await page.click("#selftest summary");
    console.log(await page.textContent("#selftest-list"));
  }
  await shot(page, "desktop-1-start");

  // Create key
  await page.click("#key-create");
  await page.waitForSelector("#key-have:not([hidden])", { timeout: 60_000 });
  await page.waitForFunction(() => document.getElementById("wallet-deployed")?.textContent?.includes("Not deployed"), null, {
    timeout: 30_000,
  });
  const walletAddr = (await page.textContent("#wallet-address")).trim();
  const pk = (await page.textContent("#key-pk")).trim();
  const words = await page.$$eval("#key-words li", (l) => l.map((x) => x.textContent));
  check(/^0x[0-9a-fA-F]{40}$/.test(walletAddr), `wallet address ${walletAddr}`);
  check(/^0x[0-9a-f]{64}$/.test(pk), `public key ${pk.slice(0, 18)}…`);
  check(words.length === 24, `backup phrase has ${words.length} words`);
  await shot(page, "desktop-2-key");

  // Connect
  await page.click('#web3-providers button[data-rdns="dev.classix.anvil-test"]');
  await page.waitForSelector("#web3-have:not([hidden])");
  check((await page.inputValue("#send-to")) === GAS_ACCOUNT, "recipient defaults to the connected account");

  // Fund
  await page.fill("#fund-amount", "0.05");
  await page.click("#fund-go");
  await page.waitForFunction(() => /Funded|reverted|rror/.test(document.getElementById("fund-status")?.textContent ?? ""), null, {
    timeout: 60_000,
  });
  const fundStatus = await page.textContent("#fund-status");
  check(fundStatus.includes("Funded"), `fund: ${fundStatus}`);
  check((await balanceOf(walletAddr)) === parseEther("0.05"), "wallet holds 0.05 on chain");
  await page.waitForFunction(() => document.getElementById("wallet-balance")?.textContent?.startsWith("0.05"));
  await shot(page, "desktop-3-funded");

  // First send: createAndExecute
  const before1 = await balanceOf(RECIPIENT_1);
  const s1 = await send(page, RECIPIENT_1, "0.01");
  check(s1.signature?.detail.startsWith("7,740 bytes"), `signature: ${s1.signature?.detail}`);
  check(s1.onchain?.state === "ok", `on-chain verify: ${s1.onchain?.detail}`);
  check(s1.simulate?.detail.includes("createAndExecute"), `simulate: ${s1.simulate?.detail}`);
  check(s1.confirmed?.state === "ok", `first send confirmed: ${s1.confirmed?.detail}`);
  const hash1 = (await page.textContent("#step-sent .detail")).trim();
  const r1 = await rpc.getTransactionReceipt({ hash: hash1 });
  check(r1.status === "success" && r1.type === "legacy", `receipt 1 status ${r1.status}, type ${r1.type}, gas ${r1.gasUsed}`);
  check((await balanceOf(RECIPIENT_1)) - before1 === parseEther("0.01"), "recipient 1 got 0.01");
  const explorerHref = await page.getAttribute("#step-explorer a", "href");
  check(explorerHref === `https://etc-mordor.blockscout.com/tx/${hash1}`, `explorer link ${explorerHref}`);
  await page.waitForFunction(() => document.getElementById("wallet-nonce")?.textContent === "1");
  check((await page.textContent("#wallet-deployed")).includes("Deployed"), "wallet shows as deployed");
  await shot(page, "desktop-4-sent");

  // Second send: execute
  const before2 = await balanceOf(RECIPIENT_2);
  const s2 = await send(page, RECIPIENT_2, "0.005");
  check(s2.message?.detail.includes("matches messageHash()"), `message: ${s2.message?.detail}`);
  check(s2.simulate?.detail.includes("execute") && !s2.simulate?.detail.includes("createAndExecute"), `simulate: ${s2.simulate?.detail}`);
  check(s2.confirmed?.state === "ok", `second send confirmed: ${s2.confirmed?.detail}`);
  const hash2 = (await page.textContent("#step-sent .detail")).trim();
  const r2 = await rpc.getTransactionReceipt({ hash: hash2 });
  check(r2.status === "success", `receipt 2 status ${r2.status}, gas ${r2.gasUsed}`);
  check((await balanceOf(RECIPIENT_2)) - before2 === parseEther("0.005"), "recipient 2 got 0.005");
  await page.waitForFunction(() => document.getElementById("wallet-nonce")?.textContent === "2");
  check((await balanceOf(walletAddr)) === parseEther("0.035"), "wallet holds 0.035 after two sends");
  await shot(page, "desktop-5-second-send");

  // Too much: the page refuses before signing.
  const s3 = await send(page, RECIPIENT_2, "1");
  check(s3.message?.state === "fail", `overspend refused: ${s3.message?.detail}`);

  // Mobile width, same session.
  await page.setViewportSize({ width: 390, height: 844 });
  await shot(page, "mobile-2-after-sends");
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.screenshot({ path: `${SHOTS}mobile-4-top.png` });
  await page.evaluate(() => document.getElementById("card-send").scrollIntoView({ behavior: "instant" }));
  await page.screenshot({ path: `${SHOTS}mobile-5-send.png` });
  await page.setViewportSize({ width: 1280, height: 900 });

  // Forget and re-import: same key, same wallet.
  await page.click("#key-forget");
  await page.click("#key-forget");
  await page.waitForSelector("#key-none:not([hidden])");
  await page.click("#key-import-open");
  await page.fill("#key-phrase-in", "abandon ".repeat(23) + "zoo");
  await page.click("#key-import-go");
  check(await page.isVisible("#key-import-error"), `bad phrase rejected: ${await page.textContent("#key-import-error")}`);
  await page.fill("#key-phrase-in", words.join(" "));
  await page.click("#key-import-go");
  await page.waitForSelector("#key-have:not([hidden])", { timeout: 60_000 });
  await page.waitForFunction(() => document.getElementById("wallet-nonce")?.textContent === "2", null, { timeout: 30_000 });
  check((await page.textContent("#key-pk")).trim() === pk, "re-imported key has the same public key");
  check((await page.textContent("#wallet-address")).trim() === walletAddr, "and the same wallet");

  // Reload keeps the key.
  await page.reload();
  await page.waitForSelector("#key-have:not([hidden])", { timeout: 60_000 });
  check((await page.textContent("#key-pk")).trim() === pk, "key survives a reload");

  // ---- mobile, fresh state
  const m = await newPage(browser, { width: 390, height: 844 });
  await m.page.waitForSelector("#selftest[data-state]", { timeout: 60_000 });
  await shot(m.page, "mobile-1-start");
  await m.page.screenshot({ path: `${SHOTS}mobile-6-start-top.png` });
  await m.page.click("#key-create");
  await m.page.waitForSelector("#key-have:not([hidden])", { timeout: 60_000 });
  await shot(m.page, "mobile-3-key");
} finally {
  await browser.close();
}

console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
