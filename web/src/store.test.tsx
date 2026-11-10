import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { fakeChain, keyFor, SIG } from "./test/fakes";

const chain = fakeChain();
vi.mock("./signer-client", () => ({
  keygen: vi.fn(async (seed: `0x${string}`, onProgress?: (p: string, d: number, t: number) => void) => {
    onProgress?.("keygen", 1, 2);
    return keyFor(seed);
  }),
  sign: vi.fn(async (_seed: string, _m: string, onProgress?: (p: string, d: number, t: number) => void) => {
    onProgress?.("sign", 1, 2);
    return { signature: SIG, ms: 5, fresh: false };
  }),
  verifyLocal: vi.fn(async () => true),
}));
vi.mock("./chain", async (orig) => ({
  ...(await orig<typeof import("./chain")>()),
  publicClientOf: () => chain.client,
  verifyOnChain: vi.fn(async () => true),
}));
vi.mock("./selftest", () => ({ selfTests: async () => [{ name: "chain id", ok: true, detail: "61" }] }));

const { App } = await import("./App");
const { LEDGER_SYMBOL } = await import("./generated/contracts");
const store = await import("./store");
const { accountOf } = await import("./ledger");
const { seedToPhrase, randomSeed } = await import("./key");
const signerClient = await import("./signer-client");

const until = async (fn: () => boolean) => vi.waitFor(() => expect(fn()).toBe(true), { timeout: 2000 });
const s = () => store.getState();

beforeEach(() => {
  vi.useRealTimers();
  store.__reset();
  chain.balances.clear();
  chain.nonces.clear();
  chain.sent.length = 0;
  chain.setMemo(null);
});
afterEach(() => store.__reset());

describe("before start", () => {
  test("rendering touches no browser storage", () => {
    const spy = vi.spyOn(Storage.prototype, "getItem");
    const html = renderToString(<App autoStart={false} />);
    expect(html).toContain("Two Cats, Two Keys");
    expect(spy).not.toHaveBeenCalled();
    expect(s().live).toBe(false);
  });
});

describe("keys", () => {
  test("create stores the seed and derives the account", async () => {
    store.start();
    store.createKey("alice");
    expect(s().keys.alice.view).toBe("busy");
    await until(() => s().keys.alice.view === "have");
    const seed = s().keys.alice.seed!;
    expect(localStorage.getItem("pq-classix.alice.leansphincs-seed.v1")).toBe(seed);
    const k = keyFor(seed);
    expect(s().keys.alice.account).toBe(accountOf(k.pkSeed, k.pkRoot));
    expect(s().keys.alice.fresh).toBe(true);
    await until(() => s().keys.alice.balance === 0n);
    // Bob's transfer follows Alice's account.
    expect(s().bob.to).toBe(s().keys.alice.account);
  });

  test("start loads both stored keys", async () => {
    const a = randomSeed();
    const b = randomSeed();
    localStorage.setItem("pq-classix.alice.leansphincs-seed.v1", a);
    localStorage.setItem("pq-classix.bob.leansphincs-seed.v1", b);
    store.start();
    await until(() => s().keys.alice.view === "have" && s().keys.bob.view === "have");
    expect(s().keys.alice.seed).toBe(a);
    expect(s().keys.bob.seed).toBe(b);
    expect(s().keys.alice.fresh).toBe(false);
  });

  test("import checks the phrase, asks before replacing, refuses the other person's key", async () => {
    store.start();
    store.importPhrase("bob", "abandon ".repeat(23) + "zoo");
    expect(s().keys.bob.error).toMatch(/checksum/);

    const a = randomSeed();
    store.importPhrase("alice", seedToPhrase(a));
    await until(() => s().keys.alice.view === "have");
    store.importPhrase("bob", seedToPhrase(a));
    expect(s().keys.bob.error).toMatch(/That's Alice's key/);

    const other = randomSeed();
    store.importPhrase("alice", seedToPhrase(other));
    expect(s().keys.alice.importArmed).toBe(true);
    expect(s().keys.alice.seed).toBe(a);
    store.importPhrase("alice", seedToPhrase(other));
    await until(() => s().keys.alice.seed === other && s().keys.alice.view === "have");
  });

  test("forget clears the slot and storage", async () => {
    store.start();
    store.createKey("bob");
    await until(() => s().keys.bob.view === "have");
    store.forgetKey("bob");
    expect(s().keys.bob).toMatchObject({ view: "none", seed: null, account: null });
    expect(localStorage.getItem("pq-classix.bob.leansphincs-seed.v1")).toBeNull();
  });

  test("a keygen failure comes back as an error", async () => {
    vi.mocked(signerClient.keygen).mockRejectedValueOnce(new Error("worker died"));
    store.start();
    store.createKey("alice");
    await until(() => s().keys.alice.error === "worker died");
    expect(s().keys.alice.view).toBe("none");
  });
});

describe("forms", () => {
  test("Alice needs Bob and sane amounts", async () => {
    store.start();
    expect(() => store.planFor("alice")).toThrow(/Bob's key/);
    store.createKey("bob");
    await until(() => s().keys.bob.view === "have");
    expect(store.planFor("alice")).toMatchObject({ kind: "transfer", to: s().keys.bob.account, value: 10n ** 16n, amount: 4n * 10n ** 15n, fee: 0n });
    store.setAlice({ deposit: "0" });
    expect(store.planFor("alice").value).toBe(0n);
    store.setAlice({ amount: "0" });
    expect(() => store.planFor("alice")).toThrow(/more than zero/);
    store.setAlice({ amount: "abc" });
    expect(() => store.planFor("alice")).toThrow(/amount for Bob has to be a number/);
  });

  test("Bob's withdraw needs an address", () => {
    store.setBob({ kind: "withdraw", withdrawTo: "0x123" });
    expect(() => store.planFor("bob")).toThrow(/withdraw to isn't valid/);
    store.setBob({ withdrawTo: "0x000000000000000000000000000000000000dEaD", fee: "0" });
    expect(store.planFor("bob")).toMatchObject({ kind: "withdraw", fee: 0n, value: 0n });
  });
});

describe("act", () => {
  async function twoKeys() {
    store.start();
    store.createKey("alice");
    await until(() => s().keys.alice.view === "have");
    store.createKey("bob");
    await until(() => s().keys.bob.view === "have");
  }

  test("Sign Only signs and checks without a browser wallet", async () => {
    await twoKeys();
    await store.act("alice", true);
    const run = s().runs.alice!;
    expect(run.steps.map((x) => [x.id, x.state])).toEqual([
      ["message", "ok"],
      ["signature", "ok"],
      ["local", "ok"],
      ["onchain", "ok"],
    ]);
    expect(run.steps[0].text).toBe("nonce 0, matches transferDigest()");
    expect(run.signed?.signature).toBe(SIG);
    expect(chain.sent).toHaveLength(0);
  });

  test("sending needs a browser wallet", async () => {
    await twoKeys();
    await store.act("alice", false);
    expect(s().alice.error).toMatch(/Connect a browser wallet/);
    expect(s().runs.alice).toBeNull();
  });

  test("refuses to sign more than the account holds", async () => {
    await twoKeys();
    await store.connectProvider(chain.discovered as never);
    store.setBob({ amount: "1" });
    await store.act("bob", false);
    const m = s().runs.bob!.steps[0];
    expect(m.state).toBe("fail");
    expect(m.text).toBe(`Bob holds 0 ${LEDGER_SYMBOL}, less than the 1.0015 ${LEDGER_SYMBOL} this spends.`);
    expect(vi.mocked(signerClient.sign)).not.toHaveBeenCalledWith(s().keys.bob.seed, expect.anything(), expect.anything());
  });

  test("Alice deposits and sends in one legacy transaction and the memo comes back", async () => {
    await twoKeys();
    await store.connectProvider(chain.discovered as never);
    chain.setMemo(s().alice.memo);
    await store.act("alice", false);
    const run = s().runs.alice!;
    expect(run.steps.every((x) => x.state === "ok")).toBe(true);
    expect(chain.sent).toHaveLength(1);
    expect(chain.sent[0].value).toBe(10n ** 16n);
    expect(run.receipt?.memo).toBe("The first payment using a quantum-secure signature on Ethereum Classic, by Classix.dev");
    expect(run.receipt?.href).toMatch(/^https:\/\/etc\.blockscout\.com\/tx\/0x7777/);
    expect(s().busy).toBeNull();
  });

  test("a failing verifier stops before anything is sent", async () => {
    const { verifyOnChain } = await import("./chain");
    vi.mocked(verifyOnChain).mockResolvedValueOnce(false);
    await twoKeys();
    await store.connectProvider(chain.discovered as never);
    await store.act("alice", false);
    const st = Object.fromEntries(s().runs.alice!.steps.map((x) => [x.id, x.state]));
    expect(st).toMatchObject({ message: "ok", signature: "ok", local: "ok", onchain: "fail", simulate: "idle", sent: "idle" });
    expect(chain.sent).toHaveLength(0);
  });
});
