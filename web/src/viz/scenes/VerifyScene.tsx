// Scene 8. Verification of this signature, hash by hash in the order the contract runs them, with
// a button that flips one bit and shows where the check fails.
import { useMemo, useRef, useState } from "react";
import { explain, signatureSections, type Explained } from "../data/explain";
import { SceneFrame, useScene } from "../frame";
import { useWidth } from "../hooks";
import { useSample } from "../sample";
import { C, describeByte, fmt, GROUP_COLOR, shortHex } from "../theme";
import { lerp, span } from "../timeline";
import "../viz.css";

const BEATS = [0, 1.4, 4.8, 7.0, 9.0, 11.0] as const;
const DUR = 13.6;
const STAGE_NAMES = ["Digest", "FORS", "Bottom", "Middle", "Top"];
const STAGE_COLORS = [C.warn, GROUP_COLOR.fors, GROUP_COLOR.bottom, GROUP_COLOR.middle, GROUP_COLOR.top];

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Geo {
  w: number;
  h: number;
  boxes: Box[]; // digest, fors, bottom, middle, top
  vertical: boolean;
  counters: { y: number };
  result: Box;
}

function geometry(compact: boolean): Geo {
  if (compact) {
    const x = 20;
    const w = 320;
    return {
      w: 360, h: 640, vertical: true, counters: { y: 30 },
      boxes: [
        { x, y: 64, w, h: 46 },
        { x, y: 128, w, h: 104 },
        { x, y: 250, w, h: 80 },
        { x, y: 348, w, h: 80 },
        { x, y: 446, w, h: 80 },
      ],
      result: { x, y: 548, w, h: 78 },
    };
  }
  return {
    w: 760, h: 350, vertical: false, counters: { y: 30 },
    boxes: [
      { x: 16, y: 74, w: 92, h: 150 },
      { x: 126, y: 74, w: 196, h: 150 },
      { x: 340, y: 74, w: 128, h: 150 },
      { x: 486, y: 74, w: 128, h: 150 },
      { x: 632, y: 74, w: 112, h: 150 },
    ],
    result: { x: 16, y: 248, w: 728, h: 90 },
  };
}

/** Calls done in each stage by `calls` total, from the real per-stage counts. */
function perStage(ex: Explained, calls: number) {
  let left = calls;
  return ex.stages.map((s) => {
    const d = Math.max(0, Math.min(s.calls, left));
    left -= d;
    return d;
  });
}

function permsAt(ex: Explained, calls: number) {
  // Permutations grow with calls inside each stage; the big inputs are the last call of a stage
  // part, so spreading them evenly is close enough for a running counter and exact at the ends.
  let p = 0;
  perStage(ex, calls).forEach((d, i) => {
    const s = ex.stages[i];
    p += s.calls ? Math.round((d / s.calls) * s.perms) : 0;
  });
  return p;
}

function MiniLayer({ box, ex, l, done, failed, vertical }: { box: Box; ex: Explained; l: number; done: number; failed: boolean; vertical: boolean }) {
  const L = ex.layers[l];
  const color = STAGE_COLORS[l + 2];
  const chainSteps = Math.max(0, Math.min(64, done - 1));
  const climb = Math.max(0, Math.min(L.height, done - 66));
  const cols = vertical ? 64 : 16;
  const pitch = vertical ? (box.w * 0.62) / 64 : (box.w - 20) / 16;
  const cw = pitch * 0.7;
  const cellH = vertical ? 6 : 3.4;
  const x0 = box.x + 10;
  const y0 = box.y + (vertical ? 30 : 28);
  let acc = 0;
  const triX = vertical ? box.x + box.w * 0.83 : box.x + box.w / 2;
  const triTop = vertical ? box.y + 22 : box.y + 110;
  const triH = vertical ? 46 : 30;
  const triHalf = vertical ? 26 : 26;
  const leafX = triX - triHalf + ((L.leaf + 0.5) / 2 ** L.height) * 2 * triHalf;
  const climbY = triTop + triH - (climb / L.height) * triH;
  const climbX = lerp(leafX, triX, climb / L.height);
  return (
    <g>
      {L.digits.length > 0 &&
        L.digits.map((d, i) => {
          const before = acc;
          acc += 3 - d;
          const walked = Math.max(0, Math.min(3 - d, chainSteps - before));
          const cx = x0 + (i % cols) * pitch;
          const cy = y0 + Math.floor(i / cols) * (4 * cellH + 6);
          return (
            <g key={i}>
              {[0, 1, 2, 3].map((pos) => (
                <rect
                  key={pos}
                  x={cx}
                  y={cy + (3 - pos) * cellH}
                  width={cw}
                  height={cellH - 0.8}
                  fill={pos < d ? C.ink800 : pos === d ? (done > 0 ? C.cyan : C.ink600) : pos - d <= walked ? C.cyan : C.ink700}
                  opacity={pos === d ? 1 : pos > d && pos - d <= walked ? 0.5 : 1}
                />
              ))}
            </g>
          );
        })}
      <path d={`M${triX} ${triTop}L${triX + triHalf} ${triTop + triH}H${triX - triHalf}Z`} fill={color} fillOpacity={0.08} stroke={color} strokeOpacity={0.5} strokeWidth={0.8} />
      {climb > 0 && <line x1={leafX} y1={triTop + triH} x2={climbX} y2={climbY} stroke={C.cyan} strokeWidth={1.6} />}
      <circle cx={climbX} cy={climbY} r={2.4} fill={done > 0 ? C.cyan : C.ink500} />
      {failed && (
        <text x={box.x + box.w / 2} y={box.y + box.h - 8} textAnchor="middle" fontSize={10.5} fill={C.bad}>
          sum {L.sum}, not 128
        </text>
      )}
    </g>
  );
}

export default function VerifyScene() {
  const sample = useSample();
  const box = useRef<HTMLDivElement>(null);
  const width = useWidth(box);
  const compact = width > 0 && width < 560;
  const g = geometry(compact);
  const { ref, tl, copy } = useScene("verify", BEATS, DUR);
  const [flip, setFlip] = useState<{ at: number; bit: number } | null>(null);
  const sections = useMemo(() => signatureSections(), []);

  const ex = useMemo(() => {
    if (!flip) return sample.ex;
    const sig = sample.ex.signature.slice();
    sig[flip.at] ^= 1 << flip.bit;
    return explain(new Uint8Array([...sample.ex.pkSeed, ...sample.ex.pkRoot]), sample.ex.message, sig);
  }, [sample, flip]);

  const t = tl.t;
  // Cumulative calls at each beat boundary.
  const cum = [0];
  for (const s of ex.stages) cum.push(cum[cum.length - 1] + s.calls);
  const stageIdx = Math.min(4, Math.max(0, tl.beat));
  const inStage = t >= BEATS[5] ? 1 : span(t, BEATS[stageIdx] + 0.1, (BEATS[stageIdx + 1] ?? DUR) - 0.3);
  const calls = t >= BEATS[5] ? ex.calls : Math.round(lerp(cum[stageIdx], cum[stageIdx + 1], inStage));
  const done = perStage(ex, calls);
  const perms = calls >= ex.calls ? ex.perms : permsAt(ex, calls);
  const finished = t >= BEATS[5];
  const failLayer = ex.layers.findIndex((l) => l.sum !== 128 && l.digits.length > 0);

  const calldataGas = useMemo(() => {
    let gGas = 0;
    for (const b of sample.ex.signature) gGas += b === 0 ? 4 : 16;
    return gGas;
  }, [sample]);

  const doFlip = () => {
    const at = Math.floor(Math.random() * 7740);
    setFlip({ at, bit: Math.floor(Math.random() * 8) });
    tl.replay();
  };

  const fs = compact ? 11 : 12;
  const steps = [...copy.steps];
  if (!ex.valid) steps[5] = ex.failure ? `${ex.failure} Invalid.` : "Invalid.";

  return (
    <SceneFrame
      sceneRef={ref}
      tl={tl}
      copy={copy}
      steps={steps}
      below={
        <div className="mt-1 space-y-1.5 text-[13px]">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <button
              type="button"
              onClick={doFlip}
              className="cursor-pointer rounded-md bg-ink-800 px-2.5 py-1 text-fg ring-1 ring-ink-600 ring-inset hover:bg-ink-700"
            >
              Flip a random bit
            </button>
            {flip && (
              <button type="button" onClick={() => { setFlip(null); tl.replay(); }} className="cursor-pointer text-muted underline underline-offset-2 hover:text-fg">
                Restore the signature
              </button>
            )}
          </div>
          <p className="text-muted" aria-live="polite">
            {flip
              ? `Flipped bit ${flip.bit} of byte ${fmt(flip.at)} (${describeByte(sections, flip.at)}). ${ex.valid ? "Still valid." : ex.failure}`
              : `Verification costs about 86,000 gas in our contract. Sending these 7,740 bytes as calldata costs ${fmt(calldataGas)} gas more.`}
          </p>
        </div>
      }
    >
      <div ref={box} className="px-2 py-3 sm:px-4 sm:py-4">
        <svg viewBox={`0 0 ${g.w} ${g.h}`} role="img" aria-label={copy.figure} className="block h-auto w-full select-none">
          <defs>
            <filter id="sx-v-blur" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="5" />
            </filter>
          </defs>
          {/* Counters. */}
          <g className="mono">
            <text x={g.vertical ? 20 : 16} y={g.counters.y} fontSize={fs} fill={C.subtle}>
              Keccak calls{" "}
              <tspan fill={C.fg} fontSize={fs + 4} fontWeight={600}>
                {calls}
              </tspan>
              <tspan> / {ex.calls}</tspan>
            </text>
            <text x={g.w - (g.vertical ? 20 : 16)} y={g.counters.y} fontSize={fs} fill={C.subtle} textAnchor="end">
              permutations{" "}
              <tspan fill={C.fg} fontSize={fs + 4} fontWeight={600}>
                {perms}
              </tspan>
              <tspan> / {ex.perms}</tspan>
            </text>
          </g>
          {/* Stage boxes. */}
          {g.boxes.map((b, i) => {
            const active = i === stageIdx && !finished && t > 0;
            const complete = done[i] >= ex.stages[i].calls && ex.stages[i].calls > 0 && calls >= cum[i + 1];
            const failedHere = i >= 2 && failLayer === i - 2 && complete;
            const skipped = i >= 2 && failLayer >= 0 && i - 2 > failLayer;
            const color = STAGE_COLORS[i];
            return (
              <g key={i} opacity={skipped ? 0.3 : 1}>
                {active && <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={10} fill={color} opacity={0.18} filter="url(#sx-v-blur)" />}
                <rect
                  x={b.x}
                  y={b.y}
                  width={b.w}
                  height={b.h}
                  rx={10}
                  fill={C.ink850}
                  stroke={failedHere ? C.bad : active ? color : complete ? color : C.ink600}
                  strokeOpacity={complete && !active && !failedHere ? 0.55 : 1}
                  strokeWidth={active || failedHere ? 1.6 : 1}
                />
                <text x={b.x + 10} y={b.y + 17} fontSize={11} fill={color} fontWeight={600}>
                  {STAGE_NAMES[i]}
                </text>
                <text x={b.x + b.w - 10} y={b.y + 17} fontSize={10.5} fill={C.subtle} textAnchor="end" className="mono">
                  {done[i]}/{ex.stages[i].calls}
                </text>
                {i === 0 && (
                  <g>
                    {Array.from(ex.digest, (v, k) => {
                      const per = g.vertical ? 34 : 6;
                      const cell = g.vertical ? 8.4 : 12;
                      const x = b.x + 10 + (k % per) * (cell + (g.vertical ? 0.6 : 1.5));
                      const y = b.y + 26 + Math.floor(k / per) * (cell + 1.5);
                      return <rect key={k} x={x} y={y} width={cell} height={g.vertical ? 10 : cell} rx={1.5} fill={C.warn} opacity={done[0] >= 2 ? 0.25 + (0.75 * v) / 255 : done[0] >= 1 && k < 17 ? 0.4 : 0.08} />;
                    })}
                  </g>
                )}
                {i === 1 && (
                  <g>
                    {Array.from({ length: 24 }, (_, k) => {
                      const per = 12;
                      const tw = (b.w - 20) / per;
                      const x = b.x + 10 + (k % per) * tw + tw / 2;
                      const y = b.y + (g.vertical ? 28 : 30) + Math.floor(k / per) * (g.vertical ? 34 : 56);
                      const th = g.vertical ? 26 : 44;
                      const lit = done[1] >= (k + 1) * 11;
                      const s = ex.leaves[k];
                      const lx = x - tw * 0.4 + ((s + 0.5) / 1024) * tw * 0.8;
                      return (
                        <g key={k}>
                          <path d={`M${x} ${y}L${x + tw * 0.4} ${y + th}H${x - tw * 0.4}Z`} fill={GROUP_COLOR.fors} fillOpacity={0.08} stroke={GROUP_COLOR.fors} strokeOpacity={0.45} strokeWidth={0.7} />
                          {lit && <line x1={lx} y1={y + th} x2={x} y2={y} stroke={C.cyan} strokeWidth={1.2} />}
                          <circle cx={x} cy={y} r={1.8} fill={lit ? C.cyan : C.ink500} />
                        </g>
                      );
                    })}
                  </g>
                )}
                {i >= 2 && <MiniLayer box={b} ex={ex} l={i - 2} done={done[i]} failed={failedHere} vertical={g.vertical} />}
              </g>
            );
          })}
          {/* Connectors between stages. */}
          {g.boxes.slice(0, -1).map((b, i) => {
            const n = g.boxes[i + 1];
            const lit = calls >= cum[i + 1] && ex.stages[i + 1].calls > 0;
            const [x1, y1, x2, y2] = g.vertical ? [b.x + b.w / 2, b.y + b.h, n.x + n.w / 2, n.y] : [b.x + b.w, b.y + b.h / 2, n.x, n.y + n.h / 2];
            return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={lit ? C.cyan : C.ink600} strokeWidth={1.5} />;
          })}
          {/* The comparison with PK.root. */}
          {(() => {
            const r = g.result;
            const top = ex.layers[2].root;
            const show = span(t, BEATS[5], BEATS[5] + 0.6);
            const ok = ex.valid;
            const resColor = ok ? C.cyan : C.bad;
            return (
              <g>
                <rect x={r.x} y={r.y} width={r.w} height={r.h} rx={12} fill={C.ink850} stroke={finished ? resColor : C.ink600} strokeWidth={finished ? 1.6 : 1} />
                {finished && <rect x={r.x} y={r.y} width={r.w} height={r.h} rx={12} fill={resColor} opacity={0.08 * show} />}
                <g className="mono" fontSize={g.vertical ? 11 : 12.5}>
                  <text x={r.x + 14} y={r.y + (g.vertical ? 24 : 30)} fill={C.subtle}>
                    computed{" "}
                    <tspan fill={finished ? resColor : C.ink500}>{finished ? (top ? shortHex(top, 6, 4) : "stopped") : "…"}</tspan>
                  </text>
                  <text x={r.x + 14} y={r.y + (g.vertical ? 44 : 54)} fill={C.subtle}>
                    PK.root{"  "}
                    <tspan fill={C.fg}>{shortHex(ex.pkRoot, 6, 4)}</tspan>
                  </text>
                </g>
                {finished && (
                  <g className="sx-pop" transform={`translate(${r.x + r.w - (g.vertical ? 62 : 86)} ${r.y + r.h / 2})`}>
                    <rect x={-46} y={-17} width={92} height={34} rx={17} fill={resColor} />
                    <text x={0} y={5.5} textAnchor="middle" fontSize={15} fontWeight={700} fill={C.ink950}>
                      {ok ? "Valid" : "Invalid"}
                    </text>
                  </g>
                )}
                {finished && ok && (
                  <text x={r.x + 14} y={r.y + r.h - (g.vertical ? 12 : 14)} fontSize={g.vertical ? 10.5 : 11} fill={C.subtle}>
                    {g.vertical ? "about 86,000 gas on Ethereum Classic" : "≈ 86,000 gas in our contract on Ethereum Classic"}
                  </text>
                )}
              </g>
            );
          })()}
        </svg>
      </div>
    </SceneFrame>
  );
}
