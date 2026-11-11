import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { Aggregation } from "./Aggregation";
import { AGG_DWELL_MS, AGG_GAS, AGG_LAST, AGG_RUN_MS, AGG_STEPS, CALLDATA_GAS, SIG_BYTES, SIGS, TODAY_GAS, VERIFY_GAS } from "./aggData";
import { endedAt, initial, reducer, type Action, type Player } from "./howPlayer";

// The numbers and quotes below are from docs/aggregation.md.

describe("the numbers", () => {
  test("are the doc's, and the sums follow from them", () => {
    expect(SIG_BYTES).toBe(7_740);
    expect(CALLDATA_GAS).toBe(123_000);
    expect(VERIFY_GAS).toBe(86_000);
    expect(TODAY_GAS).toBe(209_000);
    expect(AGG_GAS).toBe(33_000);
    expect(AGG_STEPS).toHaveLength(5);
    expect(AGG_RUN_MS).toHaveLength(AGG_LAST);
    for (const s of AGG_STEPS) expect(s.caption, `step ${s.n}`).not.toMatch(/[—;:]/);
  });

  test("the player reducer works for five steps", () => {
    const reduce = reducer(AGG_LAST);
    const run = (s: Player, ...as: Action["type"][]) => as.reduce((x, type) => reduce(x, { type } as Action), s);
    let s = run(initial, "play");
    for (let i = 1; i < AGG_LAST; i++) s = run(s, "arrive", "advance");
    s = run(s, "arrive");
    expect(s).toMatchObject({ step: 5, playing: false });
    expect(endedAt(s, AGG_LAST)).toBe(true);
    expect(run(s, "next").step).toBe(5);
  });
});

let observers: { cb: IntersectionObserverCallback; el?: Element }[] = [];
let reducedMotion = false;

beforeEach(() => {
  observers = [];
  reducedMotion = false;
  vi.useFakeTimers();
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      o: { cb: IntersectionObserverCallback; el?: Element };
      constructor(cb: IntersectionObserverCallback) {
        this.o = { cb };
        observers.push(this.o);
      }
      observe(el: Element) {
        this.o.el = el;
      }
      disconnect() {}
      unobserve() {}
      takeRecords() {
        return [];
      }
    },
  );
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: q.includes("reduce") && reducedMotion,
    media: q,
    addEventListener() {},
    removeEventListener() {},
  }));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function scrollIntoView(visible = true) {
  act(() => {
    for (const o of observers) o.cb([{ isIntersecting: visible, target: o.el } as IntersectionObserverEntry], {} as IntersectionObserver);
  });
}
const tick = (ms: number) => {
  for (let t = 0; t < ms; t += 50) act(() => void vi.advanceTimersByTime(Math.min(50, ms - t)));
};
const fig = () => screen.getByTestId("agg-figure");
const caption = () => screen.getByTestId("agg-caption");
const actor = (id: string, layout = "wide") => screen.getByTestId(`agg-stage-${layout}`).querySelector(`[data-actor="${id}"]`) as SVGGElement;

describe("Aggregation", () => {
  test("gives the doc's numbers and links", () => {
    render(<Aggregation />);
    const sec = screen.getByTestId("agg");
    expect(sec.id).toBe("aggregation");
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Aggregation");
    const text = sec.textContent!;
    for (const s of [
      "7,740 B",
      "≈123,000",
      "≈86,000",
      "≈33,000",
      "keeps signatures off chain and puts one proof in each block",
    ])
      expect(text).toContain(s);
    const links = [...sec.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(links).toContain("https://eips.ethereum.org/EIPS/eip-8288");
    for (const a of sec.querySelectorAll('a[target="_blank"]')) expect(a.getAttribute("rel")).toBe("noopener noreferrer");
    // The headings are in Title Case, and the prose has no em dashes or semicolons.
    expect([...sec.querySelectorAll("h3")].map((h) => h.textContent)).toEqual(["What ETC Can Do"]);
    expect(text).not.toMatch(/[—;]/);
  });

  test("lists what ETC can do, with and without a fork", () => {
    render(<Aggregation />);
    const items = within(screen.getByTestId("agg-options")).getAllByRole("listitem");
    expect(items.map((i) => i.dataset.fork)).toEqual(["1", "0", "0", "0", "0"]);
    const all = items.map((i) => i.textContent).join(" ");
    expect(all).toContain("Merkle root");
    expect(all).toContain("Saves 21,000 gas each");
    expect(all).toContain("128 to 512 KB");
    expect(all).toContain("8 million gas block");
    expect(all).toContain("elliptic curves");
    expect(items[4].textContent).toContain("ruled out");
  });

  test("the tally multiplies the doc's per-signature numbers by six", () => {
    render(<Aggregation />);
    const gas = screen.getAllByTestId("agg-gas").map((e) => e.textContent);
    expect(gas).toEqual([`≈${(SIGS * 209_000).toLocaleString("en-US")} gas`, `≈${(SIGS * 33_000).toLocaleString("en-US")} gas`]);
    expect(screen.getByTestId("agg-tally").textContent).toContain("46,440 bytes of signatures in calldata");
  });

  test("lists the five steps of EIP-8288", () => {
    render(<Aggregation />);
    const items = within(screen.getByTestId("agg-steps")).getAllByRole("listitem");
    expect(items).toHaveLength(5);
    expect(items[0].textContent).toContain("dependency frame");
    expect(items[0].textContent).toContain("0x10");
    expect(items[2].textContent).toContain("Every second");
    expect(items[3].textContent).toContain("block header");
    expect(items[4].textContent).toContain("No signature appears on chain.");
  });

  test("shows the end at rest, then autoplays from step 1 once in view", () => {
    render(<Aggregation />);
    expect(fig().dataset.step).toBe("0");
    // At rest, the picture is the end of step 5: the proof in the header, the box open.
    expect(actor("header-proof").style.opacity).toBe("1");
    expect(actor("valid").style.opacity).toBe("1");
    expect(actor("sig-0").style.opacity).toBe("0.3");
    expect(document.querySelector(".agg-go")).toBeNull();
    tick(10_000);
    expect(fig().dataset.step).toBe("0");

    scrollIntoView();
    expect(fig().dataset).toMatchObject({ step: "1", playing: "1", arrived: "0" });
    expect(caption().textContent).toContain("Step 1 of 5.");
    expect(caption().getAttribute("aria-live")).toBe("polite");
    // Step 1: the envelopes and scrolls appear at the users, animated from nothing.
    expect(actor("env-0").classList.contains("agg-go")).toBe(true);
    expect(actor("env-0").style.getPropertyValue("--agg-fo")).toBe("0");
    // The proof isn't in the block yet, so it isn't drawn at all.
    expect(actor("header-proof")).toBeNull();
    tick(AGG_RUN_MS[0]);
    expect(fig().dataset.arrived).toBe("1");
    expect(actor("env-0").classList.contains("agg-go")).toBe(false);
    tick(AGG_DWELL_MS);
    expect(fig().dataset.step).toBe("2");

    // On to the end, and it stops there.
    tick(20_000);
    expect(fig().dataset).toMatchObject({ step: "5", playing: "0", arrived: "1" });
    expect(screen.getByTestId("agg-step-5").dataset.status).toBe("active");
    expect(screen.getByTestId("agg-play").getAttribute("aria-label")).toBe("Play again from step 1");
  });

  test("the builder cat runs only while it carries the proof", () => {
    render(<Aggregation />);
    const cat = () => screen.getAllByTestId("agg-cat")[0].querySelector('[data-testid="how-cat"]') as SVGElement;
    expect(cat().dataset.mode).toBe("stand");
    for (let i = 0; i < 4; i++) fireEvent.click(screen.getByRole("button", { name: "Next step" }));
    expect(fig().dataset.step).toBe("4");
    expect(cat().dataset).toMatchObject({ mode: "run", carry: "proof" });
    tick(AGG_RUN_MS[3]);
    expect(cat().dataset.mode).toBe("stand");
    expect(cat().dataset.carry).toBeUndefined();
  });

  test("the controls step, pause and replay, and the merged proof counts six", () => {
    render(<Aggregation />);
    const names = within(screen.getByRole("group", { name: "Diagram player" }))
      .getAllByRole("button")
      .map((b) => b.getAttribute("aria-label"));
    expect(names).toEqual(["Previous step", "Play", "Next step", "Replay from step 1", "Double speed"]);
    const next = () => fireEvent.click(screen.getByRole("button", { name: "Next step" }));
    next();
    next();
    next();
    expect(caption().textContent).toContain(AGG_STEPS[2].caption);
    expect(actor("gem-0").textContent).toBe(`×${SIGS / 2}`);
    tick(AGG_RUN_MS[2]);
    expect(actor("gem-0").textContent).toBe(`×${SIGS}`);
    fireEvent.click(screen.getByRole("button", { name: "Previous step" }));
    expect(caption().textContent).toContain(AGG_STEPS[1].caption);
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(fig().dataset.playing).toBe("1");
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    tick(10_000);
    expect(fig().dataset.step).toBe("2");
    fireEvent.click(screen.getByRole("button", { name: "Replay from step 1" }));
    expect(fig().dataset).toMatchObject({ step: "1", playing: "1" });
  });

  test("with reduced motion it holds the end still and steps without animating", () => {
    reducedMotion = true;
    render(<Aggregation />);
    scrollIntoView();
    tick(10_000);
    expect(fig().dataset).toMatchObject({ step: "0", reduced: "1" });
    expect(screen.queryByTestId("agg-play")).toBeNull();
    expect(screen.queryByTestId("agg-speed")).toBeNull();
    expect(actor("header-proof").style.opacity).toBe("1");
    for (let i = 0; i < 2; i++) fireEvent.click(screen.getByRole("button", { name: "Next step" }));
    expect(fig().dataset).toMatchObject({ step: "2", arrived: "1" });
    expect(caption().textContent).toContain(AGG_STEPS[1].caption);
    expect(document.querySelector(".agg-go, .agg-tick, .agg-bar")).toBeNull();
    // Step 2 ends with the transactions in the mempool and nothing in the block yet.
    expect(actor("sig-0").style.opacity).toBe("1");
    expect(actor("header-proof")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Back to step 1" }));
    expect(fig().dataset.step).toBe("1");
  });

  test("pre-renders the end frame and the text, and hydrates without a mismatch", () => {
    vi.useRealTimers();
    const html = renderToString(<Aggregation />);
    const plain = html.replace(/&#x27;/g, "'");
    for (const s of AGG_STEPS) expect(plain).toContain(s.caption);
    expect(plain).toContain('id="aggregation"');
    expect(plain).toContain("Five steps, shown here at the end.");
    expect(plain).toContain("1 proof");
    expect(html).not.toContain("agg-go");
    expect(html).toContain('data-testid="agg-stage-wide"');
    expect(html).toContain('data-testid="agg-stage-tall"');

    const box = document.createElement("div");
    box.innerHTML = html;
    document.body.append(box);
    act(() => void hydrateRoot(box, <Aggregation />));
    // setup.ts fails the test on any console.error, hydration warnings included.
    expect(within(box).getAllByRole("listitem").length).toBeGreaterThanOrEqual(10);
    box.remove();
  });
});
