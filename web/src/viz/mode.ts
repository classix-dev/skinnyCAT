// Which version of the explainer to show. "Like I'm Five" is the default. A reader's choice is kept
// in localStorage, and a link to one of the detailed scenes (#how-wots, #real) opens the real
// thing. All of it is read after hydration, so the server always renders the default.
// The detailed scenes' ids, listed here so the default bundle doesn't carry their copy. A test
// keeps the list in step with copy.ts.
import type { SceneId } from "./copy";

export type Mode = "eli5" | "real";
export const DEFAULT_MODE: Mode = "eli5";
export const MODE_KEY = "skinnycat.explainer";

export const REAL_SCENE_IDS: readonly SceneId[] = ["hash", "chain", "wots", "merkle", "fors", "hypertree", "anatomy", "verify"];
const REAL_HASHES = new Set(["#real", "#how-quantum-h", ...REAL_SCENE_IDS.flatMap((id) => [`#how-${id}`, `#how-${id}-h`])]);

/** The mode a URL hash asks for, or null if it names neither. */
export function modeFromHash(hash: string): Mode | null {
  if (REAL_HASHES.has(hash)) return "real";
  if (hash === "#eli5" || hash.startsWith("#eli5-")) return "eli5";
  return null;
}

export const isMode = (v: unknown): v is Mode => v === "eli5" || v === "real";

/** The mode to open in, from the hash first, then the stored choice. Browser only. */
export function initialMode(): Mode {
  const fromHash = modeFromHash(window.location.hash);
  if (fromHash) return fromHash;
  try {
    const v = window.localStorage.getItem(MODE_KEY);
    if (isMode(v)) return v;
  } catch {
    // Storage can be blocked. The default is fine then.
  }
  return DEFAULT_MODE;
}

export function storeMode(m: Mode) {
  try {
    window.localStorage.setItem(MODE_KEY, m);
  } catch {
    // Not remembered, which is fine.
  }
}
