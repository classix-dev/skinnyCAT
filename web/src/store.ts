// App state and actions, kept outside React. Components read a snapshot through useApp().
// The flows here are the ones the page has always run, only the rendering moved to React.

import { useSyncExternalStore } from "react";
import { isAddress, type Address, type Hex, type PublicClient } from "viem";
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
import { walletAbi } from "./generated/contracts";
import { forgetSeed as dropSeed, loadSeed, phraseToSeed, randomSeed, saveSeed } from "./key";
import { errMsg, fmt, parseAmount, short } from "./lib/format";
import { selfTests, type Check } from "./selftest";
import { keygen, sign, verifyLocal, type PublicKeyInfo } from "./signer-client";
import { connect, discoverProviders, ensureChain, type Connection, type Discovered, type ProviderInfo } from "./web3";

export const STEPS = [
  ["message", "Message"],
  ["signature", "Signature"],
  ["local", "Local verify"],
  ["onchain", "On-chain verify"],
  ["simulate", "Simulated"],
  ["sent", "Sent"],
  ["confirmed", "Confirmed"],
  ["explorer", "Explorer"],
] as const;
export type StepId = (typeof STEPS)[number][0];
export type StepState = "idle" | "run" | "ok" | "fail";

export interface Step {
  id: StepId;
  label: string;
  state: StepState;
  /** Short plain text. */
  text?: string;
  /** A hash or address, shown in mono with a copy button. */
  value?: string;
  href?: string;
  /** 0 to 1 while a long step runs. */
  progress?: number;
}

export interface Status {
  tone: "info" | "ok" | "error";
  text: string;
  href?: string;
  linkLabel?: string;
}

export type KeyView = "none" | "import" | "busy" | "have";

export interface State {
  networks: NetworkConfig[];
  net: NetworkConfig;
  selftest: { state: "run" | "ok" | "fail"; checks: Check[] };

  keyView: KeyView;
  keyProgress: number;
  seed: Hex | null;
  key: PublicKeyInfo | null;
  keyError: string | null;
  /** The key was made just now, so the backup phrase starts open. */
  keyFresh: boolean;
  importArmed: boolean;

  walletAddr: Address | null;
  wallet: WalletState | null;
  walletError: string | null;

  providers: Discovered[];
  conn: { info: ProviderInfo; account: Address } | null;
  connError: string | null;
  gasBalance: bigint | null;
  funding: boolean;
  fundStatus: Status | null;
  fundAmount: string;

  sendTo: string;
  sendAmount: string;
  sendError: string | null;
  sending: boolean;
  steps: Step[] | null;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

const networks = enabledNetworks();
if (!networks.length) throw new Error("no network enabled in config");
const NET_KEY = "pq-classix.network";
const initialNet = networks.find((n) => n.key === localStorage.getItem(NET_KEY)) ?? networks[0];

let state: State = {
  networks,
  net: initialNet,
  selftest: { state: "run", checks: [] },
  keyView: "none",
  keyProgress: 0,
  seed: null,
  key: null,
  keyError: null,
  keyFresh: false,
  importArmed: false,
  walletAddr: null,
  wallet: null,
  walletError: null,
  providers: [],
  conn: null,
  connError: null,
  gasBalance: null,
  funding: false,
  fundStatus: null,
  fundAmount: initialNet.defaultAmount,
  sendTo: "",
  sendAmount: initialNet.defaultAmount,
  sendError: null,
  sending: false,
  steps: null,
};

const listeners = new Set<() => void>();
const get = () => state;
function set(patch: Partial<State> | ((s: State) => Partial<State>)) {
  state = { ...state, ...(typeof patch === "function" ? patch(state) : patch) };
  for (const l of listeners) l();
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export const useApp = () => useSyncExternalStore(subscribe, get, get);

let pub: PublicClient = publicClientOf(state.net);
/** The live connection, with its wallet client. State only carries what the UI shows. */
let conn: Connection | null = null;

// ---------------------------------------------------------------------------
// Network and self-tests
// ---------------------------------------------------------------------------

export function setNetwork(key: string) {
  const n = state.networks.find((x) => x.key === key);
  if (!n || n === state.net) return;
  localStorage.setItem(NET_KEY, n.key);
  pub = publicClientOf(n);
  set((s) => ({
    net: n,
    wallet: null,
    walletAddr: null,
    steps: null,
    fundStatus: null,
    fundAmount: s.fundAmount || n.defaultAmount,
    sendAmount: s.sendAmount || n.defaultAmount,
  }));
  void runSelfTests();
  if (state.key) void loadWallet();
  void refreshGasBalance();
}

async function runSelfTests() {
  set({ selftest: { state: "run", checks: [] } });
  const target = state.net;
  const checks = await selfTests(pub, target);
  if (target !== state.net) return;
  set({ selftest: { state: checks.every((c) => c.ok) ? "ok" : "fail", checks } });
}

// ---------------------------------------------------------------------------
// Key
// ---------------------------------------------------------------------------

async function loadKey(s: Hex, fresh = false) {
  set({ seed: s, keyFresh: fresh, key: null, wallet: null, walletAddr: null, keyView: "busy", keyProgress: 0, keyError: null });
  let k: PublicKeyInfo;
  try {
    k = await keygen(s, (_p, done, total) => {
      if (state.seed === s) set({ keyProgress: done / total });
    });
  } catch (e) {
    if (state.seed === s) set({ keyView: "none", keyError: errMsg(e) });
    return;
  }
  if (state.seed !== s) return;
  set({ key: k, keyView: "have" });
  await loadWallet();
}

export function createKey() {
  const s = randomSeed();
  saveSeed(s);
  void loadKey(s, true);
}

export const openImport = () => set({ keyView: "import", keyError: null, importArmed: false });
export const cancelImport = () => set((s) => ({ keyView: s.key ? "have" : "none", keyError: null, importArmed: false }));
export const disarmImport = () => state.importArmed && set({ importArmed: false });

/** Imports a phrase. Replacing a different stored key takes a second call. */
export function importPhrase(phrase: string) {
  let s: Hex;
  try {
    s = phraseToSeed(phrase);
  } catch (e) {
    set({ keyError: (e as Error).message });
    return;
  }
  if (state.seed && s !== state.seed && !state.importArmed) {
    set({
      importArmed: true,
      keyError: "This replaces the key stored in this browser. Back up its phrase first, then confirm.",
    });
    return;
  }
  set({ importArmed: false, keyError: null });
  saveSeed(s);
  void loadKey(s);
}

export function forgetKey() {
  dropSeed();
  set({ seed: null, key: null, wallet: null, walletAddr: null, keyView: "none", steps: null, keyError: null });
}

// ---------------------------------------------------------------------------
// LeanSPHINCS wallet
// ---------------------------------------------------------------------------

async function loadWallet() {
  const k = state.key;
  if (!k) return;
  set({ walletError: null });
  try {
    const predicted = predictWalletAddress(state.net, k.pkSeed, k.pkRoot);
    set({ walletAddr: predicted });
    const onChain = await walletAddress(pub, state.net, k.pkSeed, k.pkRoot);
    if (onChain.toLowerCase() !== predicted.toLowerCase())
      throw new Error(`The factory says ${onChain}, but this page computed ${predicted}.`);
    await refreshWallet();
  } catch (e) {
    if (state.key !== k) return;
    set({ walletError: errMsg(e) });
  }
}

async function refreshWallet() {
  const a = state.walletAddr;
  if (!a) return;
  const w = await walletState(pub, a);
  if (a !== state.walletAddr) return;
  set({ wallet: w, walletError: null });
}

export function reloadWallet() {
  refreshWallet().catch((e) => set({ walletError: errMsg(e) }));
}

export const walletExplorer = (s: State) => (s.walletAddr ? addressUrl(s.net, s.walletAddr) : undefined);

// ---------------------------------------------------------------------------
// Gas wallet
// ---------------------------------------------------------------------------

export async function connectProvider(d: Discovered) {
  set({ connError: null });
  let c: Connection;
  try {
    c = await connect(d);
  } catch (e) {
    set({ connError: errMsg(e) });
    return;
  }
  conn = c;
  c.provider.on?.("accountsChanged", (accs: Address[]) => {
    if (conn !== c) return;
    if (!accs.length) {
      conn = null;
      set({ conn: null, gasBalance: null });
      return;
    }
    const prev = c.account;
    c.account = accs[0];
    set((s) => ({ conn: { info: c.info, account: accs[0] }, sendTo: s.sendTo === prev ? accs[0] : s.sendTo }));
    void refreshGasBalance();
  });
  set((s) => ({ conn: { info: c.info, account: c.account }, sendTo: s.sendTo || c.account }));
  void refreshGasBalance();
  try {
    await ensureChain(c, state.net);
  } catch (e) {
    set({
      fundStatus: { tone: "error", text: `Switch the wallet to ${state.net.name} (chain ${state.net.chainId}). ${errMsg(e)}` },
    });
  }
}

/** Connects straight away when there is one wallet. Returns false when the user has to pick. */
export function quickConnect(): boolean {
  if (state.providers.length !== 1) return false;
  void connectProvider(state.providers[0]);
  return true;
}

async function refreshGasBalance() {
  if (!conn) return;
  let b: bigint | null;
  try {
    b = await pub.getBalance({ address: conn.account });
  } catch {
    b = null;
  }
  set({ gasBalance: b });
}

async function gasFor(req: { account: Address; to: Address; data?: Hex; value?: bigint }, fallbackGas: bigint) {
  try {
    const est = await pub.estimateGas(req);
    return (est * 125n) / 100n;
  } catch {
    return fallbackGas;
  }
}

export const setFundAmount = (v: string) => set({ fundAmount: v });

export async function fund() {
  const n = state.net;
  const to = state.walletAddr;
  if (!conn || !to || state.funding) return;
  let value: bigint;
  try {
    value = parseAmount(n, state.fundAmount);
  } catch (e) {
    set({ fundStatus: { tone: "error", text: (e as Error).message } });
    return;
  }
  const c = conn;
  set({ funding: true, fundStatus: { tone: "info", text: `Switching the wallet to ${n.name}` } });
  try {
    await ensureChain(c, n);
    const gas = await gasFor({ account: c.account, to, value }, GAS_FALLBACK.fund);
    const gasPrice = await pub.getGasPrice();
    set({ fundStatus: { tone: "info", text: "Confirm the transfer in your wallet" } });
    const hash = await c.client.sendTransaction({
      account: c.account,
      chain: chainOf(n),
      to,
      value,
      gas,
      gasPrice,
      type: "legacy",
    });
    set({ fundStatus: { tone: "info", text: `Sent ${fmt(n, value)}, waiting for a block`, href: txUrl(n, hash), linkLabel: short(hash) } });
    const r = await pub.waitForTransactionReceipt({ hash, pollingInterval: 1500 });
    set({
      fundStatus:
        r.status === "success"
          ? { tone: "ok", text: `Funded with ${fmt(n, value)} in block ${r.blockNumber}`, href: txUrl(n, hash), linkLabel: "View" }
          : { tone: "error", text: "The transfer reverted", href: txUrl(n, hash), linkLabel: "View" },
    });
    await Promise.all([refreshWallet(), refreshGasBalance()]);
  } catch (e) {
    set({ fundStatus: { tone: "error", text: errMsg(e) } });
  } finally {
    set({ funding: false });
  }
}

// ---------------------------------------------------------------------------
// Send
// ---------------------------------------------------------------------------

export const setSendTo = (v: string) => set({ sendTo: v, sendError: null });
export const setSendAmount = (v: string) => set({ sendAmount: v, sendError: null });

function step(id: StepId, st: StepState, detail: Omit<Step, "id" | "label" | "state"> = {}) {
  set((s) => ({ steps: s.steps?.map((x) => (x.id === id ? { id, label: x.label, state: st, ...detail } : x)) ?? null }));
}

export async function send() {
  const { key: k, seed: s, walletAddr, net: n } = state;
  if (!k || !s || !conn || !walletAddr || state.sending) return;
  const to = state.sendTo.trim();
  let value: bigint;
  try {
    if (!isAddress(to)) throw new Error("The recipient isn't a valid address.");
    value = parseAmount(n, state.sendAmount);
  } catch (e) {
    set({ sendError: (e as Error).message });
    return;
  }
  const c = conn;
  set({ sending: true, sendError: null, steps: STEPS.map(([id, label]) => ({ id, label, state: "idle" })) });
  let current: StepId = "message";
  try {
    // 1. Message
    step("message", "run", { text: "reading the wallet" });
    const w = await walletState(pub, walletAddr);
    set({ wallet: w });
    if (w.balance < value) throw new Error(`The wallet holds ${fmt(n, w.balance)}, less than ${fmt(n, value)}.`);
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
    step("message", "ok", { value: msg, text: `nonce ${w.nonce}${w.deployed ? ", matches messageHash()" : ""}` });

    // 2. Signature
    current = "signature";
    step("signature", "run", { text: "signing in a Web Worker", progress: 0 });
    const t0 = performance.now();
    const { signature } = await sign(s, msg, (phase, done, total) =>
      step("signature", "run", {
        text: phase === "keygen" ? "rebuilding the top tree" : "signing in a Web Worker",
        progress: done / total,
      }),
    );
    const bytes = (signature.length - 2) / 2;
    if (bytes !== 7740) throw new Error(`The signature is ${bytes} bytes, expected 7,740.`);
    step("signature", "ok", {
      text: `${bytes.toLocaleString("en-US")} bytes in ${((performance.now() - t0) / 1000).toFixed(1)} s`,
    });

    // 3. Local verify
    current = "local";
    step("local", "run", { text: "JavaScript verifier" });
    const okLocal = await verifyLocal(k.publicKey, msg, signature);
    if (okLocal !== true) throw new Error("The JavaScript verifier rejected the signature.");
    step("local", "ok", { text: "valid in JavaScript" });

    // 4. On-chain verify
    current = "onchain";
    step("onchain", "run", { text: "eth_call to the verifier" });
    const okChain = await verifyOnChain(pub, n, k.pkSeed, k.pkRoot, msg, signature);
    if (!okChain) throw new Error(`The verifier at ${n.verifier} returned false.`);
    step("onchain", "ok", { text: "returned true", value: n.verifier, href: addressUrl(n, n.verifier) });

    // 5. Simulate
    current = "simulate";
    step("simulate", "run", { text: "eth_call of the whole transaction" });
    const call = buildCall({ n, wallet: w, pkSeed: k.pkSeed, pkRoot: k.pkRoot, to, value, data, deadline, sig: signature });
    await pub.call({ account: c.account, to: call.to, data: call.data });
    const gas = await gasFor(
      { account: c.account, to: call.to, data: call.data },
      call.method === "execute" ? GAS_FALLBACK.execute : GAS_FALLBACK.createAndExecute,
    );
    step("simulate", "ok", { text: `${call.method}, gas limit ${gas.toLocaleString("en-US")}` });

    // 6. Send
    current = "sent";
    step("sent", "run", { text: `switching the wallet to ${n.name}` });
    await ensureChain(c, n);
    const gasPrice = await pub.getGasPrice();
    step("sent", "run", { text: "confirm in your wallet" });
    const hash = await c.client.sendTransaction({
      account: c.account,
      chain: chainOf(n),
      to: call.to,
      data: call.data,
      gas,
      gasPrice,
      type: "legacy",
    });
    step("sent", "ok", { value: hash, href: txUrl(n, hash) });

    // 7. Receipt
    current = "confirmed";
    step("confirmed", "run", { text: "waiting for a block" });
    const r = await pub.waitForTransactionReceipt({ hash, pollingInterval: 1500 });
    step("explorer", "ok", { text: n.explorer.replace(/^https?:\/\//, ""), href: txUrl(n, hash) });
    if (r.status !== "success") throw new Error(`The transaction reverted in block ${r.blockNumber}.`);
    step("confirmed", "ok", {
      text: `block ${r.blockNumber}, ${r.gasUsed.toLocaleString("en-US")} gas, ${fmt(n, value)} to ${short(to)}`,
    });
  } catch (e) {
    step(current, "fail", { text: errMsg(e) });
  } finally {
    set({ sending: false });
    void refreshWallet().catch(() => {});
    void refreshGasBalance();
  }
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

let started = false;
export function start() {
  if (started) return;
  started = true;
  const list = discoverProviders((l) => set({ providers: l }));
  set({ providers: list() });
  // Some wallets inject late. Look again once the page has settled.
  setTimeout(() => set({ providers: list() }), 600);

  const stored = loadSeed();
  if (stored) void loadKey(stored);

  void runSelfTests();

  setInterval(() => {
    if (document.visibilityState !== "visible" || state.sending) return;
    void refreshWallet().catch(() => {});
    void refreshGasBalance();
  }, 15_000);
}
