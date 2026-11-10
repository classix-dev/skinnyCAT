import { LEDGER_SYMBOL } from "../generated/contracts";
import { useRef, type CSSProperties, type ReactNode } from "react";
import {
  AGG_DWELL_MS,
  AGG_GAS,
  AGG_LAST,
  AGG_RUN_MS,
  AGG_STEPS,
  CALLDATA_GAS,
  ECDSA_BYTES,
  FRAME_GAS,
  num,
  SIG_BYTES,
  SIGS,
  STARK_GAS,
  TODAY_GAS,
  VERIFY_GAS,
} from "./aggData";
import { A, LINKS } from "./ext";
import { CourierRunner, Proof } from "./HowCat";
import { done, speedOf, usePlayer, type Player, type Timing } from "./howPlayer";
import { PlayerControls } from "./PlayerControls";
import { cx } from "./ui";

// Copy from docs/aggregation.md, cut down. The picture plays EIP-8288's five steps with six
// signatures: scrolls go to two mempool nodes, get folded into a proof, the nodes swap and merge
// their proofs, the builder cat carries one proof into the block header and the validators' box
// opens. Every actor has a pose at the end of each step (checkpoint 0 is before step 1), and a
// step's run animates each actor from the previous checkpoint to this one with one CSS keyframe.
// The base style is the pose it ends in, so the pre-rendered page, reduced motion and a finished
// run all show the same still. Before the first play, the picture shows the end of step 5.

const TIMING: Timing = { last: AGG_LAST, runMs: (n) => AGG_RUN_MS[n - 1], dwellMs: AGG_DWELL_MS };

const PAPER = "#f4ead0";
const ROLL = "#b39a5c";
const FUR = "#c9d6ff";
const CYAN = "var(--color-cyan)";

// ---------------------------------------------------------------------------
// Poses and the two layouts.
// ---------------------------------------------------------------------------

type Pt = [number, number];
type Pose = { x: number; y: number; s?: number; o?: number; r?: number };
/** A pose for each checkpoint 0 to 5. */
type Track = Pose[];
/** When a step's run moves an actor, as fractions of the run. */
type Win = [number, number];

const at = ([x, y]: Pt, s = 1, o = 1, r = 0): Pose => ({ x, y, s, o, r });
const hidden = (p: Pt, s = 0): Pose => at(p, s, 0);
/** The CSS transform for a pose. A run needs the same functions at both ends, a still one only what differs from the default. */
const tf = (p: Pose, full = true) =>
  full
    ? `translate(${p.x}px, ${p.y}px) rotate(${p.r ?? 0}deg) scale(${p.s ?? 1})`
    : [`translate(${p.x}px, ${p.y}px)`, p.r ? `rotate(${p.r}deg)` : "", (p.s ?? 1) !== 1 ? `scale(${p.s})` : ""].filter(Boolean).join(" ");

type Lay = {
  key: "wide" | "tall";
  /** How much bigger the moving art is drawn. */
  art: number;
  w: number;
  h: number;
  user: (i: number) => Pt;
  envAtUser: (i: number) => Pt;
  sigAtUser: (i: number) => Pt;
  node: [Pt, Pt];
  nodeSize: [number, number];
  envInNode: (j: number, k: number) => Pt;
  sigInNode: (j: number, k: number) => Pt;
  gem: (j: number) => Pt;
  offChain: Pt;
  cat: [Pt, Pt];
  catLeft: boolean;
  block: { x: number; y: number; w: number; h: number; head: number };
  header: Pt;
  body: (i: number) => Pt;
  noSig: Pt;
  box: Pt;
  labels: { text: string; at: Pt; anchor?: "start" | "middle" | "end" }[];
};

const WIDE: Lay = {
  key: "wide",
  art: 1.3,
  w: 760,
  h: 342,
  user: (i) => [30, 62 + i * 44],
  envAtUser: (i) => [66, 62 + i * 44],
  sigAtUser: (i) => [114, 62 + i * 44],
  node: [
    [300, 100],
    [300, 250],
  ],
  nodeSize: [168, 128],
  envInNode: (j, k) => [254 + k * 46, (j ? 250 : 100) + 40],
  sigInNode: (j, k) => [254 + k * 46, (j ? 250 : 100) + 8],
  gem: (j) => [300, (j ? 250 : 100) - 24],
  offChain: [300, 330],
  cat: [
    [448, 174],
    [520, 80],
  ],
  catLeft: false,
  block: { x: 568, y: 40, w: 160, h: 206, head: 74 },
  header: [640, 82],
  body: (i) => [608 + (i % 3) * 40, 150 + Math.floor(i / 3) * 34],
  noSig: [648, 228],
  box: [648, 300],
  labels: [
    { text: "users", at: [16, 22] },
    { text: "mempool", at: [216, 22] },
    { text: "builder", at: [448, 22], anchor: "middle" },
    { text: "block", at: [568, 22] },
  ],
};

const TALL: Lay = {
  key: "tall",
  art: 1.15,
  w: 360,
  h: 610,
  user: (i) => [36 + i * 57.6, 44],
  envAtUser: (i) => [36 + i * 57.6, 78],
  sigAtUser: (i) => [36 + i * 57.6, 104],
  node: [
    [92, 232],
    [268, 232],
  ],
  nodeSize: [164, 140],
  envInNode: (j, k) => [(j ? 268 : 92) - 48 + k * 48, 232 + 42],
  sigInNode: (j, k) => [(j ? 268 : 92) - 48 + k * 48, 232 + 10],
  gem: (j) => [j ? 268 : 92, 232 - 26],
  offChain: [180, 316],
  cat: [
    [318, 352],
    [312, 426],
  ],
  catLeft: true,
  block: { x: 24, y: 392, w: 250, h: 156, head: 64 },
  header: [150, 426],
  body: (i) => [89 + (i % 3) * 60, 484 + Math.floor(i / 3) * 30],
  noSig: [149, 540],
  box: [322, 556],
  labels: [
    { text: "users", at: [10, 14] },
    { text: "mempool", at: [10, 152] },
    { text: "block", at: [24, 384] },
  ],
};

/** Which node a user's transaction goes to, and its slot there. */
const nodeOf = (i: number) => (i < SIGS / 2 ? 0 : 1);
const slotOf = (i: number) => i % (SIGS / 2);

type Actor = { id: string; track: Track; wins?: Partial<Record<number, Win>>; children: ReactNode };

function actors(L: Lay, merged: boolean, catMode: "run" | "stand", carrying: boolean): Actor[] {
  const out: Actor[] = [];
  const big = (n: ReactNode) => <g transform={`scale(${L.art})`}>{n}</g>;
  const [c0, c1] = L.cat;
  for (let i = 0; i < SIGS; i++) {
    const j = nodeOf(i);
    const k = slotOf(i);
    const inNode = L.envInNode(j, k);
    out.push({
      id: `env-${i}`,
      track: [hidden(L.envAtUser(i), 0.4), at(L.envAtUser(i)), at(inNode), at(inNode), at(L.body(i)), at(L.body(i))],
      wins: { 1: [i * 0.07, 0.45 + i * 0.07], 2: [i * 0.06, 0.62 + i * 0.06], 4: [0.12 + i * 0.05, 0.6 + i * 0.05] },
      children: big(<Envelope />),
    });
    // Once folded, a signature stays in the mempool, dimmed. It never goes on chain.
    const gone = at(L.sigInNode(j, k), 0.7, 0.3);
    out.push({
      id: `sig-${i}`,
      track: [hidden(L.sigAtUser(i), 0.3), at(L.sigAtUser(i)), at(L.sigInNode(j, k), 0.85), gone, gone, gone],
      wins: { 1: [0.18 + i * 0.07, 0.6 + i * 0.07], 2: [0.04 + i * 0.06, 0.66 + i * 0.06], 3: [k * 0.05, 0.28 + k * 0.05] },
      children: big(<Scroll />),
    });
  }
  for (const j of [0, 1]) {
    const g = L.gem(j);
    const other = L.gem(1 - j);
    const picked = hidden(c0, 0.4);
    out.push({
      id: `gem-${j}`,
      track: [hidden(g), hidden(g), hidden(g), at(g), picked, picked],
      wins: { 3: [0.24, 0.42], 4: [0, 0.22] },
      children: big(<Gem n={merged ? SIGS : SIGS / 2} />),
    });
    // The copy a node gossips to its peer. It leaves as the proof forms and lands on the peer's.
    out.push({
      id: `gossip-${j}`,
      track: [hidden(g), hidden(g), hidden(g), at(other), picked, picked],
      wins: { 3: [0.48, 0.92], 4: [0, 0.22] },
      children: big(<Gem n={merged ? SIGS : SIGS / 2} />),
    });
  }
  out.push({
    id: "off-chain",
    track: [hidden(L.offChain, 1), hidden(L.offChain, 1), hidden(L.offChain, 1), at(L.offChain), at(L.offChain), at(L.offChain)],
    wins: { 3: [0.2, 0.4] },
    children: (
      <text textAnchor="middle" fontSize="11" fill={ROLL} dominantBaseline="middle">
        signatures stay off chain
      </text>
    ),
  });
  out.push({
    id: "cat",
    track: [at(c0), at(c0), at(c0), at(c0), at(c1), at(c1)],
    wins: { 4: [0.08, 0.82] },
    children: (
      <g data-testid="agg-cat">
        <g transform={`translate(${-29 * L.art} ${-19 * L.art})`}>
          <CourierRunner carry={carrying ? "proof" : null} mode={catMode} left={L.catLeft} width={58 * L.art} />
        </g>
        {L.key === "tall" && (
          <text y="32" textAnchor="middle" fontSize="11" fill="var(--color-subtle)">
            builder
          </text>
        )}
      </g>
    ),
  });
  out.push({
    id: "header-proof",
    track: [hidden(L.header), hidden(L.header), hidden(L.header), hidden(L.header), at(L.header), at(L.header)],
    wins: { 4: [0.8, 1] },
    children: (
      <g>
        <ProofMark r={18} />
        <text x="31" y="1" fontSize="12" fill="var(--color-fg)" dominantBaseline="middle">
          1 proof
        </text>
      </g>
    ),
  });
  out.push({
    id: "ring",
    track: [hidden(L.header, 0.6), hidden(L.header, 0.6), hidden(L.header, 0.6), hidden(L.header, 0.6), hidden(L.header, 0.6), at(L.header)],
    wins: { 5: [0, 0.3] },
    children: <circle r="25" fill="none" stroke={CYAN} strokeWidth="1.5" strokeDasharray="3 3" />,
  });
  out.push({
    id: "no-sig",
    track: [hidden(L.noSig, 1), hidden(L.noSig, 1), hidden(L.noSig, 1), hidden(L.noSig, 1), at(L.noSig), at(L.noSig)],
    wins: { 4: [0.7, 1] },
    children: (
      <text textAnchor="middle" fontSize="11" fill="var(--color-muted)" dominantBaseline="middle">
        no signatures, 0 bytes
      </text>
    ),
  });
  // The validators' box: the lid swings open on its hinge and the cat looks out.
  const [bx, by] = L.box;
  const hinge: Pt = [bx - 18, by - 12];
  out.push({
    id: "box-cat",
    track: [0, 1, 2, 3, 4].map(() => hidden([bx, by + 4], 1)).concat(at([bx, by - 20])),
    wins: { 5: [0.45, 0.75] },
    children: <CatHead />,
  });
  out.push({
    id: "lid",
    track: [0, 1, 2, 3, 4].map(() => at(hinge)).concat(at(hinge, 1, 1, -118)),
    wins: { 5: [0.3, 0.5] },
    children: <rect x="-2" y="-5" width="40" height="5" rx="1.5" fill="var(--color-ink-700)" stroke={FUR} strokeWidth="1.4" />,
  });
  out.push({
    id: "valid",
    track: [0, 1, 2, 3, 4].map(() => hidden([bx + 30, by - 26], 0.4)).concat(at([bx + 30, by - 26])),
    wins: { 5: [0.75, 0.95] },
    children: (
      <g>
        <circle r="8" fill="color-mix(in oklab, var(--color-cyan) 20%, var(--color-ink-900))" stroke={CYAN} strokeWidth="1.3" />
        <path d="M-3.5 0 -1 2.6 3.8 -2.4" fill="none" stroke={CYAN} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    ),
  });
  return out;
}

// ---------------------------------------------------------------------------
// The art.
// ---------------------------------------------------------------------------

/**
 * The art every actor reuses, drawn once and placed with <use>, which keeps the pre-rendered page
 * small. It sits in its own zero-size SVG, since a <use> can't draw from a display:none one.
 */
function Defs() {
  return (
    <svg width="0" height="0" className="absolute" aria-hidden="true" focusable="false">
      <defs>
        {/* A transaction, an envelope with its dependency triple as three cyan dots. */}
        <g id="agg-env">
          <rect x="-12" y="-8" width="24" height="16" rx="2" fill="var(--color-ink-800)" stroke="var(--color-accent-hi)" strokeWidth="1.3" />
          <path d="M-11 -7 0 1 11 -7" fill="none" stroke="var(--color-accent-hi)" strokeWidth="1.1" strokeLinejoin="round" />
          <path d="M3.5 4.5h.01M6.8 4.5h.01M10.1 4.5h.01" stroke={CYAN} strokeWidth="2.6" strokeLinecap="round" />
        </g>
        {/* A 7,740-byte signature, the scroll from the ELI5 scene, rolled at both ends. */}
        <g id="agg-scroll">
          <rect x="-14" y="-7" width="28" height="14" fill={PAPER} stroke={ROLL} strokeWidth="1" />
          <path d="M-9 -3h18M-9 0.5h18M-9 4h12" stroke={ROLL} strokeWidth="1.2" strokeDasharray="2 1.6" opacity="0.8" />
          <rect x="-18" y="-9" width="5" height="18" rx="2.5" fill="#e8d9b0" stroke={ROLL} strokeWidth="1" />
          <rect x="13" y="-9" width="5" height="18" rx="2.5" fill="#e8d9b0" stroke={ROLL} strokeWidth="1" />
        </g>
        {/* The cat's head from the courier, centred on (0, 0). */}
        <g id="agg-head" transform="translate(-31.1 -9.6)" strokeLinejoin="round">
          <path d="M26.4 10.6 26.1 2.8 29.6 5.7H32.7L36.2 2.8 35.8 10.6Q35.8 15.4 31.1 15.4T26.4 10.6Z" fill="var(--color-ink-900)" stroke={FUR} strokeWidth="1.3" />
          <ellipse cx="29.3" cy="10.2" rx="0.95" ry="1.3" fill={CYAN} />
          <ellipse cx="33" cy="10.2" rx="0.95" ry="1.3" fill={CYAN} />
        </g>
        <g id="agg-proof">
          <Proof x={0} y={0} r={14} />
        </g>
      </defs>
    </svg>
  );
}

const Envelope = () => <use href="#agg-env" />;
const Scroll = () => <use href="#agg-scroll" />;
const ProofMark = ({ r = 14 }: { r?: number }) => <use href="#agg-proof" transform={r === 14 ? undefined : `scale(${r / 14})`} />;
const CatHead = ({ s = 1.35 }: { s?: number }) => <use href="#agg-head" transform={`scale(${s})`} />;

/** A node's aggregate proof, with how many signatures it covers. */
function Gem({ n }: { n: number }) {
  return (
    <g>
      <ProofMark />
      <g key={n} className="agg-count">
        <rect x="16" y="-8" width="24" height="16" rx="8" fill="var(--color-ink-900)" stroke={CYAN} strokeWidth="1" />
        <text x="28" y="0.5" textAnchor="middle" dominantBaseline="middle" fontSize="10" fill={CYAN} className="mono">
          ×{n}
        </text>
      </g>
    </g>
  );
}

function Mover({ a, k, moving, ms, run }: { a: Actor; k: number; moving: boolean; ms: number; run: number }) {
  const to = a.track[k];
  const win = a.wins?.[k] ?? [0, 1];
  const from = k > 0 ? a.track[k - 1] : to;
  const still = !moving || (from.x === to.x && from.y === to.y && from.s === to.s && from.o === to.o && from.r === to.r);
  // Nothing to draw for an actor that is out of sight and staying there.
  if (still && to.o === 0) return null;
  const style = {
    transform: tf(to, !still),
    opacity: to.o ?? 1,
    ...(still
      ? {}
      : {
          "--agg-f": tf(from),
          "--agg-fo": from.o ?? 1,
          animationDuration: `${Math.round((win[1] - win[0]) * ms)}ms`,
          animationDelay: `${Math.round(win[0] * ms)}ms`,
        }),
  } as CSSProperties;
  return (
    <g key={still ? "still" : run} className={still ? undefined : "agg-go"} style={style} data-actor={a.id}>
      {a.children}
    </g>
  );
}

function Stage({ L, s, className }: { L: Lay; s: Player; className?: string }) {
  // Before the first step, the picture shows where step 5 ends.
  const k = s.step || AGG_LAST;
  const moving = s.step > 0 && !s.arrived && !s.reduced;
  const ms = s.step ? AGG_RUN_MS[s.step - 1] / speedOf(s) : 0;
  const merged = s.step === 0 || done(s) >= 3;
  const list = actors(L, merged, moving && s.step === 4 ? "run" : "stand", s.step === 4 && moving);
  const [nw, nh] = L.nodeSize;
  const folding = moving && s.step === 3;
  const b = L.block;
  const [bx, by] = L.box;
  return (
    <svg
      viewBox={`0 0 ${L.w} ${L.h}`}
      className={cx("block h-auto w-full overflow-visible", className)}
      aria-hidden="true"
      focusable="false"
      data-testid={`agg-stage-${L.key}`}
      fontFamily="inherit"
    >
      {L.labels.map((l) => (
        <text key={l.text} x={l.at[0]} y={l.at[1]} textAnchor={l.anchor} fontSize="11" fill="var(--color-accent-hi)" className="uppercase" letterSpacing="0.08em">
          {l.text}
        </text>
      ))}
      {/* Users, six small cats. */}
      {Array.from({ length: SIGS }, (_, i) => {
        const [x, y] = L.user(i);
        return (
          <g key={i} transform={`translate(${x} ${y})`}>
            <CatHead s={1.15 * L.art} />
          </g>
        );
      })}
      {/* The mempool nodes. Each one ticks once a second while it folds. */}
      {L.node.map(([x, y], j) => (
        <g key={j}>
          <rect
            x={x - nw / 2}
            y={y - nh / 2}
            width={nw}
            height={nh}
            rx="12"
            fill="var(--color-ink-850)"
            stroke={folding ? "var(--color-cyan)" : "var(--color-ink-600)"}
            strokeOpacity={folding ? 0.7 : 1}
            strokeWidth="1.2"
            className="transition-[stroke] duration-300"
          />
          <text x={x - nw / 2 + 10} y={y - nh / 2 + 16} fontSize="11" fill="var(--color-subtle)">
            node {j ? "B" : "A"}
          </text>
          <g transform={`translate(${x + nw / 2 - 22} ${y - nh / 2 + 12})`}>
            <g key={folding ? s.run : "still"} className={cx(folding && "agg-tick")}>
              <circle r="6" fill="none" stroke={folding ? CYAN : "var(--color-ink-500)"} strokeWidth="1.2" />
              <path d="M0 -3.4V0L2.2 1.6" fill="none" stroke={folding ? CYAN : "var(--color-ink-500)"} strokeWidth="1.2" strokeLinecap="round" />
            </g>
            <text x="-10" y="0.5" textAnchor="end" dominantBaseline="middle" fontSize="10" fill="var(--color-subtle)">
              1 s
            </text>
          </g>
        </g>
      ))}
      {/* The block, a header and a body. */}
      <rect x={b.x} y={b.y} width={b.w} height={b.h} rx="12" fill="var(--color-ink-850)" stroke="var(--color-ink-500)" strokeWidth="1.2" />
      <path d={`M${b.x} ${b.y + b.head}H${b.x + b.w}`} stroke="var(--color-ink-500)" strokeWidth="1.2" />
      <text x={b.x + 10} y={b.y + 16} fontSize="10" fill="var(--color-subtle)">
        header
      </text>
      <text x={b.x + 10} y={b.y + b.head + 16} fontSize="10" fill="var(--color-subtle)">
        transactions
      </text>
      {/* The validators' box, under its lid. */}
      <g>
        <rect x={bx - 18} y={by - 12} width="36" height="24" rx="2" fill="var(--color-ink-800)" stroke={FUR} strokeWidth="1.4" />
        <text x={bx} y={by + 28} textAnchor="middle" fontSize="11" fill="var(--color-subtle)">
          validators
        </text>
      </g>
      {list.map((a) =>
        a.id === "box-cat" ? (
          // The head sits behind the front of the box, so it rises out of it.
          <g key={a.id}>
            <clipPath id={`agg-box-clip-${L.key}`}>
              <rect x={bx - 30} y={by - 60} width="60" height="48" />
            </clipPath>
            <g clipPath={`url(#agg-box-clip-${L.key})`}>
              <Mover a={a} k={k} moving={moving} ms={ms} run={s.run} />
            </g>
          </g>
        ) : (
          <Mover key={a.id} a={a} k={k} moving={moving} ms={ms} run={s.run} />
        ),
      )}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// The tally, the caption and the section.
// ---------------------------------------------------------------------------

function Tally({ s }: { s: Player }) {
  const k = s.step || AGG_LAST;
  const shown = k >= AGG_LAST;
  const grow = s.step === AGG_LAST && !s.arrived && !s.reduced;
  const ms = AGG_RUN_MS[AGG_LAST - 1] / speedOf(s);
  const rows = [
    { label: "Today on ETC", gas: SIGS * TODAY_GAS, bytes: `${num(SIGS * SIG_BYTES)} bytes of signatures in calldata`, bar: "bg-warn", tone: "text-warn" },
    { label: "With EIP-8288, as written", gas: SIGS * AGG_GAS, bytes: "no signature bytes on chain", bar: "bg-cyan", tone: "text-cyan" },
  ];
  const max = rows[0].gas;
  return (
    <div className="px-4 py-3 sm:px-5" data-testid="agg-tally" data-shown={shown ? "1" : "0"}>
      <p className="text-xs text-subtle">
        {SIGS} signatures, about {num(TODAY_GAS)} gas each today against about {num(AGG_GAS)} with EIP-8288
      </p>
      <dl className="mt-2 space-y-2">
        {rows.map((r) => (
          <div key={r.label} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-1">
            <dt className="text-[13px] text-fg">{r.label}</dt>
            <dd className={cx("mono text-right text-xs", r.tone)} data-testid="agg-gas">
              ≈{num(r.gas)} gas
            </dd>
            <dd className="col-span-2">
              <div className="h-2 rounded-full bg-ink-800">
                <div
                  key={grow ? s.run : "still"}
                  className={cx("h-2 origin-left rounded-full transition-opacity duration-300", r.bar, grow && "agg-bar", !shown && "opacity-25")}
                  style={{ width: `${(r.gas / max) * 100}%`, ...(grow ? { animationDuration: `${Math.round(ms * 0.6)}ms`, animationDelay: `${Math.round(ms * 0.35)}ms` } : {}) }}
                />
              </div>
              <div className="mt-1 text-[11px] text-subtle">{r.bytes}</div>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function Caption({ s }: { s: Player }) {
  const step = s.step ? AGG_STEPS[s.step - 1] : null;
  return (
    <p aria-live="polite" data-testid="agg-caption" data-step={s.step} className="min-h-[4lh] min-w-0 flex-1 text-[13px] leading-snug text-fg sm:min-h-[3lh]">
      {step ? (
        <>
          <span className="mono mr-1.5 inline-block rounded bg-ink-700 px-1.5 py-px text-[11px] text-muted">
            <span aria-hidden>
              {step.n}/{AGG_LAST}
            </span>
            <span className="sr-only">
              Step {step.n} of {AGG_LAST}.
            </span>
          </span>
          {step.caption}
        </>
      ) : s.reduced ? (
        <span className="text-muted">Five steps, shown here at the end. Step through them with the arrows.</span>
      ) : (
        <span className="text-muted">Five steps, shown here at the end. Press play to watch six signatures fold into one proof, or step through with the arrows.</span>
      )}
    </p>
  );
}

function Quote({ children }: { children: ReactNode }) {
  return <blockquote className="my-3 border-l-2 border-cyan/50 pl-3 text-[13px] leading-relaxed text-fg italic">{children}</blockquote>;
}

type Option = { name: string; fork: boolean; verdict: string; tone: "cyan" | "warn" | "bad"; text: ReactNode };

const OPTIONS: Option[] = [
  {
    name: "Fork in both EIPs",
    fork: true,
    verdict: "the clean answer",
    tone: "cyan",
    text: "EIP-8141 and EIP-8288 together, through ECIPs and a hard fork. Every client would also need STARK aggregation in its mempool, which is new work for all of them. A long way off.",
  },
  {
    name: "Sign a batch once",
    fork: false,
    verdict: "one signer only",
    tone: "warn",
    text: "A signer signs the Merkle root of many messages, so each transfer carries the 7,740-byte signature once per batch and a short Merkle path per item. It helps an exchange or a payroll, not many users.",
  },
  {
    name: "Relay many in one transaction",
    fork: false,
    verdict: "a small saving",
    tone: "warn",
    text: `A relayer submits several signed ${LEDGER_SYMBOL} transfers in one call. That saves the 21,000 base cost per transaction, and each signature still costs its full calldata and verification.`,
  },
  {
    name: "Prove the batch with a STARK on chain",
    fork: false,
    verdict: "doesn't fit",
    tone: "bad",
    text: "EIP-8288 puts such proofs at 128 KB to 512 KB. That's 2 to 8 million gas of calldata alone, against ETC's 8,000,000 gas block limit.",
  },
  {
    name: "Wrap it in a SNARK",
    fork: false,
    verdict: "ruled out",
    tone: "bad",
    text: "A Groth16 proof on ETC's BN254 precompiles verifies for a few hundred thousand gas. It rests on elliptic-curve pairings, which a quantum computer breaks, so the result is no longer quantum-secure.",
  },
];

const toneClass = {
  cyan: "bg-cyan/10 text-cyan ring-cyan/35",
  warn: "bg-warn/10 text-warn ring-warn/30",
  bad: "bg-bad/10 text-bad ring-bad/30",
};

function Stat({ value, label, tone }: { value: string; label: string; tone?: "cyan" }) {
  return (
    <div className={cx("rounded-xl px-3 py-2.5 ring-1 ring-inset", tone ? "bg-cyan/[0.05] ring-cyan/30" : "bg-ink-900/70 ring-white/[0.07]")}>
      <div className={cx("mono text-lg leading-tight", tone ? "text-cyan" : "text-fg")}>{value}</div>
      <div className="mt-0.5 text-xs leading-snug text-muted">{label}</div>
    </div>
  );
}

export function Aggregation() {
  const figure = useRef<HTMLElement>(null);
  const { s, dispatch } = usePlayer(figure, TIMING);
  const cur = s.step;
  return (
    <section id="aggregation" aria-labelledby="agg-title" className="scroll-mt-20 [contain-intrinsic-size:auto_2400px] [content-visibility:auto]" data-testid="agg">
      <h2 id="agg-title" className="text-2xl font-semibold tracking-[-0.03em] text-fg sm:text-3xl">
        Aggregation
      </h2>
      <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-muted">
        A leanSPHINCS signature is {num(SIG_BYTES)} bytes, about 119 times a {ECDSA_BYTES}-byte ECDSA signature, and on ETC
        every node stores and checks each one. Ethereum's plan, <A href={LINKS.eip8288}>EIP-8288</A>, keeps the signatures off
        chain and puts one proof in each block instead. None of it works on ETC yet.
      </p>

      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4" data-testid="agg-stats">
        <Stat value={`${num(SIG_BYTES)} B`} label={`per signature, against ${ECDSA_BYTES} for ECDSA`} />
        <Stat value={`≈${num(CALLDATA_GAS)}`} label="gas of calldata per signature on ETC" />
        <Stat value={`≈${num(VERIFY_GAS)}`} label="gas to verify it on ETC" />
        <Stat value={`≈${num(AGG_GAS)}`} label="gas per signature with EIP-8288, as written" tone="cyan" />
      </div>

      <figure
        ref={figure}
        className="mt-4 overflow-clip rounded-2xl bg-ink-900/70 ring-1 ring-white/[0.07] ring-inset"
        aria-labelledby="agg-figcaption"
        data-testid="agg-figure"
        data-step={cur}
        data-playing={s.playing ? "1" : "0"}
        data-arrived={s.arrived ? "1" : "0"}
        data-reduced={s.reduced ? "1" : "0"}
      >
        <Defs />
        <figcaption id="agg-figcaption" className="sr-only">
          How EIP-8288 aggregates signatures, in five steps. Six users send transactions to two mempool nodes, the nodes fold
          the signatures into proofs and merge them, and the block carries one proof and no signatures.
        </figcaption>
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_19rem]">
          <div className="min-w-0">
            <div className="px-3 pt-4 pb-2 sm:px-5">
              <Stage L={WIDE} s={s} className="hidden md:block" />
              <Stage L={TALL} s={s} className="mx-auto max-w-[26rem] md:hidden" />
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 px-4 pb-3 text-[11px] text-subtle sm:px-5" aria-hidden>
              <span className="inline-flex items-center gap-1.5">
                <svg viewBox="-13 -9 26 18" className="h-3 w-4">
                  <Envelope />
                </svg>
                transaction, with its dependency triple
              </span>
              <span className="inline-flex items-center gap-1.5">
                <svg viewBox="-19 -10 38 20" className="h-3 w-5">
                  <Scroll />
                </svg>
                signature, {num(SIG_BYTES)} bytes
              </span>
              <span className="inline-flex items-center gap-1.5">
                <svg viewBox="-15 -15 30 30" className="size-3">
                  <ProofMark />
                </svg>
                recursive STARK
              </span>
            </div>
            <div className="border-y border-white/[0.08] bg-ink-900 px-3 py-2.5 sm:px-5" data-testid="agg-player">
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:gap-4">
                <Caption s={s} />
                <PlayerControls s={s} dispatch={dispatch} last={AGG_LAST} prefix="agg" />
              </div>
            </div>
            <Tally s={s} />
          </div>
          <ol className="space-y-1 border-t border-white/[0.06] px-3 py-3 lg:border-t-0 lg:border-l lg:py-4" data-testid="agg-steps">
            {AGG_STEPS.map((st) => {
              const status = st.n === cur ? "active" : st.n < cur ? "past" : "future";
              const active = status === "active";
              return (
                <li
                  key={st.n}
                  data-testid={`agg-step-${st.n}`}
                  data-status={status}
                  className={cx("flex gap-2.5 rounded-lg px-2 py-1.5 ring-1 transition-colors duration-300", active ? "bg-cyan/[0.07] ring-cyan/35" : "ring-transparent")}
                >
                  <span
                    className={cx(
                      "mono mt-px inline-flex size-4 shrink-0 items-center justify-center rounded-full text-[9px] transition-colors duration-300",
                      active ? "bg-cyan font-semibold text-ink-950" : status === "past" ? "bg-ink-600 text-fg" : "bg-ink-700 text-muted",
                    )}
                    aria-hidden
                  >
                    {st.n}
                  </span>
                  <div className="min-w-0 text-[13px] leading-snug">
                    <div className={cx("text-xs font-medium", active ? "text-cyan" : "text-accent-hi")}>{st.title}</div>
                    <div className="text-muted">{st.caption}</div>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </figure>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl p-4 ring-1 ring-white/[0.07] ring-inset sm:p-5">
          <h3 className="text-sm font-semibold text-fg">The Plan on Ethereum</h3>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
            <A href={LINKS.eip8288}>EIP-8288</A>, “In-mempool signature and proof aggregation”, is a draft by Vitalik Buterin
            and Thomas Coratger from 2026-06-03. It starts from the cost.
          </p>
          <Quote>Current proposals for hash-based signatures are in the range of ~2-3 kB and ~150,000 to 200,000 gas to verify.</Quote>
          <p className="text-[13px] leading-relaxed text-muted">Its answer is that the signatures never reach the chain. Instead</p>
          <Quote>the block contains one single recursive STARK that proves their existence</Quote>
          <p className="text-[13px] leading-relaxed text-muted">
            The proof is hash-based too, so aggregation stays post-quantum. The dependency frame is a new frame mode for{" "}
            <A href={LINKS.eip8141}>EIP-8141</A>, so EIP-8288 needs frame transactions first.
          </p>
        </div>
        <div className="rounded-2xl p-4 ring-1 ring-white/[0.07] ring-inset sm:p-5" data-testid="agg-cost">
          <h3 className="text-sm font-semibold text-fg">The Cost, as Written</h3>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
            A transaction pays {num(FRAME_GAS)} gas per leanSPHINCS signature for its dependency frame, plus{" "}
            <span className="mono text-xs text-fg">LEANSTARK_VERIFICATION_GAS</span>, {num(STARK_GAS)}, per dependency. That's
            about {num(AGG_GAS)} gas for one signature against about {num(TODAY_GAS)} on ETC today, with no calldata for the
            signature. The draft doesn't add it up itself. It does say why it's cheap.
          </p>
          <Quote>
            It is much cheaper than the onchain costs for similar operations because the cost is only paid by the builder and
            the mempool, not by all validating nodes.
          </Quote>
          <p className="text-[13px] leading-relaxed text-muted">
            Still open in the draft are the recursion circuit, the dependency hash (BLAKE2s today, BLAKE3 the likely
            replacement), the aggregated verification key and more DoS exposure in the mempool.
          </p>
        </div>
      </div>

      <div className="mt-4 rounded-2xl p-4 ring-1 ring-white/[0.07] ring-inset sm:p-5">
        <h3 className="text-sm font-semibold text-fg">What ETC Can Do</h3>
        <ul className="mt-3 grid gap-3 md:grid-cols-2" data-testid="agg-options">
          {OPTIONS.map((o) => (
            <li key={o.name} className={cx("rounded-xl bg-ink-900/60 px-3 py-2.5 ring-1 ring-white/[0.06] ring-inset", o.fork && "md:col-span-2")} data-fork={o.fork ? "1" : "0"}>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-[13px] font-medium text-fg">{o.name}</span>
                <span className={cx("rounded-full px-2 py-px text-[11px] ring-1 ring-inset", o.fork ? "bg-accent/10 text-accent-hi ring-accent/35" : "bg-ink-800 text-muted ring-ink-600")}>
                  {o.fork ? "needs a hard fork" : "works today, no fork"}
                </span>
                <span className={cx("rounded-full px-2 py-px text-[11px] ring-1 ring-inset", toneClass[o.tone])}>{o.verdict}</span>
              </div>
              <p className="mt-1 text-[13px] leading-relaxed text-muted">{o.text}</p>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[13px] leading-relaxed text-fg">So for now skinnyCAT pays full price for every signature, and we say so.</p>
      </div>
    </section>
  );
}
