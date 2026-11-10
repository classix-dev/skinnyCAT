// The explainer renders on the server with no window or document, and the HTML carries every
// heading, paragraph and step, so it reads fine before (or without) the scenes loading.
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CREDITS, INTRO, QUANTUM, SCENES } from "./copy";
import { SphincsExplainer } from "./index";

describe("server render", () => {
  it("renders without browser globals and includes all the text", () => {
    expect(typeof window).toBe("undefined");
    const html = renderToString(<SphincsExplainer />);
    const text = html.replace(/<[^>]+>/g, "").replace(/&#x27;|&rsquo;/g, "'").replace(/&amp;/g, "&");
    expect(text).toContain(INTRO.title);
    for (const s of SCENES) {
      expect(text).toContain(s.title);
      for (const step of s.steps) expect(text).toContain(step);
    }
    expect(text).toContain(QUANTUM.title);
    expect(html).toContain(CREDITS.design.href);
  });
});

describe("copy", () => {
  // The repo's style guide: no em dashes, semicolons or colons in prose, Title Case headings.
  const prose = [
    ...INTRO.lede,
    ...SCENES.flatMap((s) => [...s.body, ...s.steps, s.figure]),
    ...QUANTUM.cards.map((c) => c.body),
  ];
  it("has no em dashes, semicolons or colons", () => {
    for (const p of prose) expect(p).not.toMatch(/[—;:]/);
  });
  it("avoids the banned words", () => {
    const banned = /\b(delve|realm|tapestry|leverage|robust|seamless|just|really|very|actually|basically|literally|quietly|genuinely|crucial)\b/i;
    for (const p of prose) expect(p).not.toMatch(banned);
  });
  it("uses Title Case headings", () => {
    const small = new Set(["a", "an", "the", "and", "or", "of", "to", "in", "on", "for", "from", "by", "at"]);
    for (const h of [INTRO.title, QUANTUM.title, ...SCENES.map((s) => s.title), ...QUANTUM.cards.map((c) => c.title)]) {
      h.split(" ").forEach((w, i) => {
        if ((i > 0 && small.has(w)) || w === "leanSPHINCS") return; // names keep their casing
        expect(w[0], `${h}: ${w}`).toBe(w[0].toUpperCase());
      });
    }
  });
});
