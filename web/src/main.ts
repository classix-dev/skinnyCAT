import "./style.css";
import {
  BaseError,
  decodeErrorResult,
  formatUnits,
  isAddress,
  parseUnits,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import {
  addressUrl,
  buildCall,
  chainOf,
  messageHash,
  predictWalletAddress,
  publicClientOf,
  txUrl,
  verifyOnChain,
  walletAddress,
  walletState,
  type WalletState,
} from "./chain";
import { DEADLINE_SECONDS, GAS_FALLBACK, enabledNetworks, type NetworkConfig } from "./config";
import { factoryAbi, verifierAbi, walletAbi } from "./generated/contracts";
import { forgetSeed, loadSeed, phraseToSeed, randomSeed, saveSeed, seedToPhrase } from "./key";
import { selfTests } from "./selftest";
import { keygen, sign, verifyLocal, type PublicKeyInfo } from "./signer-client";
import { connect, discoverProviders, ensureChain, type Connection, type Discovered } from "./web3";

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------

const $ = <T extends HTMLElement = HTMLElement>(id: string) => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el as T;
};
const show = (id: string, on: boolean) => ($(id).hidden = !on);
const text = (id: string, s: string) => ($(id).textContent = s);

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  e.append(...children);
  return e;
}

const link = (href: string, label: string) =>
  el("a", { href, target: "_blank", rel: "noopener noreferrer" }, label);

const short = (s: string, a = 10, b = 8) => (s.length > a + b + 1 ? `${s.slice(0, a)}…${s.slice(-b)}` : s);

/** RPC and wallet errors, shown as the node or wallet worded them. */
const ERROR_ABI = [...factoryAbi, ...walletAbi, ...verifierAbi].filter((x) => x.type === "error");
function errMsg(e: unknown): string {
  if (e instanceof BaseError) {
    const raw = e.walk((x) => typeof (x as { data?: unknown }).data === "string") as { data?: Hex } | null;
    let decoded = "";
    if (raw?.data && raw.data.length >= 10) {
      try {
        const r = decodeErrorResult({ abi: ERROR_ABI, data: raw.data });
        decoded = `\nreverted with ${r.errorName}(${(r.args ?? []).map(String).join(", ")})`;
      } catch {
        decoded = `\nrevert data ${short(raw.data, 42, 8)}`;
      }
    }
    const details = e.details && !e.shortMessage.includes(e.details) ? `\n${e.details}` : "";
    return `${e.shortMessage}${details}${decoded}`;
  }
  if (e && typeof e === "object" && "message" in e) {
    const o = e as { message: string; code?: number; data?: unknown };
    return `${o.message}${o.code !== undefined ? ` (code ${o.code})` : ""}${o.data ? `\n${JSON.stringify(o.data)}` : ""}`;
  }
  return String(e);
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const networks = enabledNetworks();
if (!networks.length) throw new Error("no network enabled in config");
const NET_KEY = "pq-classix.network";
let net: NetworkConfig = networks.find((n) => n.key === localStorage.getItem(NET_KEY)) ?? networks[0];
let pub: PublicClient = publicClientOf(net);

let seed: Hex | null = null;
let key: PublicKeyInfo | null = null;
let wallet: WalletState | null = null;
let walletAddr: Address | null = null;
let conn: Connection | null = null;
let gasBalance: bigint | null = null;
let sending = false;
let funding = false;

const fmt = (wei: bigint) => {
  const s = formatUnits(wei, net.currency.decimals);
  const [i, f = ""] = s.split(".");
  const frac = f.slice(0, 6).replace(/0+$/, "");
  return `${i}${frac ? `.${frac}` : ""} ${net.currency.symbol}`;
};

function parseAmount(s: string): bigint {
  const t = s.trim();
  if (!/^\d*\.?\d+$|^\d+\.$/.test(t)) throw new Error("Enter an amount like 0.01.");
  const v = parseUnits(t, net.currency.decimals);
  if (v <= 0n) throw new Error("The amount has to be more than zero.");
  return v;
}

// ---------------------------------------------------------------------------
// Network
// ---------------------------------------------------------------------------

function renderNetwork() {
  const sel = $<HTMLSelectElement>("network");
  sel.replaceChildren(...networks.map((n) => el("option", { value: n.key }, n.name)));
  sel.value = net.key;
  sel.hidden = networks.length < 2;
  text("network-label", net.testnet ? `${net.name} testnet` : net.name);
  $("network-label").hidden = networks.length > 1;
  text("hero-net", `· ${net.name}${net.testnet ? " Testnet" : ""}`);
  document.querySelectorAll(".sym").forEach((s) => (s.textContent = net.currency.symbol));
  for (const id of ["fund-amount", "send-amount"]) {
    const i = $<HTMLInputElement>(id);
    if (!i.value) i.value = net.defaultAmount;
  }
}

$<HTMLSelectElement>("network").addEventListener("change", (e) => {
  const n = networks.find((x) => x.key === (e.target as HTMLSelectElement).value);
  if (!n) return;
  net = n;
  localStorage.setItem(NET_KEY, n.key);
  pub = publicClientOf(net);
  wallet = null;
  walletAddr = null;
  renderNetwork();
  void runSelfTests();
  if (key) void loadWallet();
  void refreshGasBalance();
  resetStepper();
  renderSendState();
});

// ---------------------------------------------------------------------------
// Self-tests
// ---------------------------------------------------------------------------

async function runSelfTests() {
  const dot = $("selftest-dot");
  dot.className = "dot run";
  text("selftest-label", "Self-tests running");
  $("selftest-list").replaceChildren();
  const target = net;
  const checks = await selfTests(pub, net);
  if (target !== net) return;
  const failed = checks.filter((c) => !c.ok);
  dot.className = failed.length ? "dot fail" : "dot ok";
  text(
    "selftest-label",
    failed.length
      ? `Self-test failed (${failed.map((c) => c.name).join(", ")})`
      : `Self-tests passed (${checks.length} of ${checks.length})`,
  );
  $("selftest").dataset.state = failed.length ? "fail" : "ok";
  $("selftest-list").replaceChildren(
    ...checks.map((c) =>
      el("li", {}, el("span", { class: `dot ${c.ok ? "ok" : "fail"}` }), el("span", {}, c.name), el("span", { class: "d" }, c.detail)),
    ),
  );
}

// ---------------------------------------------------------------------------
// Key card
// ---------------------------------------------------------------------------

type KeyView = "none" | "import" | "busy" | "have";
function keyView(v: KeyView) {
  show("key-none", v === "none");
  show("key-import", v === "import");
  show("key-busy", v === "busy");
  show("key-have", v === "have");
}

async function useSeed(s: Hex, openBackup: boolean) {
  seed = s;
  key = null;
  wallet = null;
  walletAddr = null;
  renderWallet();
  renderSendState();
  keyView("busy");
  text("key-busy-label", "Deriving the public key (about 230,000 Keccak calls)");
  const bar = $("key-bar");
  bar.style.width = "0";
  try {
    const k = await keygen(s, (_p, done, total) => (bar.style.width = `${(100 * done) / total}%`));
    if (seed !== s) return;
    key = k;
  } catch (e) {
    keyView("none");
    alertKey(errMsg(e));
    return;
  }
  text("key-pk", key.publicKey);
  $("key-words").replaceChildren(...seedToPhrase(s).split(" ").map((w) => el("li", {}, w)));
  $<HTMLDetailsElement>("key-backup").open = openBackup;
  keyView("have");
  renderSendState();
  await loadWallet();
}

function alertKey(msg: string) {
  const p = $("key-import-error");
  p.textContent = msg;
  p.hidden = false;
}

$("key-create").addEventListener("click", () => {
  const s = randomSeed();
  saveSeed(s);
  void useSeed(s, true);
});

function openImport() {
  $<HTMLTextAreaElement>("key-phrase-in").value = "";
  show("key-import-error", false);
  resetImportButton();
  keyView("import");
  $("key-phrase-in").focus();
}
$("key-import-open").addEventListener("click", openImport);
$("key-replace").addEventListener("click", openImport);
$("key-import-cancel").addEventListener("click", () => keyView(key ? "have" : "none"));

let importArmed = false;
function resetImportButton() {
  importArmed = false;
  text("key-import-go", "Use Phrase");
}
$("key-phrase-in").addEventListener("input", resetImportButton);
$("key-import-go").addEventListener("click", () => {
  show("key-import-error", false);
  let s: Hex;
  try {
    s = phraseToSeed($<HTMLTextAreaElement>("key-phrase-in").value);
  } catch (e) {
    alertKey((e as Error).message);
    return;
  }
  if (seed && s !== seed && !importArmed) {
    importArmed = true;
    text("key-import-go", "Replace Current Key");
    alertKey("This replaces the key stored in this browser. Make sure its phrase is backed up, then click again.");
    return;
  }
  resetImportButton();
  saveSeed(s);
  void useSeed(s, false);
});

$("key-copy-phrase").addEventListener("click", async () => {
  if (!seed) return;
  await navigator.clipboard.writeText(seedToPhrase(seed));
  text("key-copy-phrase", "Copied");
  setTimeout(() => text("key-copy-phrase", "Copy Phrase"), 1500);
});

let forgetTimer: ReturnType<typeof setTimeout> | undefined;
$("key-forget").addEventListener("click", () => {
  const b = $("key-forget");
  if (!b.classList.contains("armed")) {
    b.classList.add("armed");
    b.textContent = "Click Again to Forget";
    forgetTimer = setTimeout(() => {
      b.classList.remove("armed");
      b.textContent = "Forget Key";
    }, 4000);
    return;
  }
  clearTimeout(forgetTimer);
  b.classList.remove("armed");
  b.textContent = "Forget Key";
  forgetSeed();
  seed = key = null;
  wallet = null;
  walletAddr = null;
  keyView("none");
  renderWallet();
  resetStepper();
  renderSendState();
});

// ---------------------------------------------------------------------------
// Quantum-secure wallet card
// ---------------------------------------------------------------------------

function renderWallet() {
  show("wallet-none", !walletAddr);
  show("wallet-have", !!walletAddr);
  if (!walletAddr) return;
  text("wallet-address", walletAddr);
  $<HTMLAnchorElement>("wallet-explorer").href = addressUrl(net, walletAddr);
  text("wallet-balance", wallet ? fmt(wallet.balance) : "…");
  const dep = $("wallet-deployed");
  if (!wallet) dep.textContent = "…";
  else if (wallet.deployed) dep.replaceChildren(el("span", { class: "yes" }, "Deployed"));
  else dep.replaceChildren(el("span", { class: "no" }, "Not deployed yet"));
  text("wallet-nonce", wallet ? wallet.nonce.toString() : "…");
}

async function loadWallet() {
  if (!key) return;
  const k = key;
  show("wallet-error", false);
  try {
    walletAddr = predictWalletAddress(net, k.pkSeed, k.pkRoot);
    renderWallet();
    const onChain = await walletAddress(pub, net, k.pkSeed, k.pkRoot);
    if (onChain.toLowerCase() !== walletAddr.toLowerCase())
      throw new Error(`The factory says ${onChain}, but this page computed ${walletAddr}.`);
    await refreshWallet();
  } catch (e) {
    if (key !== k) return;
    $("wallet-error").textContent = errMsg(e);
    show("wallet-error", true);
  }
}

async function refreshWallet() {
  if (!walletAddr) return;
  const a = walletAddr;
  const s = await walletState(pub, a);
  if (a !== walletAddr) return;
  wallet = s;
  show("wallet-error", false);
  renderWallet();
  renderSendState();
}

$("wallet-refresh").addEventListener("click", () => {
  refreshWallet().catch((e) => {
    $("wallet-error").textContent = errMsg(e);
    show("wallet-error", true);
  });
});
$("wallet-copy").addEventListener("click", async () => {
  if (!walletAddr) return;
  await navigator.clipboard.writeText(walletAddr);
  text("wallet-copy", "Copied");
  setTimeout(() => text("wallet-copy", "Copy"), 1500);
});

// ---------------------------------------------------------------------------
// Gas wallet card
// ---------------------------------------------------------------------------

let listProviders: () => Discovered[] = () => [];

function renderProviders() {
  const list = listProviders();
  const box = $("web3-providers");
  box.replaceChildren(
    ...list.map((d) => {
      const b = el("button", { class: "btn-secondary", type: "button", "data-rdns": d.info.rdns });
      if (d.info.icon) b.append(el("img", { src: d.info.icon, alt: "" }));
      b.append(`Connect ${d.info.name}`);
      b.addEventListener("click", () => void doConnect(d));
      return b;
    }),
  );
  show("web3-empty", list.length === 0);
  const top = $<HTMLButtonElement>("connect-top");
  top.hidden = !!conn;
  top.disabled = list.length === 0;
}

$("connect-top").addEventListener("click", () => {
  const list = listProviders();
  if (list.length === 1) void doConnect(list[0]);
  else $("card-web3").scrollIntoView({ behavior: "smooth", block: "center" });
});

async function doConnect(d: Discovered) {
  const status = $("fund-status");
  try {
    conn = await connect(d);
  } catch (e) {
    show("web3-empty", false);
    $("web3-providers").append(el("p", { class: "error" }, errMsg(e)));
    return;
  }
  const p = conn.provider;
  p.on?.("accountsChanged", (accs: Address[]) => {
    if (!conn) return;
    if (!accs.length) {
      conn = null;
      renderConn();
      return;
    }
    const prev = conn.account;
    conn.account = accs[0];
    const to = $<HTMLInputElement>("send-to");
    if (to.value === prev) to.value = accs[0];
    renderConn();
    void refreshGasBalance();
  });
  const to = $<HTMLInputElement>("send-to");
  if (!to.value) to.value = conn.account;
  renderConn();
  void refreshGasBalance();
  try {
    await ensureChain(conn, net);
  } catch (e) {
    status.textContent = `Switch the wallet to ${net.name} (chain ${net.chainId}). ${errMsg(e)}`;
    status.hidden = false;
  }
}

function renderConn() {
  show("web3-none", !conn);
  show("web3-have", !!conn);
  $("connect-top").hidden = !!conn;
  if (conn) {
    text("web3-name", conn.info.name);
    text("web3-account", conn.account);
    text("web3-balance", gasBalance === null ? "…" : fmt(gasBalance));
  }
  renderSendState();
}

async function refreshGasBalance() {
  if (!conn) return;
  try {
    gasBalance = await pub.getBalance({ address: conn.account });
  } catch {
    gasBalance = null;
  }
  renderConn();
}

async function gasFor(req: { account: Address; to: Address; data?: Hex; value?: bigint }, fallbackGas: bigint) {
  try {
    const est = await pub.estimateGas(req);
    return (est * 125n) / 100n;
  } catch {
    return fallbackGas;
  }
}

$("fund-go").addEventListener("click", async () => {
  if (!conn || !walletAddr || funding) return;
  const status = $("fund-status");
  const btn = $<HTMLButtonElement>("fund-go");
  status.hidden = false;
  status.className = "status";
  let value: bigint;
  try {
    value = parseAmount($<HTMLInputElement>("fund-amount").value);
  } catch (e) {
    status.textContent = (e as Error).message;
    status.className = "status error";
    return;
  }
  funding = true;
  btn.disabled = true;
  try {
    status.textContent = `Asking the wallet to switch to ${net.name}`;
    await ensureChain(conn, net);
    const to = walletAddr;
    const gas = await gasFor({ account: conn.account, to, value }, GAS_FALLBACK.fund);
    const gasPrice = await pub.getGasPrice();
    status.textContent = "Confirm the transfer in your wallet";
    const hash = await conn.client.sendTransaction({
      account: conn.account,
      chain: chainOf(net),
      to,
      value,
      gas,
      gasPrice,
      type: "legacy",
    });
    status.replaceChildren(`Sent ${fmt(value)}, waiting for the receipt. `, link(txUrl(net, hash), short(hash)));
    const r = await pub.waitForTransactionReceipt({ hash, pollingInterval: 1500 });
    status.replaceChildren(
      r.status === "success" ? `Funded with ${fmt(value)} in block ${r.blockNumber}. ` : "The transfer reverted. ",
      link(txUrl(net, hash), "View on Blockscout"),
    );
    if (r.status !== "success") status.className = "status error";
    await Promise.all([refreshWallet(), refreshGasBalance()]);
  } catch (e) {
    status.textContent = errMsg(e);
    status.className = "status error";
  } finally {
    funding = false;
    btn.disabled = false;
  }
});

// ---------------------------------------------------------------------------
// Send card and stepper
// ---------------------------------------------------------------------------

const STEPS = [
  ["message", "Message"],
  ["signature", "Signature"],
  ["local", "Local verify"],
  ["onchain", "On-chain verify"],
  ["simulate", "Simulated"],
  ["sent", "Sent"],
  ["confirmed", "Confirmed"],
  ["explorer", "Blockscout"],
] as const;
type StepId = (typeof STEPS)[number][0];
type StepState = "idle" | "run" | "ok" | "fail";

function resetStepper() {
  $("stepper").replaceChildren();
}

function buildStepper() {
  $("stepper").replaceChildren(
    ...STEPS.map(([id, label]) =>
      el(
        "li",
        { class: "step idle", id: `step-${id}`, "data-state": "idle" },
        el("span", { class: "dot" }),
        el("span", { class: "label" }, label),
        el("span", { class: "detail" }),
      ),
    ),
  );
}

function step(id: StepId, state: StepState, ...detail: (Node | string)[]) {
  const li = $(`step-${id}`);
  li.className = `step ${state}`;
  li.dataset.state = state;
  li.querySelector(".dot")!.className = `dot ${state === "idle" ? "" : state}`;
  li.querySelector(".detail")!.replaceChildren(...detail);
}

function renderSendState() {
  const btn = $<HTMLButtonElement>("send-go");
  let hint = "";
  if (!key) hint = "Create or import a key first.";
  else if (!conn) hint = "Connect a gas wallet to submit the transaction.";
  else if (wallet && wallet.balance === 0n) hint = "The quantum-secure wallet is empty. Fund it first.";
  else if (wallet && !wallet.deployed)
    hint = "The first send also creates the wallet contract, in the same transaction.";
  else hint = "Signing takes a few seconds and runs in the background.";
  btn.disabled = sending || !key || !conn || !walletAddr;
  text("send-hint", hint);
}

$("send-to").addEventListener("input", (e) => {
  const i = e.target as HTMLInputElement;
  i.classList.toggle("invalid", !!i.value && !isAddress(i.value));
});

$("send-go").addEventListener("click", () => void doSend());

async function doSend() {
  if (!key || !seed || !conn || !walletAddr || sending) return;
  const to = $<HTMLInputElement>("send-to").value.trim();
  let value: bigint;
  try {
    if (!isAddress(to)) throw new Error("The recipient isn't a valid address.");
    value = parseAmount($<HTMLInputElement>("send-amount").value);
  } catch (e) {
    text("send-hint", (e as Error).message);
    return;
  }
  sending = true;
  renderSendState();
  buildStepper();
  const n = net;
  const k = key;
  const s = seed;
  const c = conn;
  let current: StepId = "message";
  try {
    // 1. Message
    step("message", "run", "reading the wallet");
    const w = await walletState(pub, walletAddr);
    wallet = w;
    renderWallet();
    if (w.balance < value) throw new Error(`The wallet holds ${fmt(w.balance)}, less than ${fmt(value)}.`);
    const data: Hex = "0x";
    const deadline = BigInt(Math.floor(Date.now() / 1000) + DEADLINE_SECONDS);
    const msg = messageHash({ chainId: n.chainId, wallet: w.address, nonce: w.nonce, to, value, data, deadline });
    if (w.deployed) {
      const onChain = await pub.readContract({
        address: w.address,
        abi: walletAbi,
        functionName: "messageHash",
        args: [to, value, data, w.nonce, deadline],
      });
      if (onChain !== msg) throw new Error(`The wallet computes ${onChain}, this page ${msg}.`);
    }
    step("message", "ok", `${short(msg, 18, 8)} (nonce ${w.nonce}${w.deployed ? ", matches messageHash()" : ""})`);

    // 2. Signature
    current = "signature";
    const bar = el("div");
    const detail = el("span", {}, "signing in a Web Worker");
    step("signature", "run", detail, el("div", { class: "bar" }, bar));
    const t0 = performance.now();
    const { signature } = await sign(s, msg, (phase, done, total) => {
      bar.style.width = `${(100 * done) / total}%`;
      detail.textContent = phase === "keygen" ? "rebuilding the top tree" : "signing in a Web Worker";
    });
    const bytes = (signature.length - 2) / 2;
    if (bytes !== 7740) throw new Error(`The signature is ${bytes} bytes, expected 7,740.`);
    step("signature", "ok", `${bytes.toLocaleString("en-US")} bytes in ${((performance.now() - t0) / 1000).toFixed(1)} s`);

    // 3. Local verify
    current = "local";
    step("local", "run");
    const okLocal = await verifyLocal(k.publicKey, msg, signature);
    if (okLocal !== true) throw new Error("The JavaScript verifier rejected the signature.");
    step("local", "ok", "valid in the JavaScript verifier");

    // 4. On-chain verify
    current = "onchain";
    step("onchain", "run", "eth_call to the verifier");
    const okChain = await verifyOnChain(pub, n, k.pkSeed, k.pkRoot, msg, signature);
    if (!okChain) throw new Error(`The verifier at ${n.verifier} returned false.`);
    step("onchain", "ok", `verify() returned true at ${short(n.verifier)}`);

    // 5. Simulate
    current = "simulate";
    step("simulate", "run", "eth_call of the whole transaction");
    const call = buildCall({ n, wallet: w, pkSeed: k.pkSeed, pkRoot: k.pkRoot, to, value, data, deadline, sig: signature });
    await pub.call({ account: c.account, to: call.to, data: call.data });
    const gas = await gasFor(
      { account: c.account, to: call.to, data: call.data },
      call.method === "execute" ? GAS_FALLBACK.execute : GAS_FALLBACK.createAndExecute,
    );
    step("simulate", "ok", `${call.method} succeeds, gas limit ${gas.toLocaleString("en-US")}`);

    // 6. Send
    current = "sent";
    step("sent", "run", `switching the wallet to ${n.name}`);
    await ensureChain(c, n);
    const gasPrice = await pub.getGasPrice();
    step("sent", "run", "confirm in your wallet");
    const hash = await c.client.sendTransaction({
      account: c.account,
      chain: chainOf(n),
      to: call.to,
      data: call.data,
      gas,
      gasPrice,
      type: "legacy",
    });
    step("sent", "ok", link(txUrl(n, hash), hash));

    // 7. Receipt
    current = "confirmed";
    step("confirmed", "run", "waiting for a block");
    const r = await pub.waitForTransactionReceipt({ hash, pollingInterval: 1500 });
    step("explorer", "ok", link(txUrl(n, hash), `${n.explorer.replace(/^https?:\/\//, "")}/tx/${short(hash)}`));
    if (r.status !== "success") {
      current = "confirmed";
      throw new Error(`The transaction reverted in block ${r.blockNumber}.`);
    }
    step(
      "confirmed",
      "ok",
      `status 1 in block ${r.blockNumber}, ${r.gasUsed.toLocaleString("en-US")} gas, ${fmt(value)} to ${short(to)}`,
    );
  } catch (e) {
    step(current, "fail", errMsg(e));
  } finally {
    sending = false;
    renderSendState();
    void refreshWallet().catch(() => {});
    void refreshGasBalance();
  }
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

renderNetwork();
renderWallet();
renderConn();
listProviders = discoverProviders(() => renderProviders());
renderProviders();
// Some wallets inject late. Look again once the page has settled.
setTimeout(renderProviders, 600);

const stored = loadSeed();
if (stored) void useSeed(stored, false);
else keyView("none");

void runSelfTests();

setInterval(() => {
  if (document.visibilityState !== "visible" || sending) return;
  void refreshWallet().catch(() => {});
  void refreshGasBalance();
}, 15_000);
