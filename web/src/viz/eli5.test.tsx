// The explainer's toggle, the ELI5 scenes' step controls and reduced motion, in jsdom.
//
// IntersectionObserver never fires here, so nothing autoplays and the detailed scenes stay as their
// server-rendered text, and requestAnimationFrame is a no-op, so time only moves when a test
// steps it.
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SCENES } from "./copy";
import { ELI5_SCENES, MODES, realAnchor, UI } from "./eli5/copy";
import BlenderScene from "./eli5/scenes/BlenderScene";
import StairsScene from "./eli5/scenes/StairsScene";
import { Explainer } from "./index";
import { MODE_KEY, modeFromHash, REAL_SCENE_IDS } from "./mode";

let reduced = false;

beforeEach(() => {
  reduced = false;
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal("requestAnimationFrame", () => 0);
  vi.stubGlobal("cancelAnimationFrame", () => {});
  window.matchMedia = ((q: string) => ({
    matches: reduced && q.includes("reduce"),
    media: q,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia;
  history.replaceState(null, "", "/");
});
afterEach(() => {
  vi.unstubAllGlobals();
  history.replaceState(null, "", "/");
});

const mode = () => screen.getByTestId("explainer").getAttribute("data-mode");
const toggle = (m: keyof typeof MODES) => screen.getByRole("button", { name: MODES[m] });

describe("the toggle", () => {
  it("opens on Like I'm Five with every ELI5 scene and none of the detailed ones", () => {
    render(<Explainer />);
    expect(mode()).toBe("eli5");
    expect(toggle("eli5").getAttribute("aria-pressed")).toBe("true");
    expect(toggle("real").getAttribute("aria-pressed")).toBe("false");
    expect(screen.getAllByTestId("eli5-scene")).toHaveLength(ELI5_SCENES.length);
    for (const s of ELI5_SCENES) expect(screen.getByRole("heading", { name: s.title })).toBeTruthy();
    expect(screen.queryByTestId("sphincs-explainer")).toBeNull();
  });

  it("loads the real thing on demand, remembers it, and comes back", async () => {
    const { unmount } = render(<Explainer />);
    fireEvent.click(toggle("real"));
    expect(mode()).toBe("real");
    expect(await screen.findByTestId("sphincs-explainer")).toBeTruthy();
    expect(screen.queryByTestId("eli5-explainer")).toBeNull();
    expect(localStorage.getItem(MODE_KEY)).toBe("real");
    for (const s of SCENES) expect(screen.getByRole("heading", { name: s.title })).toBeTruthy();
    unmount();

    // A new visit opens on the stored choice, after hydration.
    render(<Explainer />);
    expect(mode()).toBe("real");
    await screen.findByTestId("sphincs-explainer");
    fireEvent.click(screen.getByRole("button", { name: UI.toEli5 }));
    expect(mode()).toBe("eli5");
    expect(localStorage.getItem(MODE_KEY)).toBe("eli5");
  });

  it("opens the real thing for a link to a detailed scene", async () => {
    history.replaceState(null, "", "/#how-merkle");
    render(<Explainer />);
    expect(mode()).toBe("real");
    await screen.findByTestId("sphincs-explainer");
    expect(document.getElementById("how-merkle")).toBeTruthy();
  });

  it("follows 'see it for real' to the matching detailed scene", async () => {
    render(<Explainer />);
    const stairs = document.getElementById("eli5-stairs")!;
    fireEvent.click(within(stairs).getByRole("link", { name: new RegExp(UI.seeReal) }));
    expect(mode()).toBe("real");
    expect(location.hash).toBe("#how-wots");
    await screen.findByTestId("sphincs-explainer");
    expect(document.getElementById("how-wots")).toBeTruthy();
  });

  it("every 'see it for real' link points at a section the detailed explainer renders", async () => {
    render(<Explainer />);
    const anchors = ELI5_SCENES.map((s) => realAnchor(s.realTarget));
    fireEvent.click(toggle("real"));
    await screen.findByTestId("sphincs-explainer");
    for (const a of anchors) expect(document.getElementById(a), a).toBeTruthy();
  });
});

describe("mode from the URL", () => {
  it("knows the detailed scenes' anchors and nothing else", () => {
    expect([...REAL_SCENE_IDS]).toEqual(SCENES.map((s) => s.id));
    expect(modeFromHash("#how-wots")).toBe("real");
    expect(modeFromHash("#how-wots-h")).toBe("real");
    expect(modeFromHash("#how-quantum-h")).toBe("real");
    expect(modeFromHash("#real")).toBe("real");
    expect(modeFromHash("#eli5-stairs")).toBe("eli5");
    expect(modeFromHash("#how-it-works")).toBeNull();
    expect(modeFromHash("")).toBeNull();
  });
});

describe("an ELI5 scene", () => {
  const caption = (fig: HTMLElement) => fig.querySelector("figcaption p[id]")!.textContent;

  it("steps forward and back through its captions, by button and keyboard", () => {
    render(<StairsScene />);
    const copy = ELI5_SCENES.find((s) => s.id === "stairs")!;
    const fig = screen.getByRole("figure");
    expect(caption(fig)).toBe(copy.steps[0]);
    fireEvent.click(screen.getByRole("button", { name: "Next step" }));
    expect(caption(fig)).toBe(copy.steps[1]);
    fireEvent.keyDown(fig, { key: "ArrowRight" });
    expect(caption(fig)).toBe(copy.steps[2]);
    fireEvent.keyDown(fig, { key: "ArrowLeft" });
    expect(caption(fig)).toBe(copy.steps[1]);
    fireEvent.click(screen.getByRole("button", { name: `Step ${copy.steps.length} of ${copy.steps.length}: ${copy.steps.at(-1)}` }));
    expect(caption(fig)).toBe(copy.steps.at(-1));
    // Once stepped, the caption is announced.
    expect(fig.querySelector("figcaption p[id]")!.getAttribute("aria-live")).toBe("off"); // playing
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(fig.querySelector("figcaption p[id]")!.getAttribute("aria-live")).toBe("polite");
    fireEvent.click(screen.getByRole("button", { name: "Replay from the start" }));
    expect(caption(fig)).toBe(copy.steps[0]);
  });

  it("with reduced motion, opens on the finished picture with no play button", () => {
    reduced = true;
    render(<BlenderScene />);
    const copy = ELI5_SCENES.find((s) => s.id === "blender")!;
    const fig = screen.getByRole("figure");
    expect(caption(fig)).toBe(copy.steps.at(-1));
    expect(screen.queryByRole("button", { name: /^Play/ })).toBeNull();
    // The finished picture has both glasses and the crossed-out way back.
    expect(within(fig).getByText("same again")).toBeTruthy();
    act(() => fireEvent.click(screen.getByRole("button", { name: "Previous step" })));
    expect(caption(fig)).toBe(copy.steps.at(-2));
  });

  it("labels its picture for screen readers", () => {
    render(<BlenderScene />);
    const copy = ELI5_SCENES.find((s) => s.id === "blender")!;
    expect(screen.getByRole("img", { name: copy.figure })).toBeTruthy();
  });
});
