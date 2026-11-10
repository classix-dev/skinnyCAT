import { cx } from "./ui";

export const APP_NAME = "Hypertree";
export const TAGLINE = "Quantum-Secure Transactions on Ethereum Classic";

/** A small hash tree. One leaf's path to the root is lit, the way a SPHINCS signature walks it. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden fill="none">
      <g stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.6" strokeLinecap="round">
        <path d="M16 6 9 16M9 16l-3.5 10M9 16l3.5 10M23 16l3.5 10" />
      </g>
      <g stroke="var(--color-cyan)" strokeWidth="2" strokeLinecap="round">
        <path d="M16 6 23 16l-3.5 10" />
      </g>
      <g fill="currentColor" fillOpacity="0.55">
        <circle cx="9" cy="16" r="2.2" />
        <circle cx="5.5" cy="26" r="2" />
        <circle cx="12.5" cy="26" r="2" />
        <circle cx="26.5" cy="26" r="2" />
      </g>
      <g fill="var(--color-cyan)">
        <rect x="12.6" y="2.6" width="6.8" height="6.8" rx="1.8" />
        <circle cx="23" cy="16" r="2.6" />
        <circle cx="19.5" cy="26" r="2.4" />
      </g>
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-2", className)}>
      <LogoMark className="size-7 text-accent" />
      <span className="text-[17px] font-semibold tracking-[-0.02em] text-fg">hypertree</span>
    </span>
  );
}

// Positions of a 4-level binary tree in a 320 by 200 box.
const LEVELS = [24, 78, 132, 184];
const xs = (level: number) => {
  const n = 2 ** level;
  return Array.from({ length: n }, (_, i) => ((i + 0.5) * 320) / n);
};
const LEAF = 5;
// Indices of the lit path, from the leaf up.
const PATH = [LEAF, LEAF >> 1, LEAF >> 2, 0];

/** The hero illustration. Signing lights the path from a leaf up to the public root. */
export function HashTree({ active, className }: { active: boolean; className?: string }) {
  const edges: { d: string; lit: boolean }[] = [];
  for (let l = 1; l < 4; l++) {
    xs(l).forEach((x, i) => {
      const px = xs(l - 1)[i >> 1];
      const mid = (LEVELS[l - 1] + LEVELS[l]) / 2;
      edges.push({ d: `M${px} ${LEVELS[l - 1] + 7}V${mid}H${x}V${LEVELS[l] - 7}`, lit: isOnPath(l, i) });
    });
  }
  return (
    <svg viewBox="0 0 320 208" className={className} aria-hidden fill="none">
      <defs>
        <filter id="ht-blur" filterUnits="userSpaceOnUse" x="0" y="0" width="320" height="208">
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>
      {edges
        .filter((e) => !e.lit)
        .map((e) => (
          <path key={e.d} d={e.d} stroke="var(--color-ink-500)" strokeWidth="1.25" />
        ))}
      {edges
        .filter((e) => e.lit)
        .map((e) => (
          <g key={e.d}>
            <path d={e.d} stroke="var(--color-cyan)" strokeOpacity="0.25" strokeWidth="6" filter="url(#ht-blur)" />
            <path d={e.d} stroke="var(--color-cyan)" strokeWidth="1.5" />
            {active && (
              <path
                d={e.d}
                stroke="#fff"
                strokeWidth="2"
                strokeDasharray="4 20"
                className="animate-flow [animation-direction:reverse]"
              />
            )}
          </g>
        ))}
      {LEVELS.map((y, l) =>
        xs(l).map((x, i) => {
          const lit = isOnPath(l, i);
          const sibling = !lit && isSibling(l, i);
          const s = l === 0 ? 14 : l === 3 ? 9 : 11;
          return (
            <rect
              key={`${l}-${i}`}
              x={x - s / 2}
              y={y - s / 2}
              width={s}
              height={s}
              rx={l === 0 ? 4 : 2.5}
              fill={lit ? "var(--color-cyan)" : "var(--color-ink-850)"}
              stroke={lit ? "none" : sibling ? "var(--color-accent)" : "var(--color-ink-500)"}
              strokeWidth={sibling ? 1.5 : 1.25}
              className={lit && active ? "animate-pulse-soft" : undefined}
            />
          );
        }),
      )}
      <text x={172} y={28} className="mono" fontSize="10" fill="var(--color-muted)">
        public root
      </text>
      <text x={xs(3)[LEAF]} y={204} textAnchor="middle" className="mono" fontSize="10" fill="var(--color-muted)">
        signature
      </text>
    </svg>
  );
}

function isOnPath(level: number, i: number) {
  return PATH[3 - level] === i;
}
function isSibling(level: number, i: number) {
  return level > 0 && (PATH[3 - level] ^ 1) === i;
}
