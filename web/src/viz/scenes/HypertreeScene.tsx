// Scene 6. The hypertree of this signature: FORS, then the bottom, middle and top trees, each layer's
// one-time key signing the root below. Then the scale of the whole structure, and the index bits.
import { useRef } from "react";
import { keyOf, LAYER_HEIGHTS } from "../data/explain";
import { SceneFrame, useScene } from "../frame";
import { useWidth } from "../hooks";
import { useSample } from "../sample";
import { C, fmt, GROUP_COLOR, shortHex } from "../theme";
import { clamp, ease, lerp, span } from "../timeline";
import { rich } from "../rich";
import "../viz.css";

const BEATS = [0, 2.2, 4.6, 7.0, 10.0, 13.2] as const;
const DUR = 16;
const LAYER_COLORS = [GROUP_COLOR.bottom, GROUP_COLOR.middle, GROUP_COLOR.top];
const LAYER_NAMES = ["bottom", "middle", "top"];

interface TreeGeo {
  apex: { x: number; y: number };
  baseY: number;
  half: number;
  h: number;
  leaf: number;
}

interface Geo {
  w: number;
  h: number;
  trees: TreeGeo[]; // bottom, middle, top
  fors: { x: number; y: number; spread: number };
  labelLeft: boolean;
}

function geometry(compact: boolean, leaves: number[]): Geo {
  const w = compact ? 360 : 760;
  const h = compact ? 600 : 580;
  const spec = compact
    ? [
        { y: 412, base: 484, half: 78 },
        { y: 262, base: 350, half: 112 },
        { y: 54, base: 196, half: 158 },
      ]
    : [
        { y: 414, base: 486, half: 96 },
        { y: 262, base: 356, half: 156 },
        { y: 50, base: 196, half: 262 },
      ];
  const trees: TreeGeo[] = [];
  // Top first, each lower tree hanging under the lit leaf of the one above.
  let ax = w / 2;
  for (let l = 2; l >= 0; l--) {
    const s = spec[l];
    const margin = compact ? 12 : 40;
    const x = clamp(ax, margin + s.half, w - margin - s.half);
    const t: TreeGeo = { apex: { x, y: s.y }, baseY: s.base, half: s.half, h: LAYER_HEIGHTS[l], leaf: leaves[l] };
    trees[l] = t;
    ax = x - s.half + ((leaves[l] + 0.5) / 2 ** t.h) * 2 * s.half;
  }
  const fx = clamp(ax, 100, w - 100);
  return { w, h, trees, fors: { x: fx, y: compact ? 520 : 518, spread: compact ? 150 : 190 }, labelLeft: !compact };
}

function nodeAt(t: TreeGeo, z: number, j: number) {
  const width = 2 * t.half * (1 - z / t.h);
  return {
    x: t.apex.x + ((j + 0.5) / 2 ** (t.h - z) - 0.5) * width,
    y: t.baseY - (z / t.h) * (t.baseY - t.apex.y),
  };
}

type Box = [number, number, number];

function camera(g: Geo, t: number): string {
  // Each keyframe is a center and a width; height follows the stage's aspect.
  const b = g.trees[0];
  const m = g.trees[1];
  const k: Box[] = [
    [g.fors.x, g.fors.y + 6, g.w * (g.labelLeft ? 0.42 : 0.66)],
    [lerp(b.apex.x, g.fors.x, 0.3), (b.apex.y + g.fors.y) / 2 + 20, g.w * (g.labelLeft ? 0.62 : 0.84)],
    [lerp(m.apex.x, g.w / 2, 0.4), (m.apex.y + g.fors.y) / 2 + 10, g.w * (g.labelLeft ? 0.85 : 0.94)],
    [g.w / 2, g.h / 2, g.w],
  ];
  const seg = [0, ease(t, BEATS[1], BEATS[1] + 1.2), ease(t, BEATS[2], BEATS[2] + 1.2), ease(t, BEATS[3], BEATS[3] + 1.4)];
  let cur = k[0];
  for (let i = 1; i < 4; i++) cur = cur.map((v, j) => lerp(v, k[i][j], seg[i])) as Box;
  const [cx, cy, vw] = cur;
  const vh = (vw * g.h) / g.w;
  return `${cx - vw / 2} ${cy - vh / 2} ${vw} ${vh}`;
}

function Tree({ t, color, appear, climb, label, sub, root, compact }: {
  t: TreeGeo; color: string; appear: number; climb: number; label: string; sub: string; root: Uint8Array | null; compact: boolean;
}) {
  if (appear <= 0) return null;
  const lvl = climb * t.h;
  let d = "";
  for (let z = 0; z < t.h && z < lvl; z++) {
    const f = Math.min(1, lvl - z);
    const a = nodeAt(t, z, t.leaf >> z);
    const b = nodeAt(t, z + 1, t.leaf >> (z + 1));
    d += `M${a.x} ${a.y}L${lerp(a.x, b.x, f)} ${lerp(a.y, b.y, f)}`;
  }
  const leaf = nodeAt(t, 0, t.leaf);
  const done = climb >= 1;
  const fs = compact ? 10.5 : 11.5;
  // Labels sit left of the tree, or right of it when the left edge is too close.
  const onRight = !compact && t.apex.x - t.half < 200;
  const labelX = compact ? t.apex.x - 14 : onRight ? t.apex.x + t.half + 10 : t.apex.x - t.half - 10;
  const labelAnchor = compact ? "end" : onRight ? "start" : "end";
  return (
    <g opacity={appear}>
      <path
        d={`M${t.apex.x} ${t.apex.y}L${t.apex.x + t.half} ${t.baseY}H${t.apex.x - t.half}Z`}
        fill={color}
        fillOpacity={0.07}
        stroke={color}
        strokeOpacity={0.45}
        strokeWidth={1}
        strokeLinejoin="round"
      />
      {/* A hint of the leaves along the base. */}
      <line x1={t.apex.x - t.half} x2={t.apex.x + t.half} y1={t.baseY + 4} y2={t.baseY + 4} stroke={color} strokeOpacity={0.4} strokeWidth={3} strokeDasharray="1 1.4" />
      {d && (
        <>
          <path d={d} stroke={C.cyan} strokeWidth={6} strokeOpacity={0.25} fill="none" filter="url(#sx-h-blur)" />
          <path d={d} stroke={C.cyan} strokeWidth={1.8} fill="none" strokeLinecap="round" />
        </>
      )}
      {/* The one-time key at the lit leaf: a tiny 4-chain glyph. */}
      <g transform={`translate(${leaf.x} ${leaf.y})`}>
        <rect x={-6} y={-5} width={12} height={12} rx={3} fill={C.ink900} stroke={C.cyan} strokeWidth={1.3} />
        {[0, 1, 2, 3].map((i) => (
          <rect key={i} x={-4 + i * 2.2} y={-3 + (i % 3)} width={1.4} height={7 - (i % 3)} fill={C.cyan} />
        ))}
      </g>
      <rect
        x={t.apex.x - 6}
        y={t.apex.y - 6}
        width={12}
        height={12}
        rx={3}
        fill={done ? C.cyan : C.ink850}
        stroke={done ? C.cyan : color}
        strokeWidth={1.4}
      />
      <text x={t.apex.x + 12} y={t.apex.y - 6} fontSize={fs} fill={done ? C.cyan : C.muted} className="mono">
        {root && done ? shortHex(root, 3, 2) : ""}
      </text>
      <text
        x={labelX}
        y={compact ? t.apex.y + 4 : t.baseY - 4}
        textAnchor={labelAnchor}
        fontSize={fs + 0.5}
        fill={color}
        fontWeight={600}
      >
        {label}
      </text>
      <text
        x={labelX}
        y={compact ? t.apex.y + 18 : t.baseY + 11}
        textAnchor={labelAnchor}
        fontSize={fs - 0.5}
        fill={C.subtle}
      >
        {sub}
      </text>
    </g>
  );
}

function Signs({ from, to, p, color }: { from: { x: number; y: number }; to: { x: number; y: number }; p: number; color: string }) {
  if (p <= 0) return null;
  const y1 = from.y + 8;
  const y2 = to.y - 8;
  const my = (y1 + y2) / 2;
  const d = `M${from.x} ${y1}C${from.x} ${my} ${to.x} ${my} ${to.x} ${y2}`;
  return (
    <g>
      <path d={d} stroke={color} strokeWidth={1.4} fill="none" strokeDasharray="3 3" pathLength={1} strokeDashoffset={0} opacity={p} />
      <text x={(from.x + to.x) / 2 + 8} y={my + 4} fontSize={10.5} fill={color} opacity={p}>
        signs
      </text>
    </g>
  );
}

export default function HypertreeScene() {
  const { ex } = useSample();
  const box = useRef<HTMLDivElement>(null);
  const width = useWidth(box);
  const compact = width > 0 && width < 560;
  const keys = [0, 1, 2].map((l) => keyOf(l, ex.idx));
  const g = geometry(compact, keys.map((k) => k.leaf));
  const { ref, tl, copy } = useScene("hypertree", BEATS, DUR);
  const t = tl.t;

  const forsIn = span(t, 0.1, 0.9);
  const forsMerge = ease(t, 0.6, 1.8);
  const appear = [span(t, BEATS[1], BEATS[1] + 0.6), span(t, BEATS[2], BEATS[2] + 0.6), span(t, BEATS[3], BEATS[3] + 0.6)];
  const climbs = [span(t, BEATS[1] + 0.8, BEATS[2] - 0.1), span(t, BEATS[2] + 0.8, BEATS[3] - 0.1), span(t, BEATS[3] + 0.8, BEATS[4] - 0.4)];
  const signs = [span(t, BEATS[1] + 0.3, BEATS[1] + 0.9), span(t, BEATS[2] + 0.3, BEATS[2] + 0.9), span(t, BEATS[3] + 0.3, BEATS[3] + 0.9)];
  const bands = ease(t, BEATS[4], BEATS[4] + 1.2);
  const bits = ease(t, BEATS[5], BEATS[5] + 1.2);
  const treesOp = 1 - bands;

  const vb = camera(g, t);
  const fx = g.fors.x;
  const fy = g.fors.y;
  const bottomLeaf = nodeAt(g.trees[0], 0, g.trees[0].leaf);

  const label = (l: number) => `${LAYER_NAMES[l][0].toUpperCase()}${LAYER_NAMES[l].slice(1)} tree`;
  const sub = (l: number) =>
    l === 2 ? "height 10, 1,024 keys" : `height 8, 256 keys${compact ? "" : `, tree ${fmt(keys[l].tree)}`}`;

  return (
    <SceneFrame sceneRef={ref} tl={tl} copy={copy}>
      <div ref={box} className="px-2 py-3 sm:px-4 sm:py-4">
        <div className="relative">
          <svg viewBox={vb} role="img" aria-label={copy.figure} className="block h-auto w-full select-none" style={{ aspectRatio: `${g.w} / ${g.h}` }}>
            <defs>
              <filter id="sx-h-blur" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="3" />
              </filter>
            </defs>
            <g opacity={treesOp}>
              {/* FORS: 24 tiny trees folding into one key. */}
              <g opacity={forsIn}>
                {Array.from({ length: 24 }, (_, k) => {
                  const x = fx - g.fors.spread / 2 + (k + 0.5) * (g.fors.spread / 24);
                  const y = fy + 26;
                  return (
                    <g key={k}>
                      <path d={`M${x} ${y}l3 9h-6z`} fill={GROUP_COLOR.fors} fillOpacity={0.5} />
                      <line x1={x} y1={y} x2={lerp(x, fx, forsMerge)} y2={lerp(y, fy + 7, forsMerge)} stroke={C.cyan} strokeOpacity={0.35} strokeWidth={0.7} />
                    </g>
                  );
                })}
                <rect x={fx - 7} y={fy - 7} width={14} height={14} rx={3.5} fill={forsMerge >= 1 ? C.cyan : C.ink850} stroke={GROUP_COLOR.fors} strokeWidth={1.4} />
                <text x={fx + 14} y={fy + 4} fontSize={compact ? 10.5 : 11} fill={GROUP_COLOR.fors} fontWeight={600}>
                  FORS key
                </text>
                <text x={fx - 14} y={fy + 4} fontSize={compact ? 10 : 11} fill={C.subtle} textAnchor="end" className="mono">
                  {shortHex(ex.forsPk, 3, 2)}
                </text>
                <text x={fx} y={fy + 50} fontSize={10} fill={C.subtle} textAnchor="middle">
                  24 FORS trees, signing the message
                </text>
              </g>
              <Signs from={bottomLeaf} to={{ x: fx, y: fy }} p={signs[0]} color={C.cyan} />
              {[0, 1, 2].map((l) => (
                <Tree
                  key={l}
                  t={g.trees[l]}
                  color={LAYER_COLORS[l]}
                  appear={appear[l]}
                  climb={climbs[l]}
                  label={label(l)}
                  sub={sub(l)}
                  root={ex.layers[l].root}
                  compact={compact}
                />
              ))}
              <Signs from={nodeAt(g.trees[1], 0, g.trees[1].leaf)} to={g.trees[0].apex} p={signs[1]} color={C.cyan} />
              <Signs from={nodeAt(g.trees[2], 0, g.trees[2].leaf)} to={g.trees[1].apex} p={signs[2]} color={C.cyan} />
              {climbs[2] >= 1 && (
                <g className="sx-pop">
                  <rect x={g.trees[2].apex.x - 9} y={g.trees[2].apex.y - 9} width={18} height={18} rx={4.5} fill={C.cyan} className="sx-glow" />
                  <text x={g.trees[2].apex.x + (compact ? 14 : -16)} y={g.trees[2].apex.y + (compact ? 16 : 4)} fontSize={compact ? 11 : 12} fill={C.cyan} textAnchor={compact ? "start" : "end"} fontWeight={600}>
                    PK.root
                  </text>
                </g>
              )}
            </g>
          </svg>
          {bands > 0 && <Scale ex={ex} p={bands} bits={bits} compact={compact} />}
        </div>
      </div>
    </SceneFrame>
  );
}

/** Four bands, one per level of the structure, with this signature's place in each. */
function Scale({ ex, p, bits, compact }: { ex: ReturnType<typeof useSample>["ex"]; p: number; bits: number; compact: boolean }) {
  const idx = ex.idx;
  const rows = [
    { name: "Top tree keys", count: 1024, at: idx >>> 16, sub: "one tree, PK.root on top", color: GROUP_COLOR.top },
    { name: "Middle trees", count: 1024, at: idx >>> 16, sub: "one under each top key", color: GROUP_COLOR.middle },
    { name: "Bottom trees", count: 262_144, at: idx >>> 8, sub: "one under each middle key", color: GROUP_COLOR.bottom },
    { name: "FORS instances", count: 67_108_864, at: idx, sub: "one under each bottom key", color: GROUP_COLOR.fors },
  ];
  const parts = [
    { bits: 10, value: idx >>> 16, label: "top leaf", color: GROUP_COLOR.top },
    { bits: 8, value: (idx >>> 8) & 255, label: "middle leaf", color: GROUP_COLOR.middle },
    { bits: 8, value: idx & 255, label: "bottom leaf", color: GROUP_COLOR.bottom },
  ];
  let bitPos = 0;
  return (
    <div className="absolute inset-0 flex flex-col justify-center gap-4 px-1 sm:px-6" style={{ opacity: p }}>
      <div style={{ opacity: bits, transform: `translateY(${(1 - bits) * 8}px)` }} aria-hidden={bits === 0}>
        <p className="text-[11px] tracking-wide text-subtle uppercase">
          Index from the digest <span className="mono text-fg normal-case">{fmt(idx)}</span>
        </p>
        <div className="mono mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[12px] sm:text-[13px]">
          {parts.map((pt) => {
            const s = idx.toString(2).padStart(26, "0").slice(bitPos, bitPos + pt.bits);
            bitPos += pt.bits;
            return (
              <span key={pt.label} className="flex flex-col">
                <span style={{ color: pt.color }} className="tracking-[0.08em]">
                  {s}
                </span>
                <span className="text-[10.5px] text-subtle">
                  {pt.label} <span className="text-fg">{pt.value}</span>
                </span>
              </span>
            );
          })}
        </div>
      </div>
      <div className="relative space-y-3.5">
        {rows.map((r, i) => {
          const q = span(p, i * 0.15, i * 0.15 + 0.4);
          const x = ((r.at + 0.5) / r.count) * 100;
          return (
            <div key={r.name} style={{ opacity: q }}>
              <div className="flex items-baseline justify-between gap-2 text-[12px] sm:text-[13px]">
                <span className="font-semibold" style={{ color: r.color }}>
                  {r.name}
                </span>
                <span className="mono text-fg tabular-nums">
                  {fmt(Math.round(r.count * q))}
                  {!compact ? <span className="text-subtle"> = {rich(`2^${Math.log2(r.count)}`)}</span> : null}
                </span>
              </div>
              <div className="relative mt-1 h-3 overflow-hidden rounded-[3px]" style={{ background: `color-mix(in oklab, ${r.color} 16%, transparent)` }}>
                {r.count > 1 && r.count <= 1024 && (
                  <div
                    className="absolute inset-0"
                    style={{ backgroundImage: `repeating-linear-gradient(to right, color-mix(in oklab, ${r.color} 45%, transparent) 0 1px, transparent 1px ${100 / 32}%)` }}
                  />
                )}
                <div className="absolute inset-y-0 w-[3px] -translate-x-1/2 rounded-full bg-cyan shadow-[0_0_10px_var(--color-cyan)]" style={{ left: `${x}%` }} />
              </div>
              <p className="mt-0.5 flex justify-between gap-2 text-[11px] text-subtle">
                <span>{r.sub}</span>
                <span className="mono shrink-0">
                  this one <span className="text-cyan">{fmt(r.at)}</span>
                </span>
              </p>
            </div>
          );
        })}
      </div>
      <p className="text-[12px] leading-snug text-muted">
        {rich(
          "Up to 2^30 signatures land on 2^26 FORS instances, 16 each on average. That is why the bottom of the structure is a few-time signature. Every one-time key above it always signs the same value, so using it again repeats the same signature.",
        )}
      </p>
    </div>
  );
}
