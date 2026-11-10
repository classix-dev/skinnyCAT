// The skinnyCAT mark and favicon head as SVG markup. Shared by the page (Cats.tsx) and by
// scripts/icons.mjs, which renders the favicons, app icons and the OG image. No imports, so Node
// can load it with --experimental-strip-types.

export const BRAND = {
  navy: "#03050c",
  panel: "#0a1020",
  head: "#16203a",
  fur: "#c9d6ff",
  blue: "#4c8dff",
  cyan: "#5ee4ff",
} as const;

type Colors = { fur: string; blue: string; cyan: string; boxFill: string };

const PAGE: Colors = { fur: "#c9d6ff", blue: "var(--color-accent)", cyan: "var(--color-cyan)", boxFill: "var(--color-ink-900)" };
const FILE: Colors = { fur: BRAND.fur, blue: BRAND.blue, cyan: BRAND.cyan, boxFill: BRAND.panel };

/**
 * The skinny cat slipping out of a box, in hash-tree strokes, in a 64 by 64 box. Its tail leaves
 * the box as the lit Merkle path and ends at the root, the square top right.
 */
export function markInner(file = false): string {
  const c = file ? FILE : PAGE;
  return `<g fill="none" stroke-linecap="round" stroke-linejoin="round">
<path d="M42 50.5H48.5V40.5H55V26" stroke="${c.cyan}" stroke-width="2.8"/>
<g fill="${c.cyan}"><circle cx="48.5" cy="50.5" r="2.5"/><circle cx="48.5" cy="40.5" r="2.5"/><circle cx="55" cy="40.5" r="2.5"/><rect x="51.4" y="17.6" width="7.2" height="7.2" rx="1.9"/></g>
<g stroke="${c.fur}" stroke-width="2.7">
<path d="M18.5 22 18 8.5 24.8 14.3H29.2L36 8.5 35.5 22"/>
<path d="M18.5 22Q18.5 30.2 27 30.2T35.5 22"/>
<path d="M23.3 30Q22.6 34 23 38M30.7 30Q31.4 34 31 38"/>
</g>
<g fill="${c.cyan}"><ellipse cx="23.4" cy="22.4" rx="1.7" ry="2.2"/><ellipse cx="30.6" cy="22.4" rx="1.7" ry="2.2"/></g>
<path d="M18 25.2 12.2 24.2M18 27.4 12.8 28.6M36 25.2 41.8 24.2M36 27.4 41.2 28.6" stroke="${c.blue}" stroke-width="1.4"/>
<path d="M11.5 38.5H42.5V57.5H11.5Z" fill="${c.boxFill}" stroke="${c.blue}" stroke-width="2.7"/>
<path d="M11.5 38.5 5.5 32.5M42.5 38.5 47.5 33" stroke="${c.blue}" stroke-width="2.7"/>
<g fill="${c.fur}"><ellipse cx="22.4" cy="38.4" rx="2.8" ry="2"/><ellipse cx="31.6" cy="38.4" rx="2.8" ry="2"/></g>
</g>`;
}

/** The head only, ears and cyan eyes, in a 32 by 32 box. Reads at 16 px. */
export function headInner(file = false): string {
  const c = file ? FILE : PAGE;
  return `<path d="M6 18 5.5 4.5 12 10H20L26.5 4.5 26 18Q26 27.5 16 27.5T6 18Z" fill="${file ? BRAND.head : "var(--color-ink-700)"}" stroke="${c.fur}" stroke-width="2.4" stroke-linejoin="round"/>
<g fill="${c.cyan}"><ellipse cx="11.6" cy="18" rx="2.2" ry="2.9"/><ellipse cx="20.4" cy="18" rx="2.2" ry="2.9"/></g>`;
}

export const markSvg = (size?: number) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"${size ? ` width="${size}" height="${size}"` : ""}>${markInner(true)}</svg>`;

/** The favicon, the head on a rounded navy tile. */
export const faviconSvg = () =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="${BRAND.panel}"/>${headInner(true)}</svg>`;
