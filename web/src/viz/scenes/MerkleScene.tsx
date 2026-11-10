// Scene 4. The real bottom tree of this signature: 256 one-time keys, one lit, its 8 siblings and
// the climb to the root, in the look of the site's logo.
import { useMemo, useRef } from "react";
import { SceneFrame, Stage, useScene } from "../frame";
import { useWidth } from "../hooks";
import { useSample } from "../sample";
import { C, shortHex } from "../theme";
import { ease, span } from "../timeline";
import "../viz.css";

const BEATS = [0, 1.6, 3.6, 5.2, 7.2] as const;
const DUR = 11;
const H = 8;

interface Geo {
  w: number;
  h: number;
  x0: number;
  x1: number;
  top: number;
  bottom: number;
  readout: { x: number; y: number; anchor: "start" | "middle" };
}

const geometry = (compact: boolean): Geo =>
  compact
    ? { w: 360, h: 400, x0: 10, x1: 350, top: 70, bottom: 330, readout: { x: 180, y: 372, anchor: "middle" } }
    : { w: 760, h: 400, x0: 24, x1: 736, top: 62, bottom: 318, readout: { x: 380, y: 368, anchor: "middle" } };

export default function MerkleScene() {
  const { ex } = useSample();
  const box = useRef<HTMLDivElement>(null);
  const width = useWidth(box);
  const compact = width > 0 && width < 560;
  const g = geometry(compact);
  const { ref, tl, copy } = useScene("merkle", BEATS, DUR);
  const t = tl.t;

  const L = ex.layers[0];
  const e = L.leaf;
  const X = (z: number, j: number) => g.x0 + ((j + 0.5) / 2 ** (H - z)) * (g.x1 - g.x0);
  const Y = (z: number) => g.bottom - (z / H) * (g.bottom - g.top);

  // The whole tree as two static paths.
  const { edges, nodes } = useMemo(() => {
    let ed = "";
    let nd = "";
    for (let z = 1; z <= H; z++) {
      for (let j = 0; j < 2 ** (H - z); j++) {
        const px = X(z, j);
        const py = Y(z);
        for (const c of [2 * j, 2 * j + 1]) ed += `M${px.toFixed(1)} ${py.toFixed(1)}L${X(z - 1, c).toFixed(1)} ${Y(z - 1).toFixed(1)}`;
        const r = z === H ? 0 : 1 + z * 0.32;
        if (r) nd += `M${(px - r).toFixed(1)} ${py.toFixed(1)}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;
      }
    }
    for (let j = 0; j < 2 ** H; j++) {
      const x = X(0, j);
      nd += `M${(x - 0.6).toFixed(1)} ${(Y(0) - 3).toFixed(1)}h1.2v6h-1.2z`;
    }
    return { edges: ed, nodes: nd };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compact]);

  const grow = ease(t, 0.1, BEATS[1] + 1.4); // leaves, then levels upward
  const pick = ease(t, BEATS[2], BEATS[2] + 0.6);
  const sibP = span(t, BEATS[3], BEATS[3] + 1.6);
  const climb = span(t, BEATS[4], BEATS[4] + 3.0);
  const level = Math.min(H, Math.floor(climb * H + 1e-6)); // levels climbed so far
  const climbFrac = climb * H - level;
  const done = climb >= 1;

  const pathPts = Array.from({ length: H + 1 }, (_, z) => ({ x: X(z, e >> z), y: Y(z) }));
  const sibs = Array.from({ length: H }, (_, z) => ({ z, j: (e >> z) ^ 1 }));
  const clipY = g.bottom + 10 - grow * (g.bottom - g.top + 30);

  let litD = "";
  for (let z = 0; z < Math.min(level, H); z++) litD += `M${pathPts[z].x} ${pathPts[z].y}L${pathPts[z + 1].x} ${pathPts[z + 1].y}`;
  if (level < H && climb > 0) {
    const a = pathPts[level];
    const b = pathPts[level + 1];
    litD += `M${a.x} ${a.y}L${a.x + (b.x - a.x) * climbFrac} ${a.y + (b.y - a.y) * climbFrac}`;
  }

  const current = climb > 0 && L.nodes ? L.nodes[Math.min(level, H)] : L.otsPk;
  const readout =
    climb > 0
      ? done
        ? `root ${L.root ? shortHex(L.root, 6, 4) : ""} reached`
        : `level ${level}  ${current ? shortHex(current, 6, 4) : ""}`
      : pick > 0
        ? `key ${e} of 256  ${L.otsPk ? shortHex(L.otsPk, 6, 4) : ""}`
        : "256 one-time public keys";

  const steps = [...copy.steps];
  steps[2] = `This signature uses key ${e} of the bottom tree, numbered from 0.`;

  return (
    <SceneFrame sceneRef={ref} tl={tl} copy={copy} steps={steps}>
      <div ref={box} className="px-2 py-3 sm:px-4 sm:py-4">
        <Stage w={g.w} h={g.h} label={copy.figure}>
          <defs>
            <clipPath id="sx-m-grow">
              <rect x={0} y={clipY} width={g.w} height={g.h} />
            </clipPath>
            <filter id="sx-m-blur" filterUnits="userSpaceOnUse" x="0" y="0" width={g.w} height={g.h}>
              <feGaussianBlur stdDeviation="3.5" />
            </filter>
            <linearGradient id="sx-m-fade" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={C.accent} stopOpacity="0.55" />
              <stop offset="1" stopColor={C.ink500} stopOpacity="0.9" />
            </linearGradient>
          </defs>
          <g clipPath="url(#sx-m-grow)">
            <path d={edges} stroke="url(#sx-m-fade)" strokeWidth={compact ? 0.4 : 0.55} fill="none" opacity={climb > 0 || pick > 0 ? 0.55 : 0.85} />
            <path d={nodes} fill={C.ink500} />
          </g>
          {/* Siblings, revealed one level at a time. */}
          {sibs.map(({ z, j }) => {
            const p = span(sibP, z / H, (z + 1) / H);
            if (p <= 0) return null;
            const s = z === 0 ? 7 : 8 + z * 0.5;
            const used = climb > 0 && level > z;
            return (
              <rect
                key={z}
                x={X(z, j) - s / 2}
                y={Y(z) - s / 2}
                width={s}
                height={s}
                rx={2}
                fill={C.ink850}
                stroke={used ? C.accentHi : C.accent}
                strokeWidth={1.6}
                opacity={p}
                className="sx-pop"
              />
            );
          })}
          {/* The lit path. */}
          {climb > 0 && (
            <g>
              <path d={litD} stroke={C.cyan} strokeOpacity={0.35} strokeWidth={7} filter="url(#sx-m-blur)" fill="none" />
              <path d={litD} stroke={C.cyan} strokeWidth={2} fill="none" strokeLinecap="round" />
              {pathPts.slice(1, level + 1).map((p, z) => (
                <circle key={z} cx={p.x} cy={p.y} r={3.5 + z * 0.25} fill={C.cyan} className="sx-pop" />
              ))}
            </g>
          )}
          {/* The chosen leaf. */}
          {pick > 0 && (
            <g opacity={pick}>
              <circle cx={pathPts[0].x} cy={pathPts[0].y} r={16} fill={C.cyan} opacity={0.14} />
              <rect x={pathPts[0].x - 6} y={pathPts[0].y - 6} width={12} height={12} rx={3.5} fill={C.cyan} />
              <text x={pathPts[0].x} y={pathPts[0].y + 24} textAnchor="middle" fill={C.cyan} fontSize={11} className="mono">
                key {e}
              </text>
            </g>
          )}
          {/* Root. */}
          <g opacity={span(grow, 0.85, 1)}>
            <rect
              x={X(H, 0) - 8}
              y={Y(H) - 8}
              width={16}
              height={16}
              rx={4}
              fill={done ? C.cyan : C.ink850}
              stroke={done ? C.cyan : C.accentHi}
              strokeWidth={1.5}
              className={done ? "sx-glow" : undefined}
            />
            <text x={X(H, 0) + 16} y={Y(H) - 12} fill={done ? C.cyan : C.muted} fontSize={11.5}>
              root
            </text>
          </g>
          {sibP > 0 && (
            <text x={g.x1} y={g.top - 30} textAnchor="end" fill={C.accentHi} fontSize={11} opacity={span(sibP, 0, 0.2)}>
              {Math.min(H, Math.ceil(sibP * H))} of 8 siblings, {Math.min(H, Math.ceil(sibP * H)) * 16} bytes
            </text>
          )}
          <text x={g.x0} y={g.top - 30} fill={C.subtle} fontSize={11} className="mono" opacity={span(grow, 0.6, 1)}>
            bottom tree {ex.layers[0].tree.toLocaleString("en-US")}
          </text>
          <text x={g.readout.x} y={g.readout.y} textAnchor={g.readout.anchor} fontSize={compact ? 12 : 13} className="mono" fill={done ? C.cyan : C.fg} opacity={span(grow, 0.2, 0.6)}>
            {readout}
          </text>
        </Stage>
      </div>
    </SceneFrame>
  );
}
