import { act as reactAct, fireEvent, render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { App } from "./App";
import { LEDGER_SYMBOL } from "./generated/contracts";
import { randomSeed } from "./key";
import { accountOf } from "./ledger";
import { __reset, __setState, getState, initialState, STEPS, type Run, type Slot } from "./store";
import { keyFor, RELAYER } from "./test/fakes";

beforeEach(() => __reset());

function haveKey(balance: bigint): Slot {
  const seed = randomSeed();
  const k = keyFor(seed);
  return { ...initialState().keys.alice, view: "have", seed, key: k, account: accountOf(k.pkSeed, k.pkRoot), balance, nonce: 0n };
}

function run(states: Partial<Record<string, ["idle" | "run" | "ok" | "fail", string?, number?]>>, extra: Partial<Run> = {}): Run {
  return {
    kind: "transfer",
    signOnly: false,
    steps: STEPS.map(([id, label]) => {
      const [state = "idle", text, progress] = states[id] ?? [];
      return { id, label, state, text, progress };
    }),
    ...extra,
  };
}

async function noAxeViolations(el: Element) {
  // jsdom can't compute colours, so contrast is left to Lighthouse.
  const r = await axe.run(el, { rules: { "color-contrast": { enabled: false } } });
  expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

describe("empty page", () => {
  test("headline, what it is, the notice, and nothing calls it a wallet", () => {
    render(<App autoStart={false} />);
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.textContent).toBe("Quantum-Safe Payments on Ethereum Classic");
    expect(h1.textContent).not.toMatch(/wallet/i);
    expect(screen.getByTestId("lead").textContent).toMatch(/skinnyCAT moves ETC with a leanSPHINCS signature, which a quantum computer can't forge/);
    expect(screen.getByTestId("disclaimer").textContent).toMatch(/educational demo, not a production app. It isn't audited, so use tiny amounts/i);
    for (const name of ["Two Cats, Two Keys", "Browser Wallet", "Alice Deposits and Pays Bob", "Bob Pays Back Without ETC", "How It Works", "Frame Transactions Instead of Meta-Transactions", "Current Limitations", "The Spec"])
      expect(screen.getByRole("heading", { name })).toBeTruthy();
    expect(screen.getByTestId("alice-memo")).toHaveProperty("value", "The first payment using a quantum-safe signature on Ethereum Classic, by Classix.dev");
    expect(screen.getByTestId("alice-go")).toHaveProperty("disabled", true);
    expect(screen.getByTestId("alice-sign-only")).toHaveProperty("disabled", true);
    expect(screen.getByTestId("alice-hint").textContent).toBe("Create or import Alice's key first.");
    expect(document.body.textContent).not.toMatch(/mordor|metc/i);
  });

  test("links the EIPs, the spec commit, Classix and the repo", () => {
    render(<App autoStart={false} />);
    const hrefs = [...document.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(
      expect.arrayContaining([
        "https://eips.ethereum.org/EIPS/eip-8141",
        "https://eips.ethereum.org/EIPS/eip-8288",
        "https://github.com/ethereum/EthLib/commit/dce7a2de23a973d84eac38126a1527763cd3465d",
        "https://classix.dev",
        "https://github.com/classix-dev/skinnyCAT",
      ]),
    );
    for (const a of document.querySelectorAll('a[target="_blank"]')) expect(a.getAttribute("rel")).toBe("noopener noreferrer");
  });

  test("the diagram reads as sixteen numbered sentences", () => {
    render(<App autoStart={false} />);
    const fig = screen.getByTestId("how");
    const items = within(fig).getAllByRole("listitem");
    expect(items).toHaveLength(16);
    expect(items[1].querySelector(".sr-only")?.textContent).toBe(`Alice's browser wallet to ${LEDGER_SYMBOL}: transfer, with 1 ETC attached.`);
    expect(items[11].querySelector(".sr-only")?.textContent).toBe(`${LEDGER_SYMBOL} to Relayer: pays the 0.001 ETC fee.`);
    expect(items[15].querySelector(".sr-only")?.textContent).toBe(`${LEDGER_SYMBOL} to Bob's fresh address: sends 0.2 ETC.`);
  });

  test("the comparison table has what stays the same, then the six differences from the doc", () => {
    render(<App autoStart={false} />);
    const rows = within(screen.getByTestId("frames-table")).getAllByRole("row");
    expect(rows).toHaveLength(9);
    expect(rows[1].textContent).toBe("Bob signs withleanSPHINCSleanSPHINCS");
    expect(rows[5].textContent).toBe("ECDSA in the paththe relayer's key, gas money onlynone");
  });

  test("passes axe", async () => {
    const { container } = render(<App autoStart={false} />);
    await noAxeViolations(container);
  });
});

describe("with keys", () => {
  test("shows both accounts and balances, and enables Sign Only", () => {
    const alice = haveKey(6n * 10n ** 17n);
    const bob = haveKey(0n);
    __setState({ live: true, keys: { alice, bob } });
    render(<App autoStart={false} />);
    expect(screen.getByTestId("alice-balance").textContent).toBe("0.6");
    expect(screen.getByTestId("bob-balance").textContent).toBe("0");
    expect(screen.getByTestId("alice-account").getAttribute("data-value")).toBe(alice.account);
    expect(screen.getByTestId("bob-account").getAttribute("data-value")).toBe(bob.account);
    expect(screen.getAllByRole("link", { name: "Open in explorer" })[0].getAttribute("href")).toBe(`https://etc.blockscout.com/address/${alice.account}`);
    expect(screen.getByTestId("alice-sign-only")).toHaveProperty("disabled", false);
    expect(screen.getByTestId("alice-go")).toHaveProperty("disabled", true);
    expect(screen.getByTestId("alice-hint").textContent).toBe("Connect a browser wallet to send, or use Sign Only.");
    expect(screen.getByTestId("web3-none").textContent).toMatch(/No browser wallet found/);
  });

  test("a fresh key opens its 24-word backup", () => {
    const alice = { ...haveKey(0n), fresh: true };
    __setState({ keys: { alice, bob: initialState().keys.bob } });
    render(<App autoStart={false} />);
    expect(screen.getByTestId("alice-words").querySelectorAll("[data-word]")).toHaveLength(24);
    expect(screen.getByTestId("alice-words").closest("details")?.open).toBe(true);
  });

  test("connected, ready to send, with the relayer's gas cost", async () => {
    __setState({
      live: true,
      keys: { alice: haveKey(0n), bob: haveKey(0n) },
      conn: { info: { uuid: "x", name: "Test Wallet", icon: "", rdns: "x" }, account: RELAYER },
      gasBalance: 2n * 10n ** 18n,
      gasPrice: 4_000_000_000n,
    });
    const { container } = render(<App autoStart={false} />);
    expect(screen.getByTestId("alice-go")).toHaveProperty("disabled", false);
    expect(screen.getByTestId("web3-balance").textContent).toBe("2 ETC");
    expect(screen.getByTestId("bob-gas-hint").textContent).toBe("A relayed send costs about 0.0012 ETC in gas.");
    await noAxeViolations(container);
  });

  test("Bob's withdraw tab asks for an ETC address", () => {
    render(<App autoStart={false} />);
    expect(screen.queryByTestId("bob-withdraw-to")).toBeNull();
    fireEvent.click(screen.getByTestId("bob-kind-withdraw"));
    expect(getState().bob.kind).toBe("withdraw");
    expect(screen.getByTestId("bob-withdraw-to")).toBeTruthy();
    expect(screen.getByTestId("bob-kind-withdraw").getAttribute("aria-checked")).toBe("true");
  });

  test("a key being derived shows its progress", () => {
    __setState({ keys: { alice: { ...initialState().keys.alice, view: "busy", progress: 0.5 }, bob: initialState().keys.bob } });
    render(<App autoStart={false} />);
    expect(screen.getByRole("progressbar", { name: "Deriving Alice's public key" }).getAttribute("aria-valuenow")).toBe("50");
  });

  test("an import error shows next to the phrase", () => {
    __setState({ keys: { alice: initialState().keys.alice, bob: { ...initialState().keys.bob, view: "import", error: "The checksum doesn't match. Check the word order." } } });
    render(<App autoStart={false} />);
    expect(screen.getByTestId("bob-import-error").textContent).toMatch(/checksum/);
    expect(screen.getByTestId("bob-phrase-in").getAttribute("aria-invalid")).toBe("true");
  });
});

describe("runs", () => {
  test("signing in progress", () => {
    __setState({ busy: "alice", runs: { alice: run({ message: ["ok", "nonce 0, matches transferDigest()"], signature: ["run", "signing in a Web Worker", 0.42] }), bob: null } });
    render(<App autoStart={false} />);
    const tl = screen.getByTestId("alice-run");
    expect(within(tl).getByRole("progressbar").getAttribute("aria-valuenow")).toBe("42");
    expect(screen.getByTestId("step-signature").getAttribute("data-state")).toBe("run");
    expect(screen.queryByTestId("step-explorer")).toBeNull();
    expect(screen.getByTestId("alice-sign-only")).toHaveProperty("disabled", true);
  });

  test("insufficient balance fails at the message step", () => {
    __setState({ runs: { alice: null, bob: run({ message: ["fail", `Bob holds 0 ${LEDGER_SYMBOL}, less than the 1.0015 ${LEDGER_SYMBOL} this spends.`] }) } });
    render(<App autoStart={false} />);
    expect(screen.getByTestId("step-message").getAttribute("data-state")).toBe("fail");
    expect(screen.getByTestId("step-message-detail").textContent).toBe(`Bob holds 0 ${LEDGER_SYMBOL}, less than the 1.0015 ${LEDGER_SYMBOL} this spends.`);
  });

  test("a form error replaces the hint", () => {
    __setState({ bob: { ...initialState().bob, error: "The address to withdraw to isn't valid." } });
    render(<App autoStart={false} />);
    expect(within(screen.getByTestId("bob-hint")).getByRole("alert").textContent).toBe("The address to withdraw to isn't valid.");
  });

  test("the receipt shows the memo and links Blockscout", async () => {
    const memo = "The first payment using a quantum-safe signature on Ethereum Classic, by Classix.dev";
    const all = Object.fromEntries(STEPS.map(([id]) => [id, ["ok", id === "explorer" ? "etc.blockscout.com" : "done"]])) as never;
    const r = run(all, { receipt: { memo, href: "https://etc.blockscout.com/tx/0xabc", fee: null } });
    r.steps = r.steps.map((x) => (x.id === "explorer" ? { ...x, href: "https://etc.blockscout.com/tx/0xabc" } : x));
    __setState({ runs: { alice: r, bob: null } });
    const { container } = render(<App autoStart={false} />);
    expect(screen.getByTestId("alice-run-memo-text").textContent).toBe(memo);
    expect(within(screen.getByTestId("alice-run-memo")).getByRole("link").getAttribute("href")).toBe("https://etc.blockscout.com/tx/0xabc");
    expect(within(screen.getByTestId("step-explorer")).getByRole("link").getAttribute("href")).toBe("https://etc.blockscout.com/tx/0xabc");
    await noAxeViolations(container);
  });

  test("Sign Only shows four steps and offers the signature", () => {
    const r: Run = {
      kind: "transfer",
      signOnly: true,
      steps: STEPS.slice(0, 4).map(([id, label]) => ({ id, label, state: "ok" })),
      signed: { digest: "0x01", signature: "0x02" },
    };
    __setState({ runs: { alice: null, bob: r } });
    render(<App autoStart={false} />);
    expect(within(screen.getByTestId("bob-run")).getAllByRole("listitem")).toHaveLength(4);
    expect(screen.getByTestId("bob-run-signed").textContent).toMatch(/nothing sent/);
  });
});

describe("pre-rendering", () => {
  test("hydrates the server HTML without a mismatch", async () => {
    const html = renderToString(<App autoStart={false} />);
    expect(html).not.toMatch(/mordor|metc/i);
    const el = document.createElement("div");
    el.innerHTML = html;
    document.body.appendChild(el);
    const onRecoverableError = vi.fn();
    let root!: ReturnType<typeof hydrateRoot>;
    await reactAct(async () => {
      root = hydrateRoot(el, <App autoStart={false} />, { onRecoverableError });
    });
    expect(onRecoverableError).not.toHaveBeenCalled();
    // The browser state arrives after hydration and renders normally.
    await reactAct(async () => __setState({ live: true, keys: { alice: haveKey(10n ** 18n), bob: initialState().keys.bob } }));
    expect(el.querySelector('[data-testid="alice-balance"]')?.textContent).toBe("1");
    await reactAct(async () => root.unmount());
    el.remove();
  });
});

describe("skinnyCAT", () => {
  test("the name, and no hypertree jargon outside the explainer", () => {
    render(<App autoStart={false} />);
    expect(screen.getByTestId("wordmark").textContent).toBe("skinnyCAT");
    expect(screen.getByRole("link", { name: "skinnyCAT home" })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/hypertree/i);
  });

  test("a cat wakes when it has a key, and the art stays out of the accessibility tree", () => {
    __setState({ keys: { alice: haveKey(0n), bob: initialState().keys.bob } });
    render(<App autoStart={false} />);
    expect(screen.getByTestId("alice-avatar").dataset.awake).toBe("1");
    expect(screen.getByTestId("bob-avatar").dataset.awake).toBeUndefined();
    for (const svg of document.querySelectorAll("svg")) {
      const labelled = svg.closest("[role=img][aria-label], figure[aria-labelledby], figure[aria-label], figure[aria-describedby]");
      expect(svg.closest('[aria-hidden="true"]') || labelled, svg.outerHTML.slice(0, 120)).toBeTruthy();
    }
  });

  test("no stage before signing starts, or when the message is refused before signing", () => {
    __setState({ runs: { alice: run({ message: ["run"] }), bob: run({ message: ["fail", "Bob holds 0"] }) } });
    render(<App autoStart={false} />);
    expect(screen.queryByTestId("alice-run-stage")).toBeNull();
    expect(screen.queryByTestId("bob-run-stage")).toBeNull();
  });

  test("while signing, the cat climbs as far as the signature has got", () => {
    __setState({ busy: "alice", runs: { alice: run({ message: ["ok"], signature: ["run", "signing", 0.5] }), bob: null } });
    render(<App autoStart={false} />);
    const stage = screen.getByTestId("alice-run-stage");
    expect(stage.dataset.scene).toBe("climb");
    expect(within(stage).getByRole("status").textContent).toMatch(/cat climbs along/);
    // The hero tree's cat is part way up too.
    const climbers = document.querySelectorAll<SVGGElement>('[data-testid="climber"]');
    expect(climbers.length).toBe(2);
    for (const c of climbers) expect(c.getAttribute("style")).toMatch(/translate\(/);
  });

  test("verifying puts the signature in the box", () => {
    __setState({ runs: { alice: run({ message: ["ok"], signature: ["ok"], local: ["run"] }), bob: null } });
    render(<App autoStart={false} />);
    expect(screen.getByTestId("alice-run-stage").dataset.scene).toBe("verify");
  });

  test("a valid signature opens the box and the cat jumps out", async () => {
    __setState({ runs: { alice: null, bob: run({ message: ["ok"], signature: ["ok"], local: ["ok"], onchain: ["ok"], simulate: ["run"] }) } });
    const { container } = render(<App autoStart={false} />);
    const stage = screen.getByTestId("bob-run-stage");
    expect(stage.dataset.scene).toBe("open");
    expect(within(stage).getByRole("status").textContent).toBe("Valid. The box opens and the cat jumps out.");
    expect(within(stage).getByTestId("box-cat")).toBeTruthy();
    await noAxeViolations(container);
  });

  test("an invalid signature leaves the box shut, with no cat", () => {
    __setState({ runs: { alice: run({ message: ["ok"], signature: ["ok"], local: ["ok"], onchain: ["fail", "the verifier returned false"] }), bob: null } });
    render(<App autoStart={false} />);
    const stage = screen.getByTestId("alice-run-stage");
    expect(stage.dataset.scene).toBe("shut");
    expect(within(stage).getByRole("status").textContent).toBe("Not valid, so the box stays shut.");
    expect(within(stage).queryByTestId("box-cat")).toBeNull();
  });

  test("a relayer that changes the note gets a BadSignature revert, and the box shuts", () => {
    const r = run({ message: ["ok"], signature: ["ok"], local: ["ok"], onchain: ["ok"], simulate: ["ok"], sent: ["ok"], confirmed: ["fail", "The transaction reverted with BadSignature()."] });
    __setState({ runs: { alice: null, bob: r } });
    render(<App autoStart={false} />);
    expect(screen.getByTestId("bob-run-stage").dataset.scene).toBe("shut");
    expect(within(screen.getByTestId("bob-run-stage")).getByRole("status").textContent).toMatch(/changed on the way.*box stays shut/);
  });

  test("a send that fails for another reason keeps the box open, since the signature was fine", () => {
    const r = run({ message: ["ok"], signature: ["ok"], local: ["ok"], onchain: ["ok"], simulate: ["ok"], sent: ["fail", "User rejected the request."] });
    __setState({ runs: { alice: null, bob: r } });
    render(<App autoStart={false} />);
    expect(screen.getByTestId("bob-run-stage").dataset.scene).toBe("open");
  });

  test("errors come with a startled cat that is decorative only", () => {
    __setState({ bob: { ...initialState().bob, error: "The address to withdraw to isn't valid." } });
    render(<App autoStart={false} />);
    const alert = within(screen.getByTestId("bob-hint")).getByRole("alert");
    expect(alert.querySelector('svg[aria-hidden="true"]')).toBeTruthy();
    expect(alert.textContent).toBe("The address to withdraw to isn't valid.");
  });
});
