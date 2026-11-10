// Scene 3. WOTS+C from the real bottom layer: the counter search with the true sum of every try,
// the revealed positions, the verifier's 64 chain steps and the one-time public key.
import { useMemo, useRef, useState } from "react";
import { CHAINS, counterSums, encode, keyOf, TARGET_SUM } from "../data/explain";
import { SceneFrame, Stage, useScene } from "../frame";
import { useWidth } from "../hooks";
import { useSample } from "../sample";
import { C, fmt, shortHex } from "../theme";
import { ease, span } from "../timeline";
import "../viz.css";

const BEATS = [0, 2.2, 9.4, 11.4, 14.4, 16.6] as const;
const DUR = 18.4;
const HIST_MIN = 56;
const HIST_MAX = 140;

interface Geo {
  w: number;
  h: number;
  rows: number;
  perRow: number;
  x0: number;
  pitch: number;
  cell: number;
  /** y of the top edge of position 3 for each row. */
  rowTop: number[];
  pk: { x: number; y: number };
  hist: { x0: number; x1: number; y0: number; y1: number };
  head: number;
}

function geometry(compact: boolean): Geo {
  if (compact) {
    const pitch = 10.6;
    return {
      w: 360, h: 520, rows: 2, perRow: 32, x0: 11, pitch, cell: 8.6, rowTop: [132, 204],
      pk: { x: 180, y: 88 }, hist: { x0: 22, x1: 342, y0: 312, y1: 462 }, head: 26,
    };
  }
  const pitch = 11;
  return {
    w: 760, h: 430, rows: 1, perRow: 64, x0: 28, pitch, cell: 9, rowTop: [124],
    pk: { x: 380, y: 66 }, hist: { x0: 60, x1: 700, y0: 226, y1: 380 }, head: 28,
  };
}

/** Counter shown at fraction p of the search: slow at first, then racing. */
function counterAt(p: number, target: number) {
  if (p <= 0) return 0;
  if (p >= 1) return target;
  const k = 5.2;
  return Math.min(target, Math.floor((target * (Math.exp(k * p) - 1)) / (Math.exp(k) - 1)));
}

export default function WotsScene() {
  const { ex } = useSample();
  const box = useRef<HTMLDivElement>(null);
  const width = useWidth(box);
  const g = geometry(width > 0 && width < 560);
  const { ref, tl, copy } = useScene("wots", BEATS, DUR);
  const t = tl.t;
  const [raised, setRaised] = useState<number[]>([]);

  const L = ex.layers[0];
  const key = useMemo(() => keyOf(0, ex.idx), [ex.idx]);
  const sums = useMemo(() => counterSums(ex.pkSeed, key, L.signed, L.counter), [ex.pkSeed, key, L]);

  const searchP = span(t, BEATS[1] + 0.2, BEATS[2] - 0.6);
  const searching = t < BEATS[2] - 0.6;
  const c = t < BEATS[1] ? 0 : counterAt(searchP, L.counter);
  const cur = useMemo(() => (c === L.counter ? { digits: L.digits, sum: L.sum } : encode(ex.pkSeed, key, L.signed, c)), [c, ex.pkSeed, key, L]);

  // Histogram of sums for counters 0..c.
  const hist = useMemo(() => {
    const h = new Array<number>(HIST_MAX - HIST_MIN + 1).fill(0);
    for (let i = 0; i <= c; i++) {
      const s = Math.max(HIST_MIN, Math.min(HIST_MAX, sums[i]));
      h[s - HIST_MIN]++;
    }
    let best = 0;
    // The try whose sum came closest to 128 so far.
    for (let i = 0; i <= c; i++) if (Math.abs(sums[i] - TARGET_SUM) < Math.abs(best - TARGET_SUM)) best = sums[i];
    return { h, best };
  }, [c, sums]);
  const histScale = useMemo(() => {
    const h = new Array<number>(HIST_MAX - HIST_MIN + 1).fill(0);
    for (const s of sums) h[Math.max(HIST_MIN, Math.min(HIST_MAX, s)) - HIST_MIN]++;
    return Math.max(...h);
  }, [sums]);

  const found = t >= BEATS[2] - 0.6;
  const reveal = span(t, BEATS[2], BEATS[2] + 1.2);
  const walkP = span(t, BEATS[3], BEATS[3] + 2.4);
  const merge = ease(t, BEATS[4], BEATS[4] + 1.4);
  const interactive = t >= BEATS[5] || tl.reduced;

  const digits = found ? L.digits.map((d, i) => d + (raised.includes(i) ? 1 : 0)) : cur.digits;
  const sum = digits.reduce((a, b) => a + b, 0);
  const broken = raised.length > 0;

  const colX = (i: number) => g.x0 + (i % g.perRow) * g.pitch;
  const rowOf = (i: number) => Math.floor(i / g.perRow);
  const cellY = (i: number, pos: number) => g.rowTop[rowOf(i)] + (3 - pos) * (g.cell + 2);
  const histX = (s: number) => g.hist.x0 + ((s - HIST_MIN + 0.5) / (HIST_MAX - HIST_MIN + 1)) * (g.hist.x1 - g.hist.x0);
  const barW = ((g.hist.x1 - g.hist.x0) / (HIST_MAX - HIST_MIN + 1)) * 0.78;

  const chainSteps = Math.round(walkP * 64);
  // Chain steps the verifier makes before chain i, walking the chains in order.
  const stepsBefore = useMemo(() => {
    const out: number[] = [];
    let acc = 0;
    for (const d of L.digits) {
      out.push(acc);
      acc += 3 - d;
    }
    return out;
  }, [L]);
  const raise = (i: number) => {
    if (!interactive || L.digits[i] + (raised.includes(i) ? 1 : 0) >= 3 || raised.includes(i)) return;
    setRaised((r) => [...r, i]);
  };
  const raiseRandom = () => {
    const free = L.digits.map((d, i) => (d < 3 && !raised.includes(i) ? i : -1)).filter((i) => i >= 0);
    if (free.length) setRaised((r) => [...r, free[Math.floor(Math.random() * free.length)]]);
  };

  const sumColor = broken ? C.bad : sum === TARGET_SUM ? C.cyan : C.fg;
  const steps = [...copy.steps];
  steps[1] = `Most counters give a sum near 96. This key's search reached exactly 128 at counter ${fmt(L.counter)}.`;

  return (
    <SceneFrame
      sceneRef={ref}
      tl={tl}
      copy={copy}
      steps={steps}
      below={
        interactive ? (
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px]" aria-live="polite">
            <button
              type="button"
              onClick={raiseRandom}
              className="cursor-pointer rounded-md bg-ink-800 px-2.5 py-1 text-fg ring-1 ring-ink-600 ring-inset hover:bg-ink-700"
            >
              Raise a digit
            </button>
            {broken && (
              <button type="button" onClick={() => setRaised([])} className="cursor-pointer text-muted underline underline-offset-2 hover:text-fg">
                Reset
              </button>
            )}
            <span className={broken ? "text-bad" : "text-muted"}>
              {broken
                ? `Sum ${sum}, not 128. Rejected. Fixing it would take a step backward on another chain.`
                : "Every digit can only go up, by hashing forward."}
            </span>
          </div>
        ) : null
      }
    >
      <div ref={box} className="px-2 py-3 sm:px-4 sm:py-4">
        <Stage w={g.w} h={g.h} label={copy.figure}>
          <defs>
            <linearGradient id="sx-w-bar" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0" stopColor={C.accentLo} />
              <stop offset="1" stopColor={C.accent} />
            </linearGradient>
            <filter id="sx-w-blur" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="4" />
            </filter>
          </defs>

          {/* Header: what is being signed, the counter and the sum. */}
          <g className="mono" fontSize={g.rows === 2 ? 11 : 12}>
            <text x={g.rows === 2 ? 12 : 28} y={g.head} fill={C.subtle}>
              signs <tspan fill={C.fg}>{shortHex(L.signed, 3, 2)}</tspan>
            </text>
            <text x={g.rows === 2 ? 12 : g.w / 2 + 40} y={g.rows === 2 ? g.head + 22 : g.head} fill={C.subtle} textAnchor={g.rows === 2 ? "start" : "middle"}>
              counter <tspan fill={found ? C.cyan : C.fg}>{fmt(c)}</tspan>
            </text>
            <text x={g.w - (g.rows === 2 ? 12 : 28)} y={g.head} fill={C.subtle} textAnchor="end">
              sum <tspan fill={sumColor} fontWeight={600} fontSize={g.rows === 2 ? 15 : 16}>{sum}</tspan>
              <tspan fill={C.subtle}> / 128</tspan>
            </text>
          </g>

          {/* One-time public key, where the 64 ends merge. */}
          {merge > 0 && (
            <g opacity={merge}>
              {Array.from({ length: CHAINS }, (_, i) => {
                const x = colX(i) + g.cell / 2;
                const y = g.rowTop[rowOf(i)] - 3;
                const mx = x + (g.pk.x - x) * merge;
                const my = y + (g.pk.y + 12 - y) * merge;
                return <line key={i} x1={x} y1={y} x2={mx} y2={my} stroke={C.cyan} strokeOpacity={0.28} strokeWidth={0.8} />;
              })}
              <rect x={g.pk.x - 70} y={g.pk.y - 12} width={140} height={26} rx={8} fill={C.ink850} stroke={C.cyan} strokeWidth={1.5} />
              <rect x={g.pk.x - 70} y={g.pk.y - 12} width={140} height={26} rx={8} fill={C.cyan} opacity={0.18} filter="url(#sx-w-blur)" />
              <text x={g.pk.x} y={g.pk.y + 5} textAnchor="middle" fill={C.cyan} fontSize={12} className="mono">
                {L.otsPk ? shortHex(L.otsPk, 4, 3) : ""}
              </text>
              <text x={g.pk.x + 78} y={g.pk.y + 5} fill={C.subtle} fontSize={11}>
                one-time public key
              </text>
            </g>
          )}

          {/* The 64 chains, position 3 on top. */}
          {Array.from({ length: CHAINS }, (_, i) => {
            const d = digits[i];
            const base = found ? L.digits[i] : d;
            const raisedHere = raised.includes(i);
            const x = colX(i);
            const r = span(reveal, (i / CHAINS) * 0.6, (i / CHAINS) * 0.6 + 0.4);
            const doneSteps = Math.min(3 - base, Math.max(0, chainSteps - stepsBefore[i]));
            return (
              <g key={i} onClick={() => raise(i)} style={{ cursor: interactive ? "pointer" : undefined }}>
                <rect x={x - 1} y={g.rowTop[rowOf(i)] - 3} width={g.cell + 2} height={4 * (g.cell + 2) + 4} fill="transparent" />
                {[0, 1, 2, 3].map((pos) => {
                  const y = cellY(i, pos);
                  let fill: string = C.ink700;
                  let op = 1;
                  if (!found || r === 0) {
                    // Before the reveal each chain is a bar, its top cell at the digit.
                    if (pos < d) {
                      fill = C.accent;
                      op = 0.3;
                    } else if (pos === d) fill = C.accent;
                  } else {
                    if (pos < base) {
                      fill = C.ink800;
                    } else if (pos === base) {
                      fill = C.cyan;
                      op = r;
                    } else if (raisedHere && pos === base + 1) {
                      fill = C.bad;
                    } else if (pos - base <= doneSteps) {
                      fill = C.cyan;
                      op = 0.45;
                    } else {
                      fill = C.ink700;
                    }
                  }
                  return <rect key={pos} x={x} y={y} width={g.cell} height={g.cell} rx={2} fill={fill} opacity={op} />;
                })}
                {raisedHere && (
                  <text x={x + g.cell / 2} y={g.rowTop[rowOf(i)] - 7} textAnchor="middle" fontSize={9} fill={C.bad} className="sx-pop">
                    ↑
                  </text>
                )}
              </g>
            );
          })}
          {/* Position labels. */}
          {g.rowTop.map((top, row) => (
            <g key={row} fontSize={8.5} fill={C.subtle} className="mono" textAnchor="end">
              {g.rows === 1 &&
                [3, 2, 1, 0].map((pos) => (
                  <text key={pos} x={g.x0 - 6} y={top + (3 - pos) * (g.cell + 2) + g.cell - 1}>
                    {pos}
                  </text>
                ))}
            </g>
          ))}
          <text x={g.rows === 2 ? 12 : 28} y={g.rowTop[g.rows - 1] + 4 * (g.cell + 2) + 16} fontSize={11} fill={C.subtle}>
            {found && walkP > 0
              ? `verifier chain steps ${chainSteps} / 64`
              : found && reveal > 0
                ? "cyan cells are revealed in the signature"
                : "64 chains, one digit each"}
          </text>

          {/* Histogram of digit sums seen during the search. */}
          <g opacity={found && reveal > 0 ? 0.35 + 0.65 * (1 - span(t, BEATS[2], BEATS[2] + 1)) : 1}>
            <line x1={g.hist.x0} x2={g.hist.x1} y1={g.hist.y1} y2={g.hist.y1} stroke={C.ink500} strokeWidth={1} />
            {hist.h.map((n, k) => {
              const s = k + HIST_MIN;
              const hgt = (n / histScale) * (g.hist.y1 - g.hist.y0 - 20);
              const isCur = searching && t >= BEATS[1] && s === Math.max(HIST_MIN, Math.min(HIST_MAX, cur.sum));
              return (
                <rect
                  key={k}
                  x={histX(s) - barW / 2}
                  y={g.hist.y1 - hgt}
                  width={barW}
                  height={hgt}
                  fill={s === TARGET_SUM ? C.cyan : isCur ? C.fg : "url(#sx-w-bar)"}
                  opacity={s === TARGET_SUM ? 1 : 0.85}
                />
              );
            })}
            {/* Target and mean. */}
            <line x1={histX(TARGET_SUM)} x2={histX(TARGET_SUM)} y1={g.hist.y0} y2={g.hist.y1} stroke={C.cyan} strokeDasharray="3 3" strokeWidth={1.2} />
            <text x={histX(TARGET_SUM)} y={g.hist.y0 - 6} textAnchor="middle" fontSize={11} fill={C.cyan}>
              target 128
            </text>
            <text x={histX(96)} y={g.hist.y0 - 6} textAnchor="middle" fontSize={11} fill={C.subtle}>
              average 96
            </text>
            {found && (
              <g className="sx-pop">
                <circle cx={histX(TARGET_SUM)} cy={g.hist.y1 - 6} r={5} fill={C.cyan} />
                <circle cx={histX(TARGET_SUM)} cy={g.hist.y1 - 6} r={11} fill={C.cyan} opacity={0.25} />
              </g>
            )}
            {[64, 80, 96, 112, 128].map((s) => (
              <text key={s} x={histX(s)} y={g.hist.y1 + 15} textAnchor="middle" fontSize={10} fill={C.subtle} className="mono">
                {s}
              </text>
            ))}
            <text x={g.hist.x0} y={g.hist.y1 + 34} fontSize={11} fill={C.subtle}>
              {t < BEATS[1]
                ? "digit sum of each try"
                : `${fmt(c + 1)} tries, closest so far ${hist.best}`}
            </text>
          </g>
        </Stage>
      </div>
    </SceneFrame>
  );
}
