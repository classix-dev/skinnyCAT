// Scene 5. FORS from the real digest: 240 bits, 24 picks, 24 trees of 1,024 leaves, one key.
import { useRef } from "react";
import { FORS_HEIGHT, FORS_TREES } from "../data/explain";
import { SceneFrame, Stage, useScene } from "../frame";
import { useWidth } from "../hooks";
import { useSample } from "../sample";
import { C, shortHex } from "../theme";
import { ease, lerp, span } from "../timeline";
import "../viz.css";

const BEATS = [0, 1.6, 3.6, 6.0, 9.0] as const;
const DUR = 11.6;
const A = FORS_HEIGHT;

interface Geo {
  w: number;
  h: number;
  /** Bit strip: groups per row, bit cell size. */
  groupsPerRow: number;
  bit: number;
  stripX0: number;
  stripY0: number;
  stripRowH: number;
  /** Trees: per row, cell width, triangle size, first row's apex y, row spacing. */
  treesPerRow: number;
  treeCell: number;
  treeX0: number;
  treeW: number;
  treeH: number;
  treeY0: number;
  treeRowH: number;
  pk: { x: number; y: number };
}

function geometry(compact: boolean): Geo {
  if (compact) {
    return {
      w: 360, h: 640, groupsPerRow: 6, bit: 4.6, stripX0: 14, stripY0: 34, stripRowH: 40,
      treesPerRow: 6, treeCell: 56, treeX0: 12, treeW: 48, treeH: 62, treeY0: 232, treeRowH: 86,
      pk: { x: 180, y: 600 },
    };
  }
  return {
    w: 760, h: 470, groupsPerRow: 24, bit: 2.5, stripX0: 20, stripY0: 34, stripRowH: 0,
    treesPerRow: 12, treeCell: 60, treeX0: 20, treeW: 50, treeH: 70, treeY0: 140, treeRowH: 112,
    pk: { x: 380, y: 432 },
  };
}

export default function ForsScene() {
  const { ex } = useSample();
  const box = useRef<HTMLDivElement>(null);
  const width = useWidth(box);
  const compact = width > 0 && width < 560;
  const g = geometry(compact);
  const { ref, tl, copy } = useScene("fors", BEATS, DUR);
  const t = tl.t;

  const bitsShown = span(t, 0.1, 1.3);
  const split = ease(t, BEATS[1], BEATS[1] + 1.0);
  const nums = span(t, BEATS[1] + 0.8, BEATS[1] + 1.6);
  const flow = span(t, BEATS[2], BEATS[2] + 1.6);
  const climb = span(t, BEATS[3], BEATS[3] + 2.4);
  const merge = ease(t, BEATS[4], BEATS[4] + 1.6);

  const groupW = A * g.bit;
  const gap = 6 * split;
  const rowSpan = g.groupsPerRow * groupW + (g.groupsPerRow - 1) * 6;
  const stripLeft = (g.w - rowSpan) / 2;
  const groupX = (k: number) => {
    const col = k % g.groupsPerRow;
    // Before the split the groups sit flush and centered; after, 6 units apart.
    const flush = (g.w - g.groupsPerRow * groupW) / 2 + col * groupW;
    const spaced = stripLeft + col * (groupW + 6);
    return lerp(flush, spaced, gap / 6);
  };
  const groupY = (k: number) => g.stripY0 + Math.floor(k / g.groupsPerRow) * g.stripRowH;

  const treeLeft = (k: number) => {
    const col = k % g.treesPerRow;
    const total = g.treesPerRow * g.treeCell;
    return (g.w - total) / 2 + col * g.treeCell + (g.treeCell - g.treeW) / 2;
  };
  const treeApexY = (k: number) => g.treeY0 + Math.floor(k / g.treesPerRow) * g.treeRowH;
  const nodeX = (k: number, z: number, j: number) => treeLeft(k) + g.treeW / 2 + ((j + 0.5) / 2 ** (A - z) - 0.5) * g.treeW * (1 - z / A);
  const nodeY = (k: number, z: number) => treeApexY(k) + g.treeH - (z / A) * g.treeH;

  const bitAt = (p: number) => (ex.digest[p >> 3] >> (7 - (p & 7))) & 1;

  return (
    <SceneFrame sceneRef={ref} tl={tl} copy={copy}>
      <div ref={box} className="px-2 py-3 sm:px-4 sm:py-4">
        <Stage w={g.w} h={g.h} label={copy.figure}>
          <defs>
            <linearGradient id="sx-f-tri" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={C.accent} stopOpacity="0.22" />
              <stop offset="1" stopColor={C.accent} stopOpacity="0.04" />
            </linearGradient>
            <filter id="sx-f-blur" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" />
            </filter>
          </defs>
          <text x={g.w / 2} y={18} textAnchor="middle" fontSize={11} fill={C.subtle} className="mono" opacity={bitsShown > 0 ? 1 : 0}>
            digest bits 0 to 239
          </text>
          {/* The 240 bits, then the 24 numbers. */}
          {Array.from({ length: FORS_TREES }, (_, k) => {
            const x = groupX(k);
            const y = groupY(k);
            const s = ex.leaves[k];
            const lit = flow > k / FORS_TREES;
            return (
              <g key={k}>
                {Array.from({ length: A }, (_, b) => {
                  const p = k * A + b;
                  if (p / 240 > bitsShown) return null;
                  return (
                    <rect
                      key={b}
                      x={x + b * g.bit}
                      y={y}
                      width={g.bit - 0.6}
                      height={14}
                      rx={0.6}
                      fill={bitAt(p) ? (split > 0 && k % 2 ? C.accentHi : C.accent) : C.ink700}
                    />
                  );
                })}
                <text
                  x={x + groupW / 2}
                  y={y + 30}
                  textAnchor="middle"
                  fontSize={compact ? 10.5 : 10}
                  className="mono"
                  fill={lit ? C.cyan : C.fg}
                  opacity={nums}
                >
                  {s}
                </text>
              </g>
            );
          })}
          {/* Connectors from each number to its tree. */}
          {flow > 0 &&
            Array.from({ length: FORS_TREES }, (_, k) => {
              const p = span(flow, (k / FORS_TREES) * 0.7, (k / FORS_TREES) * 0.7 + 0.3);
              if (p <= 0) return null;
              const x1 = groupX(k) + groupW / 2;
              const y1 = groupY(k) + 36;
              const x2 = nodeX(k, 0, ex.leaves[k]);
              const y2 = nodeY(k, 0);
              return (
                <line
                  key={k}
                  x1={x1}
                  y1={y1}
                  x2={lerp(x1, x2, p)}
                  y2={lerp(y1, y2, p)}
                  stroke={C.cyan}
                  strokeOpacity={0.18 * (1 - span(t, BEATS[3], BEATS[3] + 1))}
                  strokeWidth={0.8}
                />
              );
            })}
          {/* The 24 trees. */}
          {Array.from({ length: FORS_TREES }, (_, k) => {
            const s = ex.leaves[k];
            const appear = span(t, BEATS[2] - 0.4 + k * 0.03, BEATS[2] + 0.3 + k * 0.03);
            const picked = span(flow, (k / FORS_TREES) * 0.7 + 0.25, (k / FORS_TREES) * 0.7 + 0.35);
            const c = span(climb, (k / FORS_TREES) * 0.4, (k / FORS_TREES) * 0.4 + 0.6);
            const lvl = c * A;
            const left = treeLeft(k);
            const ay = treeApexY(k);
            let d = "";
            for (let z = 0; z < A && z < lvl; z++) {
              const f = Math.min(1, lvl - z);
              const x1 = nodeX(k, z, s >> z);
              const y1 = nodeY(k, z);
              const x2 = nodeX(k, z + 1, s >> (z + 1));
              const y2 = nodeY(k, z + 1);
              d += `M${x1} ${y1}L${lerp(x1, x2, f)} ${lerp(y1, y2, f)}`;
            }
            const toPk = merge > 0;
            return (
              <g key={k} opacity={appear}>
                <path
                  d={`M${left + g.treeW / 2} ${ay}L${left + g.treeW} ${ay + g.treeH}H${left}Z`}
                  fill="url(#sx-f-tri)"
                  stroke={C.accent}
                  strokeOpacity={0.35}
                  strokeWidth={0.8}
                  strokeLinejoin="round"
                />
                {/* Siblings as small dots, shown while climbing. */}
                {c > 0 &&
                  Array.from({ length: A }, (_, z) =>
                    z < lvl ? <circle key={z} cx={nodeX(k, z, (s >> z) ^ 1)} cy={nodeY(k, z)} r={1.1} fill={C.accentHi} /> : null,
                  )}
                {d && (
                  <>
                    <path d={d} stroke={C.cyan} strokeWidth={3.5} strokeOpacity={0.35} filter="url(#sx-f-blur)" fill="none" />
                    <path d={d} stroke={C.cyan} strokeWidth={1.3} fill="none" strokeLinecap="round" />
                  </>
                )}
                {picked > 0 && (
                  <rect x={nodeX(k, 0, s) - 2.5} y={nodeY(k, 0) - 2.5} width={5} height={5} rx={1.2} fill={C.cyan} opacity={picked} />
                )}
                <rect
                  x={left + g.treeW / 2 - 3}
                  y={ay - 3}
                  width={6}
                  height={6}
                  rx={1.5}
                  fill={c >= 1 ? C.cyan : C.ink850}
                  stroke={c >= 1 ? C.cyan : C.accent}
                  strokeWidth={1}
                />
                {toPk && (
                  <line
                    x1={left + g.treeW / 2}
                    y1={ay - 3}
                    x2={lerp(left + g.treeW / 2, g.pk.x, merge)}
                    y2={lerp(ay - 3, g.pk.y - 13, merge)}
                    stroke={C.cyan}
                    strokeOpacity={0.3}
                    strokeWidth={0.8}
                  />
                )}
              </g>
            );
          })}
          {/* Tree count note. */}
          <text x={g.w / 2} y={g.treeY0 - 14} textAnchor="middle" fontSize={11} fill={C.subtle} opacity={span(t, BEATS[2], BEATS[2] + 0.6) * (1 - merge * 0)}>
            24 trees × 1,024 secret leaves
          </text>
          {merge > 0 && (
            <g opacity={merge}>
              <rect x={g.pk.x - 74} y={g.pk.y - 13} width={148} height={26} rx={8} fill={C.ink850} stroke={C.cyan} strokeWidth={1.5} />
              <text x={g.pk.x} y={g.pk.y + 4.5} textAnchor="middle" fontSize={12} className="mono" fill={C.cyan}>
                {shortHex(ex.forsPk, 4, 3)}
              </text>
              <text x={g.pk.x} y={g.pk.y + 30} textAnchor="middle" fontSize={11} fill={C.subtle}>
                FORS public key
              </text>
            </g>
          )}
        </Stage>
      </div>
    </SceneFrame>
  );
}
