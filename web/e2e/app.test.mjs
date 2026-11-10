// Drives the built app against anvil: create key, fund, send (createAndExecute), send again
// (execute), forget and re-import the key. Takes desktop and mobile screenshots into web/screenshots/.
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
const tid = (id) => `[data-testid="${id}"]`;
const valueOf = (page, id) => page.getAttribute(tid(id), "data-value");

async function waitStep(page, id, timeout = 120_000) {
  await page.waitForFunction(
    (sel) => ["ok", "fail"].includes(document.querySelector(sel)?.dataset.state ?? ""),
    tid(`step-${id}`),
    { timeout },
  );
  const state = await page.getAttribute(tid(`step-${id}`), "data-state");
  const detail = (await page.textContent(tid(`step-${id}-detail`))).trim();
  return { state, detail };
}

async function send(page, to, amount, { onRunning } = {}) {
  await page.fill(tid("send-to"), to);
  await page.fill(tid("send-amount"), amount);
  await page.click(tid("send-go"));
  if (onRunning) {
    await page.waitForSelector(`${tid("step-signature")}[data-state="run"]`, { timeout: 30_000 });
    await onRunning();
  }
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

const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };

/** Full-page screenshots of the current state at desktop and mobile width. */
async function shots(page, name) {
  for (const [tag, vp] of [["desktop", DESKTOP], ["mobile", MOBILE]]) {
    await page.setViewportSize(vp);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await page.waitForTimeout(150);
    await page.screenshot({ path: `${SHOTS}${tag}-${name}.png`, fullPage: true });
  }
  await page.setViewportSize(DESKTOP);
}

const browser = await chromium.launch();
try {
  const { page } = await newPage(browser, DESKTOP);
  await page.waitForSelector(`${tid("selftest")}[data-state-result]`, { timeout: 60_000 });
  const label = await page.textContent(tid("selftest-label"));
  const selftestOk = (await page.getAttribute(tid("selftest"), "data-state-result")) === "ok";
  check(selftestOk, `self-tests: ${label}`);
  if (!selftestOk) {
    await page.click(tid("selftest"));
    console.log(await page.textContent(tid("selftest-list")));
    await page.keyboard.press("Escape");
  }
  await shots(page, "1-start");

  // How it works, opened.
  await page.click(`${tid("how")} summary`);
  await shots(page, "6-how-it-works");
  await page.click(`${tid("how")} summary`);

  // Create key
  await page.click(tid("key-create"));
  await page.waitForSelector(`${tid("key-view")}[data-view="have"]`, { timeout: 60_000 });
  await page.waitForFunction((sel) => document.querySelector(sel)?.textContent?.includes("Not deployed"), tid("wallet-deployed"), {
    timeout: 30_000,
  });
  const walletAddr = await valueOf(page, "wallet-address");
  const pk = await valueOf(page, "key-pk");
  const words = await page.$$eval(`${tid("key-words")} [data-word]`, (l) => l.map((x) => x.textContent));
  check(/^0x[0-9a-fA-F]{40}$/.test(walletAddr), `wallet address ${walletAddr}`);
  check(/^0x[0-9a-f]{64}$/.test(pk), `public key ${pk.slice(0, 18)}…`);
  check(words.length === 24, `backup phrase has ${words.length} words`);
  await shots(page, "2-key");

  // Connect
  await page.click(`${tid("web3-providers")} button[data-rdns="dev.classix.anvil-test"]`);
  await page.waitForSelector(tid("web3-have"));
  check((await page.inputValue(tid("send-to"))) === GAS_ACCOUNT, "recipient defaults to the connected account");

  // Fund
  await page.fill(tid("fund-amount"), "0.05");
  await page.click(tid("fund-go"));
  await page.waitForFunction((sel) => /Funded|reverted|rror/.test(document.querySelector(sel)?.textContent ?? ""), tid("fund-status"), {
    timeout: 60_000,
  });
  const fundStatus = await page.textContent(tid("fund-status"));
  check(fundStatus.includes("Funded"), `fund: ${fundStatus}`);
  check((await balanceOf(walletAddr)) === parseEther("0.05"), "wallet holds 0.05 on chain");
  await page.waitForFunction((sel) => document.querySelector(sel)?.textContent?.startsWith("0.05"), tid("wallet-balance"));
  await shots(page, "3-funded");

  // First send: createAndExecute. Screenshots while signing.
  const before1 = await balanceOf(RECIPIENT_1);
  const s1 = await send(page, RECIPIENT_1, "0.01", { onRunning: () => shots(page, "4-sending") });
  check(s1.signature?.detail.startsWith("7,740 bytes"), `signature: ${s1.signature?.detail}`);
  check(s1.onchain?.state === "ok", `on-chain verify: ${s1.onchain?.detail}`);
  check(s1.simulate?.detail.includes("createAndExecute"), `simulate: ${s1.simulate?.detail}`);
  check(s1.confirmed?.state === "ok", `first send confirmed: ${s1.confirmed?.detail}`);
  const hash1 = await page.getAttribute(`${tid("step-sent")} [data-value]`, "data-value");
  const r1 = await rpc.getTransactionReceipt({ hash: hash1 });
  check(r1.status === "success" && r1.type === "legacy", `receipt 1 status ${r1.status}, type ${r1.type}, gas ${r1.gasUsed}`);
  check((await balanceOf(RECIPIENT_1)) - before1 === parseEther("0.01"), "recipient 1 got 0.01");
  const explorerHref = await page.getAttribute(`${tid("step-explorer")} a`, "href");
  check(explorerHref === `https://etc-mordor.blockscout.com/tx/${hash1}`, `explorer link ${explorerHref}`);
  await page.waitForFunction((sel) => document.querySelector(sel)?.textContent === "1", tid("wallet-nonce"));
  check((await page.textContent(tid("wallet-deployed"))).includes("Deployed"), "wallet shows as deployed");
  await shots(page, "5-sent");

  // Second send: execute
  const before2 = await balanceOf(RECIPIENT_2);
  const s2 = await send(page, RECIPIENT_2, "0.005");
  check(s2.message?.detail.includes("matches messageHash()"), `message: ${s2.message?.detail}`);
  check(s2.simulate?.detail.includes("execute") && !s2.simulate?.detail.includes("createAndExecute"), `simulate: ${s2.simulate?.detail}`);
  check(s2.confirmed?.state === "ok", `second send confirmed: ${s2.confirmed?.detail}`);
  const hash2 = await page.getAttribute(`${tid("step-sent")} [data-value]`, "data-value");
  const r2 = await rpc.getTransactionReceipt({ hash: hash2 });
  check(r2.status === "success", `receipt 2 status ${r2.status}, gas ${r2.gasUsed}`);
  check((await balanceOf(RECIPIENT_2)) - before2 === parseEther("0.005"), "recipient 2 got 0.005");
  await page.waitForFunction((sel) => document.querySelector(sel)?.textContent === "2", tid("wallet-nonce"));
  check((await balanceOf(walletAddr)) === parseEther("0.035"), "wallet holds 0.035 after two sends");

  // Too much: the page refuses before signing.
  const s3 = await send(page, RECIPIENT_2, "1");
  check(s3.message?.state === "fail", `overspend refused: ${s3.message?.detail}`);
  await shots(page, "7-refused");

  // Forget and re-import: same key, same wallet.
  await page.click(tid("key-forget"));
  await page.click(tid("key-forget"));
  await page.waitForSelector(`${tid("key-view")}[data-view="none"]`);
  await page.click(tid("key-import-open"));
  await page.fill(tid("key-phrase-in"), "abandon ".repeat(23) + "zoo");
  await page.click(tid("key-import-go"));
  check(await page.isVisible(tid("key-import-error")), `bad phrase rejected: ${await page.textContent(tid("key-import-error"))}`);
  await shots(page, "8-import");
  await page.fill(tid("key-phrase-in"), words.join(" "));
  await page.click(tid("key-import-go"));
  await page.waitForSelector(`${tid("key-view")}[data-view="have"]`, { timeout: 60_000 });
  await page.waitForFunction((sel) => document.querySelector(sel)?.textContent === "2", tid("wallet-nonce"), { timeout: 30_000 });
  check((await valueOf(page, "key-pk")) === pk, "re-imported key has the same public key");
  check((await valueOf(page, "wallet-address")) === walletAddr, "and the same wallet");

  // Reload keeps the key.
  await page.reload();
  await page.waitForSelector(`${tid("key-view")}[data-view="have"]`, { timeout: 60_000 });
  check((await valueOf(page, "key-pk")) === pk, "key survives a reload");
} finally {
  await browser.close();
}

console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
