// Colors from web/src/style.css, as literals for SVG gradients and canvas.
import type { Group, Section } from "./data/explain";

const PART_LABEL: Record<Section["part"], string> = {
  randomizer: "randomizer R",
  secret: "secret leaf",
  path: "path node",
  counter: "counter",
  chains: "chain value",
  auth: "tree sibling",
};

/** Where byte `offset` of a signature sits, in words. */
export function describeByte(sections: Section[], offset: number): string {
  const s = sections.find((x) => offset >= x.offset && offset < x.offset + x.length)!;
  const within = offset - s.offset;
  const where =
    s.part === "path" || s.part === "auth"
      ? `${PART_LABEL[s.part]} ${Math.floor(within / 16)}`
      : s.part === "chains"
        ? `chain ${Math.floor(within / 16)}`
        : PART_LABEL[s.part];
  const tree = s.tree !== undefined ? `, tree ${s.tree}` : "";
  return `${GROUP_LABEL[s.group]}${tree}, ${where}`;
}

export const C = {
  ink950: "#03050c",
  ink900: "#060a16",
  ink850: "#0a1020",
  ink800: "#0e1629",
  ink700: "#16203a",
  ink600: "#222f50",
  ink500: "#34436a",
  fg: "#e9eeff",
  muted: "#9aa8c8",
  subtle: "#7d8bad",
  accent: "#4c8dff",
  accentHi: "#7aabff",
  accentLo: "#2563eb",
  cyan: "#5ee4ff",
  warn: "#fbbf5b",
  bad: "#ff7a8a",
  violet: "#a594ff",
  pink: "#ec9cf5",
} as const;

/** One hue per part of the signature, used the same way in every scene. */
export const GROUP_COLOR: Record<Group, string> = {
  randomizer: C.warn,
  fors: C.accent,
  bottom: C.cyan,
  middle: C.violet,
  top: C.pink,
};

export const GROUP_LABEL: Record<Group, string> = {
  randomizer: "Randomizer",
  fors: "FORS",
  bottom: "Bottom layer",
  middle: "Middle layer",
  top: "Top layer",
};

export const LAYER_GROUPS = ["bottom", "middle", "top"] as const;

export const fmt = (n: number) => n.toLocaleString("en-US");

/** "0x0531…0a0d" */
export function shortHex(b: Uint8Array, head = 4, tail = 2): string {
  let s = "0x";
  for (let i = 0; i < head; i++) s += b[i].toString(16).padStart(2, "0");
  s += "…";
  for (let i = b.length - tail; i < b.length; i++) s += b[i].toString(16).padStart(2, "0");
  return s;
}
