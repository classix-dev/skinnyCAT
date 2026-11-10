// Scene 2. One hash chain of four positions, from the real bottom-layer signature.
import { useMemo, useRef } from "react";
import { chainWalk, keyOf } from "../data/explain";
import { SceneFrame, Stage, useScene } from "../frame";
import { useWidth } from "../hooks";
import { useSample } from "../sample";
import { C, shortHex } from "../theme";
import { ease, lerp, span } from "../timeline";
import "../viz.css";

const BEATS = [0, 1.6, 4.8, 6.8, 8.8] as const;
const DUR = 11.5;
const DIGIT = 2;

interface Geo {
  w: number;
  h: number;
  nodes: { x: number; y: number }[];
  nw: number;
  nh: number;
  vertical: boolean;
}

function geometry(compact: boolean): Geo {
  if (compact) {
    // Climbing upward, position 0 at the bottom.
    const ys = [392, 286, 180, 74];
    return { w: 360, h: 452, nodes: ys.map((y) => ({ x: 150, y })), nw: 176, nh: 58, vertical: true };
  }
  const xs = [92, 262, 432, 602];
  return { w: 700, h: 270, nodes: xs.map((x) => ({ x, y: 120 })), nw: 128, nh: 66, vertical: false };
}

function Arrow({ g, i, p, color, back }: { g: Geo; i: number; p: number; color: string; back?: boolean }) {
  // The connector from node i to node i + 1 (or back from i + 1 to i), drawn to fraction p.
  const a = g.nodes[i];
  const b = g.nodes[i + 1];
  const [x1, y1, x2, y2] = g.vertical
    ? [a.x, a.y - g.nh / 2 - 6, b.x, b.y + g.nh / 2 + 6]
    : [a.x + g.nw / 2 + 6, a.y, b.x - g.nw / 2 - 6, b.y];
  const [sx, sy, ex, ey] = back ? [x2, y2, x1, y1] : [x1, y1, x2, y2];
  const off = back ? (g.vertical ? 34 : 26) : 0;
  const ox = g.vertical ? off : 0;
  const oy = g.vertical ? 0 : off;
  const px = lerp(sx, ex, p);
  const py = lerp(sy, ey, p);
  const ang = Math.atan2(ey - sy, ex - sx);
  const head = 6;
  return (
    <g opacity={p > 0 ? 1 : 0}>
      <line x1={sx + ox} y1={sy + oy} x2={px + ox} y2={py + oy} stroke={color} strokeWidth={1.6} strokeDasharray={back ? "4 4" : undefined} />
      {p > 0.98 && (
        <path
          d={`M${ex + ox} ${ey + oy} l${-head * Math.cos(ang - 0.45)} ${-head * Math.sin(ang - 0.45)} M${ex + ox} ${ey + oy} l${-head * Math.cos(ang + 0.45)} ${-head * Math.sin(ang + 0.45)}`}
          stroke={color}
          strokeWidth={1.6}
          strokeLinecap="round"
        />
      )}
    </g>
  );
}

export default function ChainScene() {
  const { ex } = useSample();
  const box = useRef<HTMLDivElement>(null);
  const width = useWidth(box);
  const g = geometry(width > 0 && width < 520);
  const { ref, tl, copy } = useScene("chain", BEATS, DUR);
  const t = tl.t;

  const bottom = ex.layers[0];
  const chain = Math.max(0, bottom.digits.indexOf(DIGIT));
  const digit = bottom.digits[chain];
  const walk = useMemo(
    () => chainWalk(ex.pkSeed, keyOf(0, ex.idx), chain, digit, bottom.values[chain]),
    [ex, chain, digit, bottom],
  );
  // Known values by position: revealed and above. Below stays secret.
  const valueAt = (pos: number) => (pos >= digit ? walk[pos - digit] : null);

  const appear = [span(t, 0.2, 1.0), span(t, 2.4, 2.9), span(t, 3.4, 3.9), span(t, 4.3, 4.8)];
  const build = [span(t, 1.8, 2.5), span(t, 2.8, 3.5), span(t, 3.8, 4.5)];
  const reveal = ease(t, BEATS[2], BEATS[2] + 0.8);
  const verify = ease(t, BEATS[3] + 0.2, BEATS[3] + 1.4);
  const matched = t >= BEATS[3] + 1.5;
  const back = ease(t, BEATS[4] + 0.2, BEATS[4] + 1.2);
  const noBack = t >= BEATS[4] + 1.3;
  const fontV = 12;

  const steps = copy.steps.map((s) => s.replaceAll("digit 2", `digit ${digit}`).replace("position 2", `position ${digit}`));

  return (
    <SceneFrame sceneRef={ref} tl={tl} copy={copy} steps={steps}>
      <div ref={box} className="px-2 py-3 sm:px-4 sm:py-5">
        <Stage w={g.w} h={g.h} label={copy.figure}>
          <defs>
            <radialGradient id="sx-ch-glow">
              <stop offset="0" stopColor={C.cyan} stopOpacity="0.35" />
              <stop offset="1" stopColor={C.cyan} stopOpacity="0" />
            </radialGradient>
          </defs>
          {/* Hash arrows built by the signer. */}
          {[0, 1, 2].map((i) => (
            <Arrow key={i} g={g} i={i} p={build[i]} color={i >= digit && reveal > 0 ? C.ink500 : C.accent} />
          ))}
          {/* The verifier's forward walk. */}
          {Array.from({ length: 3 - digit }, (_, k) => (
            <Arrow key={`v${k}`} g={g} i={digit + k} p={span(verify, k / (3 - digit), (k + 1) / (3 - digit))} color={C.cyan} />
          ))}
          {/* The impossible step back. */}
          {digit > 0 && g.vertical && <Arrow g={g} i={digit - 1} p={back} color={C.bad} back />}
          {digit > 0 && !g.vertical && back > 0 && (() => {
            // A curve under the boxes, from the revealed value back toward the one below it.
            const a = g.nodes[digit - 1];
            const b = g.nodes[digit];
            const y = a.y + g.nh / 2 + 6;
            const d = `M${b.x - g.nw / 2 + 14} ${y}Q${(a.x + b.x) / 2} ${y + 62} ${a.x + g.nw / 2 - 14} ${y}`;
            return (
              <g>
                <path d={d} fill="none" stroke={C.bad} strokeWidth={1.6} strokeDasharray="4 4" opacity={back} />
                {back >= 1 && (
                  <path
                    d={`M${a.x + g.nw / 2 - 14} ${y}l-2 9M${a.x + g.nw / 2 - 14} ${y}l8 5`}
                    stroke={C.bad}
                    strokeWidth={1.6}
                    strokeLinecap="round"
                  />
                )}
              </g>
            );
          })()}
          {digit > 0 && noBack && (
            <g className="sx-pop">
              {(() => {
                const a = g.nodes[digit - 1];
                const b = g.nodes[digit];
                const cx = g.vertical ? a.x + 34 : (a.x + b.x) / 2;
                const cy = g.vertical ? (a.y + b.y) / 2 : a.y + g.nh / 2 + 37;
                return (
                  <>
                    <circle cx={cx} cy={cy} r={10} fill={C.ink900} stroke={C.bad} strokeWidth={1.5} />
                    <path d={`M${cx - 4} ${cy - 4}l8 8M${cx + 4} ${cy - 4}l-8 8`} stroke={C.bad} strokeWidth={1.8} strokeLinecap="round" />
                  </>
                );
              })()}
            </g>
          )}
          {g.nodes.map((n, pos) => {
            const op = appear[pos];
            const isEnd = pos === 3;
            const isRev = pos === digit && reveal > 0;
            const secret = pos < digit && reveal > 0;
            const v = valueAt(pos);
            const showHex = (isEnd && op > 0.5) || (pos >= digit && reveal > 0.5);
            const stroke = isRev ? C.cyan : isEnd ? (matched ? C.cyan : C.accentHi) : secret ? C.ink600 : C.accent;
            const fill = isRev ? "#0b2233" : C.ink850;
            const label = pos === 0 ? "secret start" : isEnd ? "public end" : isRev ? "revealed" : secret ? "stays secret" : "";
            return (
              <g key={pos} opacity={op} transform={`translate(${n.x} ${n.y})`}>
                {isRev && <circle r={g.nw * 0.75} fill="url(#sx-ch-glow)" opacity={reveal} />}
                <rect
                  x={-g.nw / 2}
                  y={-g.nh / 2}
                  width={g.nw}
                  height={g.nh}
                  rx={12}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={isRev || (isEnd && matched) ? 2 : 1.25}
                />
                <text x={-g.nw / 2 + 12} y={-g.nh / 2 + 19} fill={C.subtle} fontSize={10.5} className="mono">
                  position {pos}
                </text>
                <text
                  x={g.vertical ? g.nw / 2 - 12 : 0}
                  y={g.vertical ? -g.nh / 2 + 19 : -g.nh / 2 - 12}
                  fill={isRev ? C.cyan : isEnd ? C.accentHi : C.subtle}
                  fontSize={g.vertical ? 10.5 : 12}
                  textAnchor={g.vertical ? "end" : "middle"}
                >
                  {label}
                </text>
                {showHex && v ? (
                  <text x={-g.nw / 2 + 12} y={g.nh / 2 - 14} fill={isRev || (isEnd && matched) ? C.cyan : C.fg} fontSize={fontV} className="mono">
                    {g.vertical ? shortHex(v, 4, 3) : shortHex(v, 3, 3)}
                  </text>
                ) : (
                  <g transform={`translate(${-g.nw / 2 + 12} ${g.nh / 2 - 24})`}>
                    <rect width={12} height={9} y={4} rx={2} fill="none" stroke={C.ink500} strokeWidth={1.3} />
                    <path d="M3 4V2.5a3 3 0 0 1 6 0V4" fill="none" stroke={C.ink500} strokeWidth={1.3} />
                    <text x={20} y={12} fill={C.ink500} fontSize={fontV} className="mono">
                      {"•".repeat(12)}
                    </text>
                  </g>
                )}
                {isEnd && matched && (
                  <g className="sx-pop" transform={`translate(${g.nw / 2 - 2} ${-g.nh / 2 + 2})`}>
                    <circle r={10} fill={C.cyan} />
                    <path d="M-4.5 0.5l3 3 6-6.5" stroke={C.ink950} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  </g>
                )}
              </g>
            );
          })}
          {/* Who sees what. */}
          {g.vertical ? (
            <g fontSize={11} fill={C.subtle}>
              <text x={262} y={g.nodes[3].y + 4} opacity={appear[3]}>
                in the
              </text>
              <text x={262} y={g.nodes[3].y + 18} opacity={appear[3]}>
                public key
              </text>
              <text x={262} y={g.nodes[digit].y + 4} opacity={reveal} fill={C.cyan}>
                in the
              </text>
              <text x={262} y={g.nodes[digit].y + 18} opacity={reveal} fill={C.cyan}>
                signature
              </text>
            </g>
          ) : (
            <g fontSize={12} fill={C.subtle} textAnchor="middle">
              <text x={g.nodes[3].x} y={g.nodes[3].y + g.nh / 2 + 26} opacity={appear[3]}>
                in the public key
              </text>
              <text x={g.nodes[digit].x} y={g.nodes[digit].y + g.nh / 2 + 26} opacity={reveal} fill={C.cyan}>
                in the signature
              </text>
              <text x={(g.nodes[0].x + g.nodes[1].x) / 2} y={g.nodes[0].y - 10} fontSize={10} opacity={build[0]} fill={C.accentHi}>
                Keccak
              </text>
              <text x={(g.nodes[1].x + g.nodes[2].x) / 2} y={g.nodes[0].y - 10} fontSize={10} opacity={build[1]} fill={C.accentHi}>
                Keccak
              </text>
              <text x={(g.nodes[2].x + g.nodes[3].x) / 2} y={g.nodes[0].y - 10} fontSize={10} opacity={build[2]} fill={C.accentHi}>
                Keccak
              </text>
            </g>
          )}
          <text
            x={g.vertical ? 12 : 24}
            y={g.vertical ? 22 : 28}
            fontSize={11}
            fill={C.subtle}
            className="mono"
            opacity={appear[0]}
          >
            chain {chain} of the bottom key
          </text>
        </Stage>
      </div>
    </SceneFrame>
  );
}
