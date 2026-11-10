// Drives the built, pre-rendered app against anvil (chain 61, Shanghai) through the Alice and Bob
// story: two keys, Alice deposits and pays Bob in one transaction with the memo, Bob pays back
// through the browser wallet as relayer, Bob withdraws to a fresh address, Sign Only, the error
// paths and a reload. Fails on any console error or page error, hydration warnings included.
// Takes desktop (1440) and mobile (390) screenshots into web/screenshots/.
//
// Run through e2e/run.sh, which starts anvil, deploys and serves the app.

import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { chromium } from "playwright";
import { createPublicClient, decodeEventLog, http, parseAbi, parseEther } from "viem";

const RPC = process.env.ANVIL_RPC ?? "http://127.0.0.1:8845";
const APP = process.env.APP_URL ?? "http://127.0.0.1:4417/";
const LEDGER = process.env.LEDGER;
const SYM = readFileSync(new URL("../src/generated/contracts.ts", import.meta.url), "utf8").match(/LEDGER_SYMBOL = "([^"]+)"/)[1];
if (!LEDGER) throw new Error("LEDGER (the ledger address) is required");
const SHOTS = new URL("../screenshots/", import.meta.url).pathname;
rmSync(SHOTS, { recursive: true, force: true });
mkdirSync(SHOTS, { recursive: true });

// anvil's default account 1 is the browser wallet. Account 0 deployed the contracts.
const RELAYER = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const MEMO = "The first quantum-secure transaction on Ethereum Classic, by Classix.dev";
const FRESH = `0x${[...crypto.getRandomValues(new Uint8Array(20))].map((b) => b.toString(16).padStart(2, "0")).join("")}`;

const abi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function nonces(address) view returns (uint256)",
  "event Memo(address indexed account, uint256 indexed nonce, string memo)",
  "event FeePaid(address indexed account, address indexed relayer, uint256 fee)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
]);
const rpc = createPublicClient({ transport: http(RPC) });
const pq = (a) => rpc.readContract({ address: LEDGER, abi, functionName: "balanceOf", args: [a] });
const nonceOf = (a) => rpc.readContract({ address: LEDGER, abi, functionName: "nonces", args: [a] });
const eth = (a) => rpc.getBalance({ address: a });

let failures = 0;
function check(cond, what) {
  console.log(`${cond ? "ok  " : "FAIL"} ${what}`);
  if (!cond) failures++;
}

/** Runs in the page before the app. An EIP-1193 provider backed by an unlocked anvil account. */
function injectTestWallet({ rpc, account }) {
  window.__PQ_CONFIG_OVERRIDE__ = { rpcUrls: [rpc] };
  window.__tamper = false;
  let id = 0;
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
    async request({ method, params }) {
      window.__walletCalls.push({ method, params });
      switch (method) {
        case "eth_requestAccounts":
        case "eth_accounts":
          return [account];
        case "wallet_switchEthereumChain":
          if (params?.[0]?.chainId !== "0x3d") throw Object.assign(new Error("Unrecognized chain"), { code: 4902 });
          return null;
        case "wallet_addEthereumChain":
          return null;
        case "eth_sendTransaction":
          if (window.__tamper) {
            // A dishonest relayer bumps the signed amount (the fourth argument word).
            const tx = { ...params[0] };
            const at = 2 + 8 + 64 * 3 + 62;
            tx.data = tx.data.slice(0, at) + (tx.data[at] === "f" ? "0" : "f") + tx.data.slice(at + 1);
            return forward(method, [tx]);
          }
          return forward(method, params);
        default:
          return forward(method, params);
      }
    },
    on() {},
    removeListener() {},
  };
  const info = {
    uuid: "4b1f9c1e-0000-4000-8000-00000000anvil",
    name: "Anvil Test Wallet",
    icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1'%3E%3Crect width='1' height='1' fill='%235ee4ff'/%3E%3C/svg%3E",
    rdns: "dev.classix.anvil-test",
  };
  const announce = () => window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: Object.freeze({ info, provider }) }));
  window.addEventListener("eip6963:requestProvider", announce);
  announce();
}

const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };
const tid = (id) => `[data-testid="${id}"]`;

function watch(page, label) {
  page.on("pageerror", (e) => check(false, `${label} page error: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") check(false, `${label} console error: ${m.text()}`);
    else if (m.type() === "warning" && /hydrat/i.test(m.text())) check(false, `${label} hydration warning: ${m.text()}`);
  });
}

async function newPage(browser, viewport = DESKTOP) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: viewport.width < 500 ? 2 : 1 });
  await ctx.addInitScript(injectTestWallet, { rpc: RPC, account: RELAYER });
  const page = await ctx.newPage();
  watch(page, "app");
  await page.goto(APP);
  await page.waitForSelector(`${tid("steps")}[data-live="1"]`, { timeout: 30_000 });
  return { ctx, page };
}

/** Full-page screenshots of the current state at desktop and mobile width. */
async function shots(page, name, { scrollTo } = {}) {
  for (const [tag, vp] of [["desktop", DESKTOP], ["mobile", MOBILE]]) {
    await page.setViewportSize(vp);
    await page.waitForTimeout(150);
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    if (sw > vp.width) check(false, `${name} at ${vp.width}: page is ${sw}px wide`);
    if (scrollTo) {
      await page.locator(scrollTo).scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${SHOTS}${tag}-${name}.png` });
    } else {
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
      await page.screenshot({ path: `${SHOTS}${tag}-${name}.png`, fullPage: true });
    }
  }
  await page.setViewportSize(DESKTOP);
}

async function waitStep(page, run, id, timeout = 120_000) {
  const sel = `${tid(run)} ${tid(`step-${id}`)}`;
  await page.waitForFunction((s) => ["ok", "fail"].includes(document.querySelector(s)?.dataset.state ?? ""), sel, { timeout });
  return {
    state: await page.getAttribute(sel, "data-state"),
    detail: (await page.textContent(`${tid(run)} ${tid(`step-${id}-detail`)}`)).trim(),
  };
}

/** Clicks a button and follows the timeline until it ends. */
async function runFlow(page, who, button, { ids, onSigning } = {}) {
  const run = `${who}-run`;
  await page.click(tid(button));
  if (onSigning) {
    await page.waitForSelector(`${tid(run)} ${tid("step-signature")}[data-state="run"]`, { timeout: 30_000 });
    await onSigning();
  }
  const steps = {};
  for (const id of ids ?? ["message", "signature", "local", "onchain", "simulate", "sent", "confirmed"]) {
    steps[id] = await waitStep(page, run, id);
    if (steps[id].state !== "ok") {
      console.log(`     ${who} step ${id} failed: ${steps[id].detail}`);
      break;
    }
  }
  await page.waitForFunction(() => !document.querySelector('[data-testid$="-run"] [data-state="run"]'));
  return steps;
}

const sentHash = (page, who) => page.getAttribute(`${tid(`${who}-run`)} ${tid("step-sent")} [data-value]`, "data-value");
const shownBalance = (page, who) => page.textContent(tid(`${who}-balance`));
const waitBalance = (page, who, text) =>
  page.waitForFunction(([s, t]) => document.querySelector(s)?.textContent === t, [tid(`${who}-balance`), text], { timeout: 30_000 });

const browser = await chromium.launch();
try {
  // 0. With JavaScript off, the pre-rendered page still reads.
  {
    const ctx = await browser.newContext({ viewport: DESKTOP, javaScriptEnabled: false });
    const page = await ctx.newPage();
    await page.goto(APP);
    check((await page.textContent("h1")) === "Quantum-Secure Payments on Ethereum Classic", "no-JS: h1 is there");
    for (const id of ["disclaimer", "how", "frames", "limits", "spec", "credits"]) check(await page.isVisible(tid(id)), `no-JS: ${id} visible`);
    await page.screenshot({ path: `${SHOTS}desktop-0-no-js.png`, fullPage: true });
    await ctx.close();
  }

  const { page } = await newPage(browser);
  check(!/wallet/i.test(await page.title()), `title: ${await page.title()}`);
  check((await page.title()).startsWith("skinnyCAT · "), "the title names skinnyCAT");
  const ogImage = await page.getAttribute('meta[property="og:image"]', "content");
  check(ogImage === "https://pq.classix.dev/og.png", `og:image is ${ogImage}`);
  for (const f of ["og.png", "favicon.svg", "favicon.ico", "icon-512.png", "404.html"]) {
    const res = await page.request.get(new URL(f, APP).href);
    check(res.ok(), `/${f} is served (${res.status()})`);
  }
  check(!/hypertree/i.test(await page.content()), "no hypertree on the page");
  await page.waitForSelector(`${tid("selftest")}[data-state-result]`, { timeout: 60_000 });
  const selftestOk = (await page.getAttribute(tid("selftest"), "data-state-result")) === "ok";
  check(selftestOk, `self-tests: ${await page.textContent(tid("selftest-label"))}`);
  await page.click(tid("selftest"));
  const list = await page.textContent(tid("selftest-list"));
  check(/chain id61/.test(list) && /verifier code hash0x/.test(list) && /EthLib vectors, JS verifier3 vectors/.test(list), `self-test list: ${list.slice(0, 160)}…`);
  await shots(page, "1-selftest", { scrollTo: "header" });
  await page.keyboard.press("Escape");
  await shots(page, "1-start");
  await shots(page, "1b-how-it-works", { scrollTo: tid("how") });
  await shots(page, "1c-frame-transactions", { scrollTo: tid("frames") });

  // 1. Two keys.
  await page.click(tid("alice-create"));
  await page.waitForSelector(`${tid("alice-key")}[data-view="busy"]`);
  await page.waitForSelector(`${tid("alice-key")}[data-view="have"]`, { timeout: 60_000 });
  await page.click(tid("bob-create"));
  await page.waitForSelector(`${tid("bob-key")}[data-view="have"]`, { timeout: 60_000 });
  const alice = await page.getAttribute(tid("alice-account"), "data-value");
  const bob = await page.getAttribute(tid("bob-account"), "data-value");
  const alicePk = await page.getAttribute(tid("alice-pk"), "data-value");
  const bobPk = await page.getAttribute(tid("bob-pk"), "data-value");
  const bobWords = await page.$$eval(`${tid("bob-words")} [data-word]`, (l) => l.map((x) => x.textContent));
  check(/^0x[0-9a-fA-F]{40}$/.test(alice) && /^0x[0-9a-fA-F]{40}$/.test(bob) && alice !== bob, `accounts ${alice} and ${bob}`);
  check(bobWords.length === 24, `Bob's backup phrase has ${bobWords.length} words`);
  await waitBalance(page, "alice", "0");
  check((await page.inputValue(tid("bob-to"))) === alice, "Bob's transfer defaults to Alice's account");
  await shots(page, "2-keys");

  // 2. Connect the browser wallet.
  await page.click(`${tid("web3-providers")} button[data-rdns="dev.classix.anvil-test"]`);
  await page.waitForSelector(tid("web3-have"));
  check((await page.getAttribute(tid("web3-account"), "data-value")) === RELAYER, "browser wallet connected");
  await page.waitForSelector(tid("bob-gas-hint"));

  // 3. Alice deposits 1 ETC and pays Bob 0.4 in one transaction, with the memo.
  await page.fill(tid("alice-deposit"), "1");
  await page.fill(tid("alice-amount"), "0.4");
  check((await page.inputValue(tid("alice-memo"))) === MEMO, "memo is pre-filled");
  const a = await runFlow(page, "alice", "alice-go", { onSigning: async () => {
    check((await page.getAttribute(tid("alice-run-stage"), "data-scene")) === "climb", "while signing, the cat climbs");
    check((await page.$$(`${tid("hero-tree")} ${tid("climber")}`)).length === 1, "the hero tree has its climber");
    await shots(page, "3-alice-signing");
  } });
  check(a.message?.detail.includes("matches transferDigest()"), `message: ${a.message?.detail}`);
  check(a.signature?.detail.startsWith("7,740 bytes"), `signature: ${a.signature?.detail}`);
  check(a.onchain?.state === "ok", `on-chain verify: ${a.onchain?.detail}`);
  check(a.confirmed?.state === "ok", `Alice's send confirmed: ${a.confirmed?.detail}`);
  const hashA = await sentHash(page, "alice");
  const rA = await rpc.getTransactionReceipt({ hash: hashA });
  const txA = await rpc.getTransaction({ hash: hashA });
  check(rA.status === "success" && rA.type === "legacy" && txA.value === parseEther("1"), `one legacy tx with 1 ETC attached, gas ${rA.gasUsed}`);
  const memoEv = rA.logs.map((l) => { try { return decodeEventLog({ abi, ...l }); } catch { return null; } }).find((e) => e?.eventName === "Memo");
  check(memoEv?.args.memo === MEMO && memoEv?.args.account === alice, "Memo event carries the message from Alice");
  check((await pq(bob)) === parseEther("0.4") && (await pq(alice)) === parseEther("0.6"), `on chain, Bob has 0.4 ${SYM} and Alice 0.6`);
  check((await page.textContent(tid("alice-run-memo-text"))) === MEMO, "the receipt step shows the memo");
  const memoLink = await page.getAttribute(`${tid("alice-run-memo")} a`, "href");
  check(memoLink === `https://etc.blockscout.com/tx/${hashA}`, `memo links Blockscout: ${memoLink}`);
  check((await page.getAttribute(`${tid("alice-run")} ${tid("step-explorer")} a`, "href")) === `https://etc.blockscout.com/tx/${hashA}`, "explorer step links Blockscout");
  await waitBalance(page, "bob", "0.4");
  check((await page.getAttribute(tid("alice-run-stage"), "data-scene")) === "open", "a valid signature opens the box");
  check(/The box opens and the cat jumps out/.test(await page.textContent(tid("alice-run-stage"))), "and says so");
  await page.waitForFunction((s) => document.querySelector(s)?.getAnimations({ subtree: true }).every((a) => a.playState === "finished"), tid("alice-run-stage"));
  check(await page.isVisible(`${tid("alice-run-stage")} ${tid("box-cat")}`), "the cat is out of the box");
  await shots(page, "4c-box-open", { scrollTo: tid("alice-run-stage") });
  await shots(page, "4-alice-sent");
  await shots(page, "4b-alice-receipt", { scrollTo: tid("alice-run-memo") });

  // 4. Bob, with no ETC, pays 0.1 back with a 0.001 fee. The browser wallet relays and gets the fee.
  check((await eth(bob)) === 0n, "Bob's account has no ETC");
  const relayerBefore = await eth(RELAYER);
  await page.fill(tid("bob-amount"), "0.1");
  await page.fill(tid("bob-fee"), "0.001");
  await page.fill(tid("bob-memo"), "thanks");
  const b = await runFlow(page, "bob", "bob-go");
  check(b.confirmed?.state === "ok", `Bob's relayed transfer confirmed: ${b.confirmed?.detail}`);
  check(b.simulate?.detail.includes("fee 0.001 ETC to the relayer"), `simulate: ${b.simulate?.detail}`);
  const hashB = await sentHash(page, "bob");
  const rB = await rpc.getTransactionReceipt({ hash: hashB });
  const gasB = rB.gasUsed * rB.effectiveGasPrice;
  check((await eth(RELAYER)) === relayerBefore - gasB + parseEther("0.001"), "the relayer paid gas and got the 0.001 ETC fee");
  const feeEv = rB.logs.map((l) => { try { return decodeEventLog({ abi, ...l }); } catch { return null; } }).find((e) => e?.eventName === "FeePaid");
  check(feeEv?.args.relayer === RELAYER && feeEv?.args.account === bob, "FeePaid names the relayer");
  check((await pq(bob)) === parseEther("0.299") && (await pq(alice)) === parseEther("0.7"), `Bob 0.299 ${SYM}, Alice 0.7`);
  check((await eth(bob)) === 0n, "Bob still never had ETC");
  check((await page.textContent(tid("bob-run-memo-text"))) === "thanks", "Bob's memo shows");
  await waitBalance(page, "bob", "0.299");
  await shots(page, "5-bob-relayed");

  // 5. Bob withdraws 0.2 to a fresh address, again relayed.
  await page.click(tid("bob-kind-withdraw"));
  await page.fill(tid("bob-withdraw-to"), FRESH);
  await page.fill(tid("bob-amount"), "0.2");
  await page.fill(tid("bob-memo"), "");
  const w = await runFlow(page, "bob", "bob-go");
  check(w.confirmed?.state === "ok", `withdraw confirmed: ${w.confirmed?.detail}`);
  check(w.message?.detail.includes("matches withdrawDigest()"), `withdraw message: ${w.message?.detail}`);
  check((await eth(FRESH)) === parseEther("0.2"), `fresh address ${FRESH} got 0.2 ETC`);
  check((await pq(bob)) === parseEther("0.098"), `Bob has 0.098 ${SYM} left`);
  check((await eth(bob)) === 0n, "and still no ETC");
  check(!(await page.isVisible(tid("bob-run-memo"))), "no memo box for an empty memo");
  await waitBalance(page, "bob", "0.098");
  await shots(page, "6-bob-withdrew");

  // 6. Sign Only: signs and checks, sends nothing.
  const callsBefore = await page.evaluate(() => window.__walletCalls.filter((c) => c.method === "eth_sendTransaction").length);
  const nonceBefore = await nonceOf(alice);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const so = await runFlow(page, "alice", "alice-sign-only", { ids: ["message", "signature", "local", "onchain"] });
  check((await page.getAttribute(tid("alice-run-stage"), "data-scene")) === "open", "reduced motion: the box opens");
  const moving = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === "running" && a.effect?.target?.closest?.('[data-testid$="-stage"], [data-testid="hero-tree"]')).length);
  check(moving === 0, `reduced motion: no cat animations run (${moving})`);
  const pose = await page.$eval(`${tid("alice-run-stage")} ${tid("box-cat")}`, (el) => getComputedStyle(el).transform);
  check(pose === "none" || pose === "matrix(1, 0, 0, 1, 0, 0)", `reduced motion: the cat holds its final pose (${pose})`);
  check(Object.values(so).every((x) => x.state === "ok"), "Sign Only: message, signature, local and on-chain checks pass");
  check((await page.$$(`${tid("alice-run")} li[data-testid^="step-"]`)).length === 4, "Sign Only shows four steps");
  check(await page.isVisible(tid("alice-run-signed")), "Sign Only offers the signature");
  const callsAfter = await page.evaluate(() => window.__walletCalls.filter((c) => c.method === "eth_sendTransaction").length);
  check(callsAfter === callsBefore && (await nonceOf(alice)) === nonceBefore, "nothing was sent");
  await shots(page, "7-sign-only");
  await page.emulateMedia({ reducedMotion: "no-preference" });

  // 7. Errors. Too much: refused at the message step, before signing.
  await page.click(tid("bob-kind-transfer"));
  await page.fill(tid("bob-amount"), "5");
  const ins = await runFlow(page, "bob", "bob-go");
  check(ins.message?.state === "fail" && ins.message.detail.startsWith(`Bob holds 0.098 ${SYM}, less than the 5.001 ${SYM}`), `insufficient balance: ${ins.message?.detail}`);
  check((await page.getAttribute(`${tid("bob-run")} ${tid("step-signature")}`, "data-state")) === "idle", "nothing signed");
  check(!(await page.isVisible(tid("bob-run-stage"))), "nothing signed, so no cat and no box");
  await shots(page, "8-insufficient");

  // A bad form value.
  await page.fill(tid("bob-amount"), "abc");
  await page.click(tid("bob-go"));
  check(/The amount has to be a number/.test(await page.textContent(tid("bob-hint"))), "a bad amount is refused in the form");

  // A relayer that changes the signed amount: the transaction reverts with BadSignature and nothing moves.
  await page.fill(tid("bob-amount"), "0.01");
  await page.evaluate(() => (window.__tamper = true));
  const bobBefore = await pq(bob);
  const t = await runFlow(page, "bob", "bob-go");
  await page.evaluate(() => (window.__tamper = false));
  check(t.confirmed?.state === "fail" && /reverted.*BadSignature/.test(t.confirmed.detail), `tampered relay rejected: ${t.confirmed?.detail}`);
  check((await pq(bob)) === bobBefore, "Bob's balance didn't move");
  check((await page.getAttribute(tid("bob-run-stage"), "data-scene")) === "shut", "the changed note leaves the box shut");
  check(/changed on the way/.test(await page.textContent(tid("bob-run-stage"))), "and the stage says the note was changed");
  check(!(await page.isVisible(`${tid("bob-run-stage")} ${tid("box-cat")}`)), "and no cat comes out");
  await shots(page, "9b-box-shut", { scrollTo: tid("bob-run-stage") });
  await shots(page, "9-tampered");

  // A bad phrase.
  await page.click(tid("bob-replace"));
  await page.fill(tid("bob-phrase-in"), "abandon ".repeat(23) + "zoo");
  await page.click(tid("bob-import-go"));
  check(/checksum/.test(await page.textContent(tid("bob-import-error"))), `bad phrase rejected: ${await page.textContent(tid("bob-import-error"))}`);
  await shots(page, "10-bad-phrase");
  await page.click(tid("bob-import-cancel"));

  // Forget Bob and import him back from his phrase.
  await page.click(tid("bob-forget"));
  await page.click(tid("bob-forget"));
  await page.waitForSelector(`${tid("bob-key")}[data-view="none"]`);
  await page.click(tid("bob-import-open"));
  await page.fill(tid("bob-phrase-in"), bobWords.join(" "));
  await page.click(tid("bob-import-go"));
  await page.waitForSelector(`${tid("bob-key")}[data-view="have"]`, { timeout: 60_000 });
  check((await page.getAttribute(tid("bob-pk"), "data-value")) === bobPk, "re-imported Bob has the same key");
  await waitBalance(page, "bob", "0.098");

  // 8. Reload: both keys come back, and the page hydrates again without warnings.
  await page.reload();
  await page.waitForSelector(`${tid("steps")}[data-live="1"]`);
  await page.waitForSelector(`${tid("alice-key")}[data-view="have"]`, { timeout: 60_000 });
  await page.waitForSelector(`${tid("bob-key")}[data-view="have"]`, { timeout: 60_000 });
  check((await page.getAttribute(tid("alice-pk"), "data-value")) === alicePk, "Alice's key survives a reload");
  check((await page.getAttribute(tid("bob-account"), "data-value")) === bob, "Bob's account survives a reload");
  await waitBalance(page, "alice", "0.7");
  check((await shownBalance(page, "bob")) === "0.098", "balances read back after reload");
} finally {
  await browser.close();
}

console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
