import { Climber, LogoMark, along, polyline } from "./Cats";
import { cx } from "./ui";

export { LogoMark };
export const APP_NAME = "skinnyCAT";
export const TAGLINE = "Quantum-Safe Payments on Ethereum Classic";

/** The mark and the name, "skinny" in the text colour and "CAT" in the path's cyan. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-1.5", className)}>
      <LogoMark className="size-8 -translate-y-px" />
      <span className="text-[18px] font-semibold tracking-[-0.03em] text-fg" data-testid="wordmark">
        skinny<span className="font-bold tracking-[-0.01em] text-cyan">CAT</span>
      </span>
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

// The route the cat takes, leaf to the top of the root, along the lit edges.
const ROUTE: [number, number][] = (() => {
  const pts: [number, number][] = [[xs(3)[LEAF], LEVELS[3]]];
  for (let l = 3; l > 0; l--) {
    const x = xs(l)[PATH[3 - l]];
    const px = xs(l - 1)[PATH[4 - l]];
    const mid = (LEVELS[l - 1] + LEVELS[l]) / 2;
    pts.push([x, mid], [px, mid], [px, LEVELS[l - 1]]);
  }
  pts[pts.length - 1] = [160, LEVELS[0] - 7];
  return pts;
})();
const ROUTE_LEN = along(ROUTE, 1).length;
// How far along ROUTE each lit node sits, by level.
const NODE_AT = [0, 1, 2, 3].map((l) => (l === 3 ? 0 : along(ROUTE.slice(0, 1 + 3 * (3 - l)), 1).length));

/**
 * The hero illustration. Signing walks from a leaf up to the public root. The cat climbs it as
 * the work goes on (t from 0 to 1), its tail the lit path behind it, and sits on the root at rest.
 */
export function HashTree({ t, moving, className }: { t: number; moving: boolean; className?: string }) {
  const edges: { d: string; lit: boolean }[] = [];
  for (let l = 1; l < 4; l++) {
    xs(l).forEach((x, i) => {
      const px = xs(l - 1)[i >> 1];
      const mid = (LEVELS[l - 1] + LEVELS[l]) / 2;
      edges.push({ d: `M${px} ${LEVELS[l - 1] + 7}V${mid}H${x}V${LEVELS[l] - 7}`, lit: isOnPath(l, i) });
    });
  }
  const reach = t * ROUTE_LEN;
  return (
    <svg viewBox="0 -40 320 248" className={className} aria-hidden="true" focusable="false" fill="none" data-testid="hero-tree">
      <defs>
        <filter id="ht-blur" filterUnits="userSpaceOnUse" x="0" y="-40" width="320" height="248">
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>
      {edges.map((e) => (
        <path key={e.d} d={e.d} stroke={e.lit ? "var(--color-cyan)" : "var(--color-ink-500)"} strokeOpacity={e.lit ? 0.22 : 1} strokeWidth="1.25" />
      ))}
      <path d={polyline(ROUTE)} stroke="var(--color-cyan)" strokeOpacity="0.25" strokeWidth="6" filter="url(#ht-blur)" strokeDasharray={`${reach} ${ROUTE_LEN}`} className="cat-glide-dash" />
      <path d={polyline(ROUTE)} stroke="var(--color-cyan)" strokeWidth="1.75" strokeDasharray={`${reach} ${ROUTE_LEN}`} className="cat-glide-dash" />
      {LEVELS.map((y, l) =>
        xs(l).map((x, i) => {
          const onPath = isOnPath(l, i);
          const lit = onPath && reach + 0.01 >= NODE_AT[l];
          const sibling = !onPath && isSibling(l, i);
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
              stroke={lit ? "none" : sibling ? "var(--color-accent)" : onPath ? "var(--color-cyan)" : "var(--color-ink-500)"}
              strokeOpacity={onPath && !lit ? 0.5 : 1}
              strokeWidth={sibling ? 1.5 : 1.25}
            />
          );
        }),
      )}
      <text x={184} y={28} className="mono" fontSize="10" fill="var(--color-muted)">
        public root
      </text>
      <text x={xs(3)[LEAF]} y={204} textAnchor="middle" className="mono" fontSize="10" fill="var(--color-muted)">
        signature
      </text>
      <Climber pts={ROUTE} t={t} moving={moving} scale={1.5} />
    </svg>
  );
}

function isOnPath(level: number, i: number) {
  return PATH[3 - level] === i;
}
function isSibling(level: number, i: number) {
  return level > 0 && (PATH[3 - level] ^ 1) === i;
}
