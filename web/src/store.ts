// App state and actions, kept outside React. Components read a snapshot through useApp().
// Nothing here touches the browser until start() runs, after hydration, so the pre-rendered HTML
// and the first client render come from the same initial state.

import { useSyncExternalStore } from "react";
import { isAddress, type Address, type Hex, type PublicClient } from "viem";
import { addressUrl, DEADLINE_SECONDS, DEFAULTS, GAS_FALLBACK, NETWORK, network, txUrl, type NetworkConfig } from "./config";
import { discoverProviders, type Discovered, type ProviderInfo } from "./discover";
import { LEDGER_SYMBOL, ledgerAbi } from "./generated/contracts";
import { forgetSeed as dropSeed, loadSeed, NAMES, phraseToSeed, randomSeed, saveSeed, WHO, type Who } from "./key";
import { accountOf, callData, digest, readEvents, type Kind } from "./ledger";
import { errMsg, fmt, parseAmount, revertName, short } from "./lib/format";
import type { Check } from "./selftest";
import { keygen, sign, verifyLocal, type PublicKeyInfo } from "./signer-client";
import type { Connection } from "./web3";

// The RPC client, the browser wallet client and the self-tests load after hydration, so the chunk
// that hydrates the page stays small.
const chainMod = () => import("./chain");
const web3Mod = () => import("./web3");

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
const SIGN_ONLY_STEPS: StepId[] = ["message", "signature", "local", "onchain"];

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

export interface Run {
  kind: Kind;
  signOnly: boolean;
  steps: Step[];
  /** Set once the receipt is in. */
  receipt?: { memo: string | null; href: string; fee: bigint | null };
  /** Set after a Sign Only run. */
  signed?: { digest: Hex; signature: Hex };
}

export type KeyView = "none" | "import" | "busy" | "have";

export interface Slot {
  view: KeyView;
  progress: number;
  seed: Hex | null;
  key: PublicKeyInfo | null;
  account: Address | null;
  balance: bigint | null;
  nonce: bigint | null;
  error: string | null;
  /** The key was made just now, so the backup phrase starts open. */
  fresh: boolean;
  importArmed: boolean;
}

export interface AliceForm {
  deposit: string;
  amount: string;
  memo: string;
  error: string | null;
}

export interface BobForm {
  kind: Kind;
  /** Ledger account for a transfer. Follows Alice's account until edited. */
  to: string;
  /** ETC address for a withdrawal. */
  withdrawTo: string;
  amount: string;
  fee: string;
  memo: string;
  error: string | null;
}

export interface State {
  /** False in the pre-rendered HTML and until start() runs. */
  live: boolean;
  net: NetworkConfig;
  /** Whether ${LEDGER_SYMBOL} has code on the network. Null until checked, after start(). */
  deployed: boolean | null;
  selftest: { state: "run" | "ok" | "fail"; checks: Check[] };
  keys: Record<Who, Slot>;
  providers: Discovered[];
  conn: { info: ProviderInfo; account: Address } | null;
  connError: string | null;
  connStatus: string | null;
  gasBalance: bigint | null;
  gasPrice: bigint | null;
  alice: AliceForm;
  bob: BobForm;
  busy: Who | null;
  runs: Record<Who, Run | null>;
}

const emptySlot = (): Slot => ({
  view: "none",
  progress: 0,
  seed: null,
  key: null,
  account: null,
  balance: null,
  nonce: null,
  error: null,
  fresh: false,
  importArmed: false,
});

export function initialState(): State {
  return {
    live: false,
    net: NETWORK,
    deployed: null,
    selftest: { state: "run", checks: [] },
    keys: { alice: emptySlot(), bob: emptySlot() },
    providers: [],
    conn: null,
    connError: null,
    connStatus: null,
    gasBalance: null,
    gasPrice: null,
    alice: { deposit: DEFAULTS.deposit, amount: DEFAULTS.send, memo: DEFAULTS.memo, error: null },
    bob: { kind: "transfer", to: "", withdrawTo: "", amount: DEFAULTS.bobAmount, fee: DEFAULTS.bobFee, memo: "", error: null },
    busy: null,
    runs: { alice: null, bob: null },
  };
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

const SERVER_STATE = initialState();
let state: State = SERVER_STATE;
const listeners = new Set<() => void>();
const get = () => state;
const getServer = () => SERVER_STATE;
function set(patch: Partial<State> | ((s: State) => Partial<State>)) {
  state = { ...state, ...(typeof patch === "function" ? patch(state) : patch) };
  for (const l of listeners) l();
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export const useApp = () => useSyncExternalStore(subscribe, get, getServer);
export const getState = get;

function setSlot(who: Who, patch: Partial<Slot> | ((s: Slot) => Partial<Slot>)) {
  set((s) => {
    const cur = s.keys[who];
    return { keys: { ...s.keys, [who]: { ...cur, ...(typeof patch === "function" ? patch(cur) : patch) } } };
  });
}

let pub: PublicClient | null = null;
async function client(): Promise<PublicClient> {
  if (!pub) {
    const { publicClientOf } = await chainMod();
    pub ??= publicClientOf(state.net);
  }
  return pub;
}
/** The live connection, with its client. State only carries what the UI shows. */
let conn: Connection | null = null;

/** Test hook: replaces the store's state (unit tests only). */
export function __setState(s: Partial<State>) {
  set(s);
}
export function __reset() {
  state = SERVER_STATE;
  pub = null;
  conn = null;
  started = false;
  for (const l of listeners) l();
}

// ---------------------------------------------------------------------------
// Self-tests
// ---------------------------------------------------------------------------

// Before the mainnet deploy the page still works: keys, balances of zero and Sign Only, without the
// on-chain steps. One getCode, shared by everything that reads the ledger.
let deployedP: Promise<boolean> | null = null;
function isDeployed(): Promise<boolean> {
  deployedP ??= client()
    .then((pc) => pc.getCode({ address: state.net.ledger }))
    .then((code) => {
      const d = !!code && code !== "0x";
      set({ deployed: d });
      return d;
    })
    .catch(() => {
      deployedP = null;
      return true;
    });
  return deployedP;
}

async function runSelfTests() {
  set({ selftest: { state: "run", checks: [] } });
  const { selfTests } = await import("./selftest");
  const checks = await selfTests(await client(), state.net);
  set({ selftest: { state: checks.every((c) => c.ok) ? "ok" : "fail", checks } });
}

// ---------------------------------------------------------------------------
// Keys
// ---------------------------------------------------------------------------

async function loadKey(who: Who, seed: Hex, fresh = false) {
  setSlot(who, { ...emptySlot(), seed, fresh, view: "busy" });
  let k: PublicKeyInfo;
  try {
    k = await keygen(seed, (_p, done, total) => {
      if (state.keys[who].seed === seed) setSlot(who, { progress: done / total });
    });
  } catch (e) {
    if (state.keys[who].seed === seed) setSlot(who, { view: "none", seed: null, error: errMsg(e) });
    return;
  }
  if (state.keys[who].seed !== seed) return;
  const account = accountOf(k.pkSeed, k.pkRoot);
  setSlot(who, { key: k, account, view: "have" });
  if (who === "alice") followAlice(account);
  await refreshAccount(who);
}

/** Bob's transfer goes to Alice unless someone typed another account. */
function followAlice(account: Address | null) {
  set((s) => {
    const prev = s.keys.alice.account;
    const following = !s.bob.to || (prev && s.bob.to === prev) || s.bob.to === account;
    return following ? { bob: { ...s.bob, to: account ?? "" } } : {};
  });
}

export function createKey(who: Who) {
  const seed = randomSeed();
  saveSeed(who, seed);
  void loadKey(who, seed, true);
}

export const openImport = (who: Who) => setSlot(who, { view: "import", error: null, importArmed: false });
export const cancelImport = (who: Who) =>
  setSlot(who, (s) => ({ view: s.key ? "have" : "none", error: null, importArmed: false }));
export const disarmImport = (who: Who) => state.keys[who].importArmed && setSlot(who, { importArmed: false });

/** Imports a phrase. Replacing a different stored key takes a second call. */
export function importPhrase(who: Who, phrase: string) {
  let seed: Hex;
  try {
    seed = phraseToSeed(phrase);
  } catch (e) {
    setSlot(who, { error: (e as Error).message });
    return;
  }
  const slot = state.keys[who];
  if (slot.seed && seed !== slot.seed && !slot.importArmed) {
    setSlot(who, {
      importArmed: true,
      error: `This replaces ${NAMES[who]}'s key in this browser. Back up its phrase first, then confirm.`,
    });
    return;
  }
  const other = WHO.find((w) => w !== who)!;
  if (state.keys[other].seed === seed) {
    setSlot(who, { error: `That's ${NAMES[other]}'s key. Give each person their own.` });
    return;
  }
  saveSeed(who, seed);
  void loadKey(who, seed);
}

export function forgetKey(who: Who) {
  dropSeed(who);
  setSlot(who, emptySlot());
  set((s) => ({ runs: { ...s.runs, [who]: null } }));
  if (who === "alice") followAlice(null);
}

async function refreshAccount(who: Who) {
  const a = state.keys[who].account;
  if (!a) return;
  try {
    if (!(await isDeployed())) {
      if (state.keys[who].account === a) setSlot(who, { balance: 0n, nonce: 0n, error: null });
      return;
    }
    const pc = await client();
    const [balance, nonce] = await Promise.all([
      pc.readContract({ address: state.net.ledger, abi: ledgerAbi, functionName: "balanceOf", args: [a] }),
      pc.readContract({ address: state.net.ledger, abi: ledgerAbi, functionName: "nonces", args: [a] }),
    ]);
    if (state.keys[who].account === a) setSlot(who, { balance, nonce, error: null });
  } catch (e) {
    if (state.keys[who].account === a) setSlot(who, { error: `Couldn't read the balance. ${errMsg(e)}` });
  }
}

export const refreshAll = () => Promise.all([refreshAccount("alice"), refreshAccount("bob"), refreshGasBalance()]);

// ---------------------------------------------------------------------------
// Browser wallet
// ---------------------------------------------------------------------------

export async function connectProvider(d: Discovered) {
  set({ connError: null, connStatus: null });
  let c: Connection;
  try {
    c = await (await web3Mod()).connect(d);
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
    c.account = accs[0];
    set({ conn: { info: c.info, account: accs[0] } });
    void refreshGasBalance();
  });
  set({ conn: { info: c.info, account: c.account } });
  void refreshGasBalance();
  try {
    await (await web3Mod()).ensureChain(c, state.net);
  } catch (e) {
    set({ connStatus: `Switch the browser wallet to ${state.net.name} (chain ${state.net.chainId}). ${errMsg(e)}` });
  }
}

/** Connects straight away when there is one browser wallet. Returns false when the user has to pick. */
export function quickConnect(): boolean {
  if (state.providers.length !== 1) return false;
  void connectProvider(state.providers[0]);
  return true;
}

async function refreshGasBalance() {
  const a = conn?.account;
  const pc = await client();
  const [b, p] = await Promise.all([
    a ? pc.getBalance({ address: a }).catch(() => null) : Promise.resolve(null),
    pc.getGasPrice().catch(() => state.gasPrice),
  ]);
  set({ gasBalance: b, gasPrice: p });
}

// ---------------------------------------------------------------------------
// Forms
// ---------------------------------------------------------------------------

export const setAlice = (p: Partial<AliceForm>) => set((s) => ({ alice: { ...s.alice, ...p, error: null } }));
export const setBob = (p: Partial<BobForm>) => set((s) => ({ bob: { ...s.bob, ...p, error: null } }));

// ---------------------------------------------------------------------------
// Signing and sending
// ---------------------------------------------------------------------------

function step(who: Who, id: StepId, st: StepState, detail: Omit<Step, "id" | "label" | "state"> = {}) {
  set((s) => {
    const r = s.runs[who];
    if (!r) return {};
    return { runs: { ...s.runs, [who]: { ...r, steps: r.steps.map((x) => (x.id === id ? { id, label: x.label, state: st, ...detail } : x)) } } };
  });
}

function patchRun(who: Who, p: Partial<Run>) {
  set((s) => (s.runs[who] ? { runs: { ...s.runs, [who]: { ...s.runs[who]!, ...p } } } : {}));
}

interface Plan {
  kind: Kind;
  to: Address;
  amount: bigint;
  fee: bigint;
  /** ETC sent along, deposited to the signer first. */
  value: bigint;
  memo: string;
}

/** Reads and checks a form. Throws with a message for the form. */
export function planFor(who: Who, s: State = state): Plan {
  if (who === "alice") {
    const f = s.alice;
    const bob = s.keys.bob.account;
    if (!bob) throw new Error("Create or import Bob's key first, so Alice has someone to pay.");
    return {
      kind: "transfer",
      to: bob,
      value: parseAmount(f.deposit, { allowZero: true, what: "The deposit" }),
      amount: parseAmount(f.amount, { what: "The amount for Bob" }),
      fee: 0n,
      memo: f.memo,
    };
  }
  const f = s.bob;
  const to = (f.kind === "transfer" ? f.to : f.withdrawTo).trim();
  if (!isAddress(to)) throw new Error(f.kind === "transfer" ? `The ${LEDGER_SYMBOL} account isn't a valid address.` : "The address to withdraw to isn't valid.");
  return {
    kind: f.kind,
    to: to as Address,
    value: 0n,
    amount: parseAmount(f.amount, { what: "The amount" }),
    fee: parseAmount(f.fee, { allowZero: true, what: "The fee" }),
    memo: f.memo,
  };
}

const formError = (who: Who, error: string) =>
  set((s) => (who === "alice" ? { alice: { ...s.alice, error } } : { bob: { ...s.bob, error } }));

/**
 * Signs the current form with the person's key, checks the signature locally and with the deployed
 * verifier, and unless `signOnly`, simulates and submits it through the browser wallet.
 */
export async function act(who: Who, signOnly: boolean) {
  const n = state.net;
  const slot = state.keys[who];
  if (state.busy) return;
  if (!slot.key || !slot.seed || !slot.account) return formError(who, `Create or import ${NAMES[who]}'s key first.`);
  const deployed = await isDeployed();
  if (!signOnly && !deployed)
    return formError(who, `${LEDGER_SYMBOL} isn't on Ethereum Classic yet, so there's nothing to send to. Sign Only works now.`);
  if (!signOnly && !conn) return formError(who, "Connect a browser wallet to submit. Or use Sign Only.");
  let plan: Plan;
  try {
    plan = planFor(who);
  } catch (e) {
    return formError(who, (e as Error).message);
  }
  const { key: k, seed, account: from } = slot;
  const c = conn;
  const ids = !deployed ? SIGN_ONLY_STEPS.filter((id) => id !== "onchain") : signOnly ? SIGN_ONLY_STEPS : STEPS.map(([id]) => id);
  const steps = STEPS.filter(([id]) => ids.includes(id)).map(([id, label]): Step => ({ id, label, state: "idle" }));
  set((s) => ({ busy: who, runs: { ...s.runs, [who]: { kind: plan.kind, signOnly, steps } } }));
  let current: StepId = "message";
  try {
    const pc = await client();
    const { chainOf, verifyOnChain } = await chainMod();
    const { ensureChain } = await web3Mod();
    // 1. Message
    step(who, "message", "run", { text: "reading the nonce" });
    const [balance, nonce] = deployed
      ? await Promise.all([
          pc.readContract({ address: n.ledger, abi: ledgerAbi, functionName: "balanceOf", args: [from] }),
          pc.readContract({ address: n.ledger, abi: ledgerAbi, functionName: "nonces", args: [from] }),
        ])
      : [0n, 0n];
    setSlot(who, { balance, nonce });
    if (!signOnly) {
      const debit = plan.amount + plan.fee;
      if (balance + plan.value < debit) {
        const has = plan.value ? `${fmt(balance, LEDGER_SYMBOL)} and deposits ${fmt(plan.value, "ETC")}` : fmt(balance, LEDGER_SYMBOL);
        throw new Error(`${NAMES[who]} holds ${has}, less than the ${fmt(debit, LEDGER_SYMBOL)} this spends.`);
      }
      if (plan.value && state.gasBalance !== null && state.gasBalance < plan.value)
        throw new Error(`The browser wallet holds ${fmt(state.gasBalance, "ETC")}, less than the ${fmt(plan.value, "ETC")} deposit.`);
    }
    const deadline = BigInt(Math.floor(Date.now() / 1000) + DEADLINE_SECONDS);
    const p = { chainId: n.chainId, ledger: n.ledger, from, nonce, to: plan.to, amount: plan.amount, fee: plan.fee, deadline, memo: plan.memo };
    const msg = digest(plan.kind, p);
    const fn = plan.kind === "transfer" ? "transferDigest" : "withdrawDigest";
    if (!deployed) {
      step(who, "message", "ok", { value: msg, text: `nonce ${nonce}, ${LEDGER_SYMBOL} isn't deployed yet` });
    } else {
      const onChain = await pc.readContract({
        address: n.ledger,
        abi: ledgerAbi,
        functionName: fn,
        args: [from, nonce, plan.to, plan.amount, plan.fee, deadline, plan.memo],
      });
      if (onChain !== msg) throw new Error(`${LEDGER_SYMBOL} computes ${onChain}, this page ${msg}.`);
      step(who, "message", "ok", { value: msg, text: `nonce ${nonce}, matches ${fn}()` });
    }

    // 2. Signature
    current = "signature";
    step(who, "signature", "run", { text: "signing in a Web Worker", progress: 0 });
    const t0 = performance.now();
    const { signature } = await sign(seed, msg, (phase, done, total) =>
      step(who, "signature", "run", { text: phase === "keygen" ? "rebuilding the top tree" : "signing in a Web Worker", progress: done / total }),
    );
    const bytes = (signature.length - 2) / 2;
    if (bytes !== 7740) throw new Error(`The signature is ${bytes} bytes, expected 7,740.`);
    step(who, "signature", "ok", { text: `${bytes.toLocaleString("en-US")} bytes in ${((performance.now() - t0) / 1000).toFixed(1)} s` });

    // 3. Local verify
    current = "local";
    step(who, "local", "run", { text: "JavaScript verifier" });
    if ((await verifyLocal(k.publicKey, msg, signature)) !== true) throw new Error("The JavaScript verifier rejected the signature.");
    step(who, "local", "ok", { text: "valid in JavaScript" });

    if (!deployed) {
      patchRun(who, { signed: { digest: msg, signature } });
      return;
    }

    // 4. On-chain verify
    current = "onchain";
    step(who, "onchain", "run", { text: "eth_call to the verifier" });
    if (!(await verifyOnChain(pc, n, k.pkSeed, k.pkRoot, msg, signature))) throw new Error(`The verifier at ${n.verifier} returned false.`);
    step(who, "onchain", "ok", { text: "returned true", value: n.verifier, href: addressUrl(n, n.verifier) });
    if (signOnly || !c) {
      patchRun(who, { signed: { digest: msg, signature } });
      return;
    }

    // 5. Simulate
    current = "simulate";
    step(who, "simulate", "run", { text: "eth_call of the whole transaction" });
    const data = callData(plan.kind, { pkSeed: k.pkSeed, pkRoot: k.pkRoot, to: plan.to, amount: plan.amount, fee: plan.fee, deadline, memo: plan.memo, sig: signature });
    const tx = { account: c.account, to: n.ledger, data, value: plan.value };
    await pc.call(tx);
    let gas: bigint;
    try {
      gas = ((await pc.estimateGas(tx)) * 125n) / 100n;
    } catch {
      gas = GAS_FALLBACK;
    }
    const feeText = plan.fee ? `, fee ${fmt(plan.fee, "ETC")} to the relayer` : "";
    step(who, "simulate", "ok", { text: `${plan.kind}, gas limit ${gas.toLocaleString("en-US")}${feeText}` });

    // 6. Send
    current = "sent";
    step(who, "sent", "run", { text: `switching the browser wallet to ${n.name}` });
    await ensureChain(c, n);
    const gasPrice = await pc.getGasPrice();
    step(who, "sent", "run", { text: "confirm in your browser wallet" });
    const hash = await c.client.sendTransaction({
      account: c.account,
      chain: chainOf(n),
      to: n.ledger,
      data,
      value: plan.value,
      gas,
      gasPrice,
      type: "legacy",
    });
    step(who, "sent", "ok", { value: hash, href: txUrl(n, hash) });

    // 7. Receipt
    current = "confirmed";
    step(who, "confirmed", "run", { text: "waiting for a block" });
    const r = await pc.waitForTransactionReceipt({ hash, pollingInterval: 1500 });
    step(who, "explorer", "ok", { text: n.explorer.replace(/^https?:\/\//, ""), href: txUrl(n, hash) });
    if (r.status !== "success") {
      // Replay it to say why. A changed field shows up as BadSignature.
      let why = "";
      try {
        await pc.call({ ...tx, data: (await pc.getTransaction({ hash })).input, blockNumber: r.blockNumber - 1n });
      } catch (e) {
        const raw = (e as { walk?: (f: (x: unknown) => boolean) => unknown }).walk?.((x) => typeof (x as { data?: unknown }).data === "string") as
          | { data?: Hex }
          | undefined;
        const name = revertName(raw?.data);
        if (name) why = `, ${name}`;
      }
      throw new Error(`The transaction reverted in block ${r.blockNumber}${why}.`);
    }
    const ev = readEvents(r.logs, n.ledger);
    const what =
      plan.kind === "transfer"
        ? `${fmt(plan.amount, LEDGER_SYMBOL)} to ${short(plan.to)}`
        : `${fmt(plan.amount, "ETC")} out to ${short(plan.to)}`;
    step(who, "confirmed", "ok", { text: `block ${r.blockNumber}, ${r.gasUsed.toLocaleString("en-US")} gas, ${what}` });
    patchRun(who, { receipt: { memo: ev.memo, href: txUrl(n, hash), fee: ev.fee?.amount ?? null } });
  } catch (e) {
    step(who, current, "fail", { text: errMsg(e) });
  } finally {
    set({ busy: null });
    void refreshAll();
  }
}

// ---------------------------------------------------------------------------
// Start, after hydration
// ---------------------------------------------------------------------------

let started = false;
export function start() {
  if (started) return;
  started = true;
  const net = network();
  set({ live: true, net });

  const list = discoverProviders((l) => set({ providers: l }));
  set({ providers: list() });
  // Some browser wallets inject late. Look again once the page has settled.
  setTimeout(() => set({ providers: list() }), 600);

  // Alice first, so the worker builds her tree while Bob's waits its turn.
  for (const who of WHO) {
    const seed = loadSeed(who);
    if (seed) void loadKey(who, seed);
  }
  void isDeployed();
  void runSelfTests();
  void refreshGasBalance();

  setInterval(() => {
    if (document.visibilityState !== "visible" || state.busy) return;
    void refreshAll();
  }, 15_000);
}

export const accountUrl = (s: State, who: Who) => {
  const a = s.keys[who].account;
  return a ? addressUrl(s.net, a) : undefined;
};
