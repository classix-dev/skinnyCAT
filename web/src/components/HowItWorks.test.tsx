import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { LEDGER_SYMBOL } from "../generated/contracts";
import { HowItWorks } from "./HowItWorks";
import { balancesAfter, DWELL_MS, PHASES, runMs, sentence, STEPS } from "./howData";
import { done, ended, initial, LAST, reduce, type Action, type Player } from "./howPlayer";

const run = (s: Player, ...as: Action["type"][]) => as.reduce((x, type) => reduce(x, { type } as Action), s);

describe("the story", () => {
  test("has sixteen messages in three phases, and the cat does something sensible at each", () => {
    expect(PHASES.map((p) => p.msgs.length)).toEqual([6, 6, 4]);
    expect(STEPS.map((s) => s.n)).toEqual([...Array(16)].map((_, i) => i + 1));
    for (const s of STEPS) {
      const inPlace = ["sign", "credit", "stamp"].includes(s.carry);
      expect(inPlace, `step ${s.n}`).toBe(s.from === s.to);
      expect(s.caption, `step ${s.n}`).not.toMatch(/[—;]/);
    }
    // Value moves where value moves, and verdicts come back from the verifier.
    expect(STEPS.filter((s) => s.style === "pay").map((s) => s.carry)).toEqual(["fee", "eth"]);
    expect(STEPS.filter((s) => s.style === "reply").every((s) => s.carry === "check")).toBe(true);
  });

  test("balances follow test/LeanSphincsLedger.t.sol", () => {
    expect(balancesAfter(0)).toEqual({ alice: 0, bob: 0, relayer: 0, fresh: 0 });
    expect(balancesAfter(2)).toEqual({ alice: 0, bob: 0, relayer: 0, fresh: 0 });
    expect(balancesAfter(3)).toEqual({ alice: 1000, bob: 0, relayer: 0, fresh: 0 });
    expect(balancesAfter(6)).toEqual({ alice: 600, bob: 400, relayer: 0, fresh: 0 });
    expect(balancesAfter(12)).toEqual({ alice: 700, bob: 299, relayer: 1, fresh: 0 });
    expect(balancesAfter(16)).toEqual({ alice: 700, bob: 98, relayer: 2, fresh: 200 });
    // Supply is what went in less what came out: 1 ETC in, two fees and 0.2 out.
    const end = balancesAfter(16);
    expect(end.alice + end.bob).toBe(1000 - end.relayer - end.fresh);
  });
});

describe("the player", () => {
  test("plays step by step: run, arrive, advance", () => {
    let s = run(initial, "play");
    expect(s).toMatchObject({ step: 1, arrived: false, playing: true, started: true });
    s = run(s, "advance");
    expect(s.step).toBe(1); // not before the cat arrives
    s = run(s, "arrive", "advance");
    expect(s).toMatchObject({ step: 2, arrived: false, playing: true });
    expect(done(s)).toBe(1);
  });

  test("stops at the end, and play starts over", () => {
    let s = run(initial, "play");
    for (let i = 1; i < LAST; i++) s = run(s, "arrive", "advance");
    expect(s.step).toBe(LAST);
    s = run(s, "arrive");
    expect(s.playing).toBe(false);
    expect(ended(s)).toBe(true);
    expect(run(s, "advance")).toBe(s);
    expect(run(s, "play")).toMatchObject({ step: 1, playing: true, arrived: false });
  });

  test("next and previous pause, stay in bounds and replay the step's run", () => {
    let s = run(initial, "play", "next");
    expect(s).toMatchObject({ step: 2, playing: false, arrived: false });
    const r = s.run;
    s = run(s, "prev");
    expect(s).toMatchObject({ step: 1, arrived: false });
    expect(s.run).toBe(r + 1);
    expect(run(s, "prev").step).toBe(1);
    for (let i = 0; i < 20; i++) s = run(s, "next");
    expect(s.step).toBe(LAST);
  });

  test("pause, speed, replay", () => {
    let s = run(initial, "play", "pause");
    expect(s.playing).toBe(false);
    s = run(s, "speed");
    expect(s.fast).toBe(true);
    s = run(s, "next", "next", "replay");
    expect(s).toMatchObject({ step: 1, playing: true, fast: true });
  });

  test("autoplays only once", () => {
    let s = run(initial, "autoplay");
    expect(s.playing).toBe(true);
    s = run(s, "pause", "autoplay");
    expect(s.playing).toBe(false);
  });

  test("with reduced motion it never plays, and the cat is already where it ends up", () => {
    let s = reduce(initial, { type: "motion", reduced: true });
    expect(run(s, "autoplay")).toEqual(s);
    expect(run(s, "play")).toEqual(s);
    s = run(s, "next");
    expect(s).toMatchObject({ step: 1, arrived: true, playing: false });
    s = run(s, "next", "next", "replay");
    expect(s).toMatchObject({ step: 1, arrived: true, playing: false });
    // Turning reduced motion on mid-run stops it.
    expect(reduce(run(initial, "play"), { type: "motion", reduced: true })).toMatchObject({ playing: false, arrived: true });
  });
});

// ---------------------------------------------------------------------------
// The component, with a controllable IntersectionObserver and reduced-motion query.
// ---------------------------------------------------------------------------

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
// In slices, so React commits and schedules the next timer between them, as it would in a browser.
const tick = (ms: number) => {
  for (let t = 0; t < ms; t += 50) act(() => void vi.advanceTimersByTime(Math.min(50, ms - t)));
};
const caption = () => screen.getByTestId("how-caption");
const fig = () => screen.getByTestId("how-figure");
const chip = (k: string) => screen.getAllByTestId(`how-bal-${k}`)[0].getAttribute("data-value");

describe("How It Works", () => {
  test("waits at rest until it scrolls into view, then autoplays with the cat", () => {
    render(<HowItWorks />);
    expect(fig().dataset.step).toBe("0");
    expect(screen.queryAllByTestId("how-cat")).toHaveLength(0);
    tick(10_000);
    expect(fig().dataset.step).toBe("0");

    scrollIntoView();
    expect(fig().dataset.playing).toBe("1");
    expect(caption().textContent).toContain(STEPS[0].caption);
    expect(caption().getAttribute("aria-live")).toBe("polite");
    expect(screen.getByTestId("how-step-1").dataset.status).toBe("active");
    expect(screen.getAllByTestId("how-cat")[0].dataset.mode).toBe("act");
    expect(screen.getByTestId("how-phase-1").dataset.on).toBe("1");

    tick(runMs(STEPS[0]) + DWELL_MS);
    expect(fig().dataset.step).toBe("2");
    const cat = screen.getAllByTestId("how-cat")[0];
    expect(cat.dataset.mode).toBe("run");
    expect(cat.dataset.carry).toBe("deposit");
    expect(screen.getByTestId("how-step-1").dataset.status).toBe("past");
  });

  test("balances change when the cat arrives, not when it sets off", () => {
    render(<HowItWorks />);
    scrollIntoView();
    for (let i = 0; i < 200 && fig().dataset.step !== "3"; i++) tick(50);
    expect(fig().dataset.step).toBe("3");
    expect(chip("alice")).toBe("0");
    tick(runMs(STEPS[2]) + 100);
    expect(chip("alice")).toBe("1");
    // Play the rest at double speed.
    fireEvent.click(screen.getByTestId("how-speed"));
    expect(screen.getByTestId("how-speed").getAttribute("aria-pressed")).toBe("true");
    tick(60_000);
    expect(fig().dataset.step).toBe("16");
    expect(fig().dataset.playing).toBe("0");
    expect([chip("alice"), chip("bob"), chip("relayer"), chip("fresh")]).toEqual(["0.7", "0.098", "0.002", "0.2"]);
    expect(screen.getByTestId("how-play").getAttribute("aria-label")).toBe("Play again from step 1");
  });

  test("holds between steps while scrolled away", () => {
    render(<HowItWorks />);
    scrollIntoView();
    scrollIntoView(false);
    tick(20_000);
    expect(fig().dataset.step).toBe("1");
    scrollIntoView();
    tick(DWELL_MS);
    expect(fig().dataset.step).toBe("2");
  });

  test("the controls are labelled buttons that step, pause and replay", () => {
    render(<HowItWorks />);
    const player = screen.getByRole("group", { name: "Diagram player" });
    const names = within(player)
      .getAllByRole("button")
      .map((b) => b.getAttribute("aria-label"));
    expect(names).toEqual(["Previous step", "Play", "Next step", "Replay from step 1", "Double speed"]);

    fireEvent.click(screen.getByRole("button", { name: "Next step" }));
    expect(caption().textContent).toContain(STEPS[0].caption);
    fireEvent.click(screen.getByRole("button", { name: "Next step" }));
    expect(caption().textContent).toContain(STEPS[1].caption);
    expect(caption().textContent).toContain("Step 2 of 16.");
    fireEvent.click(screen.getByRole("button", { name: "Previous step" }));
    expect(caption().textContent).toContain(STEPS[0].caption);
    expect(screen.getByRole("button", { name: "Previous step" }).getAttribute("aria-disabled")).toBe("true");
    expect(fig().dataset.playing).toBe("0");

    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(fig().dataset.playing).toBe("1");
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(fig().dataset.playing).toBe("0");
    tick(10_000);
    expect(fig().dataset.step).toBe("1");

    fireEvent.click(screen.getByRole("button", { name: "Replay from step 1" }));
    expect(fig().dataset.step).toBe("1");
    expect(fig().dataset.playing).toBe("1");
  });

  test("with reduced motion there is no autoplay, no play button, and the cat stands at the step", () => {
    reducedMotion = true;
    render(<HowItWorks />);
    scrollIntoView();
    tick(10_000);
    expect(fig().dataset.step).toBe("0");
    expect(fig().dataset.reduced).toBe("1");
    expect(screen.queryByTestId("how-play")).toBeNull();
    expect(screen.queryByTestId("how-speed")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Next step" }));
    fireEvent.click(screen.getByRole("button", { name: "Next step" }));
    expect(caption().textContent).toContain(STEPS[1].caption);
    expect(fig().dataset.arrived).toBe("1");
    for (const c of screen.getAllByTestId("how-cat")) expect(c.dataset.mode).toBe("stand");
    expect(document.querySelector(".how-run-r, .how-run-l, .how-lit, .how-gallop, .how-act, .how-ping")).toBeNull();
    for (let i = 0; i < 4; i++) fireEvent.click(screen.getByRole("button", { name: "Next step" }));
    expect(chip("alice")).toBe("0.6");
    fireEvent.click(screen.getByRole("button", { name: "Back to step 1" }));
    expect(fig().dataset.step).toBe("1");
  });

  test("pre-renders the whole diagram at rest and hydrates without a mismatch", () => {
    vi.useRealTimers();
    const html = renderToString(<HowItWorks />);
    for (const s of STEPS) expect(html.replace(/&#x27;/g, "'")).toContain(sentence(s).replace(/&/g, "&amp;"));
    expect(html).not.toContain('data-testid="how-cat"');
    expect(html).toContain("Sixteen steps.");
    expect(html).toContain(`2×`);

    const box = document.createElement("div");
    box.innerHTML = html;
    document.body.append(box);
    act(() => void hydrateRoot(box, <HowItWorks />));
    // setup.ts fails the test on any console.error, hydration warnings included.
    expect(within(box).getAllByRole("listitem")).toHaveLength(16);
    expect(within(box).getByText(`${LEDGER_SYMBOL} to Relayer: pays the 0.001 ETC fee.`)).toBeTruthy();
    box.remove();
  });
});
