// @vitest-environment node
// The explainer renders on the server with no window or document, and the HTML carries every
// heading, paragraph and step, so it reads fine before (or without) the scenes loading.
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CREDITS, INTRO, QUANTUM, SCENES } from "./copy";
import { ELI5_INTRO, ELI5_SCENES, MODES, UI } from "./eli5/copy";
import { Explainer, SphincsExplainer } from "./index";

// The shared setup (src/test/setup.ts) clears localStorage before each test. Node has none, so give
// it an empty one. window and document stay undefined.
if (typeof localStorage === "undefined") Object.assign(globalThis, { localStorage: { clear() {} } });

const textOf = (html: string) =>
  html
    .replace(/<[^>]+>/g, "")
    .replace(/&#x27;|&rsquo;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"');

describe("server render", () => {
  it("renders without browser globals and includes all the text", () => {
    expect(typeof window).toBe("undefined");
    const html = renderToString(<SphincsExplainer />);
    const text = textOf(html);
    expect(text).toContain(INTRO.title);
    for (const s of SCENES) {
      expect(text).toContain(s.title);
      for (const step of s.steps) expect(text).toContain(step);
    }
    expect(text).toContain(QUANTUM.title);
    expect(html).toContain(CREDITS.design.href);
  });

  it("renders the toggle and the ELI5 version, with finished pictures, and leaves the detailed scenes out", () => {
    expect(typeof window).toBe("undefined");
    const html = renderToString(<Explainer />);
    const text = textOf(html);
    expect(text).toContain(MODES.eli5);
    expect(text).toContain(MODES.real);
    expect(html).toMatch(/aria-pressed="true"[^>]*data-mode="eli5"/);
    expect(text).toContain(ELI5_INTRO.title);
    for (const s of ELI5_SCENES) {
      expect(text).toContain(s.title);
      // rich() splits powers like 2^64 into a superscript.
      const plain = (x: string) => x.replace(/(\d+)\^(\d+)/g, "$1$2");
      expect(text).toContain(plain(s.body));
      expect(text).toContain(plain(s.real));
      // The first caption shows, and the picture is the finished frame.
      expect(text).toContain(plain(s.steps.at(-1)!));
      expect(html).toContain(`aria-label="${s.figure.replace(/'/g, "&#x27;")}"`);
    }
    expect(text).toContain("7,740 bytes, as much as 119 sticky notes");
    expect(text).toContain("1,073,741,824");
    for (const s of SCENES) expect(text).not.toContain(s.title);
  });
});

describe("copy", () => {
  // The repo's style guide: no em dashes, semicolons or colons in prose, Title Case headings.
  const prose = [
    ...INTRO.lede,
    ...SCENES.flatMap((s) => [...s.body, ...s.steps, s.figure]),
    ...QUANTUM.cards.map((c) => c.body),
  ];
  const eli5 = [ELI5_INTRO.lede, ...ELI5_SCENES.flatMap((s) => [s.body, ...s.steps, s.real, s.figure]), UI.toReal, UI.seeReal, UI.toEli5];
  const banned = /\b(delve|realm|tapestry|leverage|robust|seamless|just|really|very|actually|basically|literally|quietly|genuinely|crucial)\b/i;
  const hedges = /\b(may|might|could|perhaps|potentially|probably|certainly|matters?|navigate|unlock|game-changer|revolutionize|comprehensive|holistic)\b/i;

  it("has no em dashes, semicolons or colons", () => {
    for (const p of [...prose, ...eli5]) expect(p, p).not.toMatch(/[—;:]/);
  });
  it("avoids the banned words", () => {
    for (const p of prose) expect(p).not.toMatch(banned);
    for (const p of eli5) {
      expect(p, p).not.toMatch(banned);
      expect(p, p).not.toMatch(hedges);
    }
  });
  it("uses Title Case headings", () => {
    const small = new Set(["a", "an", "the", "and", "or", "of", "to", "in", "on", "for", "from", "by", "at"]);
    const headings = [
      INTRO.title,
      QUANTUM.title,
      ...SCENES.map((s) => s.title),
      ...QUANTUM.cards.map((c) => c.title),
      ELI5_INTRO.title,
      ...ELI5_SCENES.map((s) => s.title),
      MODES.eli5,
      MODES.real,
      UI.toEli5.replace(/^Back to /, ""),
    ];
    for (const h of headings) {
      h.split(/[ -]/).forEach((w, i) => {
        if ((i > 0 && small.has(w)) || w === "leanSPHINCS") return; // names keep their casing
        expect(w[0], `${h}: ${w}`).toBe(w[0].toUpperCase());
      });
    }
  });
  it("keeps the ELI5 version short, a sentence or two a scene", () => {
    expect(ELI5_SCENES).toHaveLength(6);
    for (const s of ELI5_SCENES) {
      expect(s.body.split(/(?<=[.!?])\s/).length, s.title).toBeLessThanOrEqual(3);
      for (const step of s.steps) expect(step.split(" ").length, step).toBeLessThanOrEqual(18);
    }
  });
  it("states the real numbers the ELI5 version rests on", () => {
    const all = ELI5_SCENES.map((s) => `${s.body} ${s.steps.join(" ")} ${s.real}`).join(" ");
    for (const fact of ["Keccak-256", "64 chains", "128", "2^30", "2^64", "2^128", "7,740 bytes", "65 bytes", "14 times", "86,000 gas", "67 million"]) {
      expect(all).toContain(fact);
    }
  });
});
