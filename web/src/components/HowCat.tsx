// The courier cat for How It Works, side on, in the skinnyCAT strokes: ink body, pale fur line,
// cyan eyes and a stepped cyan tail that ends in a square, the lit path of the mark. It carries
// what moves at each step. Motion lives in style.css under the how-* classes, and every base style
// there is the pose the cat ends in, so reduced motion shows the cat standing where it arrived.

import type { CSSProperties } from "react";
import type { Carry } from "./howData";
import { cx } from "./ui";

const FUR = "#c9d6ff";
const CYAN = "var(--color-cyan)";
const BLUE = "var(--color-accent)";
const GOLD = "var(--color-warn)";
const INK = "var(--color-ink-900)";

/** The cat's box, in px at scale 1. */
export const CAT_W = 52;
export const CAT_H = 26;

function Note({ lines = false }: { lines?: boolean }) {
  return (
    <g>
      <rect x="0.6" y="1.2" width="12.4" height="8.8" rx="1.3" fill={INK} stroke={CYAN} strokeWidth="1.2" />
      {lines ? <path d="M3 4.4h7.4M3 7h4.6" stroke={CYAN} strokeWidth="1" /> : <path d="M1.2 1.9 6.8 6.2 12.4 1.9" stroke={CYAN} strokeWidth="1.1" />}
    </g>
  );
}

function Coin({ x, y, r, sc = false }: { x: number; y: number; r: number; sc?: boolean }) {
  const d = r * 0.55;
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill={sc ? CYAN : GOLD} stroke="var(--color-ink-950)" strokeWidth="0.8" />
      <path d={`M${x} ${y - d}L${x + d * 0.7} ${y}L${x} ${y + d}L${x - d * 0.7} ${y}Z`} fill="none" stroke="var(--color-ink-950)" strokeWidth="0.9" />
    </g>
  );
}

function Check() {
  return (
    <g>
      <circle cx="6.6" cy="5.8" r="5.2" fill="color-mix(in oklab, var(--color-cyan) 18%, var(--color-ink-900))" stroke={CYAN} strokeWidth="1.2" />
      <path d="M4 6 5.9 7.9 9.3 4" stroke={CYAN} strokeWidth="1.5" fill="none" />
    </g>
  );
}

/** The thing in the cat's mouth, in a 14 by 12 box. */
export function Item({ carry }: { carry: Carry }) {
  switch (carry) {
    case "note":
      return <Note />;
    case "deposit":
      return (
        <g>
          <Note />
          <Coin x={11.6} y={9.6} r={3.4} />
        </g>
      );
    case "check":
      return <Check />;
    case "fee":
      return <Coin x={6.4} y={6} r={4.6} />;
    case "eth":
      return <Coin x={6.6} y={5.6} r={6} />;
    case "sign":
      return <Note lines />;
    case "credit":
      return <Coin x={6.4} y={5.8} r={5} sc />;
    case "stamp":
      return (
        <g>
          <Note lines />
          <Coin x={11.8} y={9.6} r={3.2} sc />
        </g>
      );
  }
}

/** What the cat does on a self-message, drawn over the item. */
function Tool({ carry }: { carry: Carry }) {
  if (carry === "sign")
    return (
      <g className="how-pencil">
        <path d="M44.5 -3.5 49.5 1.5 43 8 39.6 8.6 40.2 5.2Z" fill={INK} stroke={FUR} strokeWidth="1.1" strokeLinejoin="round" />
        <path d="M39.6 8.6 41.2 7" stroke={CYAN} strokeWidth="1.2" />
      </g>
    );
  if (carry === "stamp" || carry === "credit")
    return (
      <g className="how-stamp">
        <path d="M42.5 -6h4v4h-4z" fill={INK} stroke={FUR} strokeWidth="1.1" />
        <path d="M40 -2h9v3h-9z" fill={BLUE} stroke={FUR} strokeWidth="1.1" />
      </g>
    );
  return null;
}

export type CatMode = "run" | "act" | "stand";

/**
 * The cat facing right (or left), carrying an item. "run" gallops, "act" stays in place and uses
 * the pencil or the stamp, "stand" holds still.
 */
export function CourierRunner({
  carry,
  left = false,
  mode,
  width = CAT_W,
  className,
  style,
}: {
  carry: Carry;
  left?: boolean;
  mode: CatMode;
  width?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const self = carry === "sign" || carry === "credit" || carry === "stamp";
  return (
    <svg
      viewBox={`0 -8 ${CAT_W} ${CAT_H + 8}`}
      width={width}
      height={(width * (CAT_H + 8)) / CAT_W}
      className={cx("overflow-visible", className)}
      style={style}
      aria-hidden="true"
      focusable="false"
      data-testid="how-cat"
      data-mode={mode}
      data-carry={carry}
    >
      <g transform={left ? `translate(${CAT_W} 0) scale(-1 1)` : undefined} fill="none" strokeLinecap="round" strokeLinejoin="round">
        <g className={cx(mode === "run" && "how-gallop", mode === "act" && "how-nod")}>
          {/* The tail, a stepped path with lit nodes and the root at its tip. */}
          <g className={cx(mode !== "stand" && "how-tail")}>
            <path d="M10 12H6V8.2H3V5.6" stroke={CYAN} strokeWidth="1.6" />
            <g fill={CYAN}>
              <circle cx="6" cy="12" r="1.35" />
              <circle cx="6" cy="8.2" r="1.35" />
              <circle cx="3" cy="8.2" r="1.35" />
              <rect x="1.1" y="1.9" width="3.8" height="3.8" rx="1" />
            </g>
          </g>
          <g stroke={FUR} strokeWidth="1.6">
            <path d="M13 16.5 12.2 24" className={cx(mode === "run" && "how-leg how-leg-a")} />
            <path d="M15 16.5 15.6 24" className={cx(mode === "run" && "how-leg how-leg-b")} />
            <path d="M23.4 16.5 22.6 24" className={cx(mode === "run" && "how-leg how-leg-b")} />
            <path d="M25.4 16.5 26.2 24" className={cx(mode === "run" && "how-leg how-leg-a")} />
          </g>
          <path d="M10 11.6Q18 9.6 25.4 10.4Q28.6 11.6 27.8 15Q26.8 17.6 22.4 17.6H12.4Q9 17.6 9 14.6Q9 12.6 10 11.6Z" fill={INK} stroke={FUR} strokeWidth="1.5" />
          <path d="M26.4 10.6 26.1 2.8 29.6 5.7H32.7L36.2 2.8 35.8 10.6Q35.8 15.4 31.1 15.4T26.4 10.6Z" fill={INK} stroke={FUR} strokeWidth="1.5" />
          <g fill={CYAN}>
            <ellipse cx="29.3" cy="10.2" rx="0.95" ry="1.3" />
            <ellipse cx="33" cy="10.2" rx="0.95" ry="1.3" />
          </g>
          <path d="M36 11.8 39 11.2M36 13.2 38.8 13.8" stroke={BLUE} strokeWidth="0.9" />
          <g transform={self ? "translate(37.5 11.5)" : "translate(37.2 9.6)"} className={cx(carry === "credit" && mode === "act" && "how-pop-in")}>
            {/* Mirrored back when the cat faces left, so the check and the coin read the right way round. */}
            <g transform={left ? "translate(13.6 0) scale(-1 1)" : undefined}>
              <Item carry={carry} />
            </g>
          </g>
        </g>
        {self && mode !== "run" && (
          <g className={cx(mode === "act" && "how-act")} transform="translate(0 1.5)">
            <Tool carry={carry} />
          </g>
        )}
      </g>
    </svg>
  );
}

/** The item on its own, for the list on narrow screens. */
export function ItemIcon({ carry, className }: { carry: Carry; className?: string }) {
  return (
    <svg viewBox="-1 -1 16 14" className={className} aria-hidden="true" focusable="false" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <Item carry={carry} />
    </svg>
  );
}
