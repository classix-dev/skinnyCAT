// ELI5 3. One-time keys are hashed in pairs into a Merkle tree, and its root is the public key.
// A signature carries one leaf and one sibling per level.
import { C } from "../../theme";
import { clamp, ease, span } from "../../timeline";
import { along, At, backOut, Cat, mix, NameTag, Stairs } from "../art";
import { Eli5Frame, useEli5Scene } from "../kit";

const BEATS = [0, 2.6, 5.4, 7.9] as const;
const DUR = 11.8;
const LEAF_Y = 286;
const ROOT: [number, number] = [240, 74];
const LEAF_COLORS = [C.cyan, C.violet, C.pink, C.warn, C.accent, C.bad, C.accentHi, "#b8f1ff"];
const PICK = 5;

interface Node {
  x: number;
  y: number;
  color: string;
}
const leaves: Node[] = LEAF_COLORS.map((color, i) => ({ x: 44 + i * 56, y: LEAF_Y - 26, color }));
const pairUp = (row: Node[], y: number): Node[] =>
  Array.from({ length: row.length / 2 }, (_, i) => ({ x: (row[2 * i].x + row[2 * i + 1].x) / 2, y, color: mix(row[2 * i].color, row[2 * i + 1].color) }));
const L1 = pairUp(leaves, 204);
const L2 = pairUp(L1, 142);
const ROWS = [leaves, L1, L2];
/** The picked leaf's ancestors per row, and its sibling per row. */
const pathIdx = [PICK, PICK >> 1, PICK >> 2];
const sibIdx = pathIdx.map((i) => i ^ 1);
const CLIMB: [number, number][] = [
  [leaves[PICK].x, leaves[PICK].y],
  [L1[pathIdx[1]].x, L1[pathIdx[1]].y],
  [L2[pathIdx[2]].x, L2[pathIdx[2]].y],
  [ROOT[0], ROOT[1] + 17],
];
/** The cat goes on past the line's end, up onto the tag's right shoulder. */
const CAT_PATH: [number, number][] = [...CLIMB, [ROOT[0] + 30, ROOT[1] + 17], [ROOT[0] + 30, ROOT[1] - 17]];
const len = (pts: [number, number][]) => pts.slice(1).reduce((a, p, i) => a + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0);
const LINE_LEN = len(CLIMB);
const CAT_LEN = len(CAT_PATH);

export default function TreeScene() {
  const scene = useEli5Scene("tree", BEATS, DUR);
  const t = scene.tl.t;

  const leafIn = leaves.map((_, i) => span(t, 0.2 + i * 0.2, 0.55 + i * 0.2));
  // Each row's parents grow from their two children.
  const rowIn = [
    leaves.map(() => 1),
    L1.map((_, i) => span(t, BEATS[1] + 0.2 + i * 0.3, BEATS[1] + 0.7 + i * 0.3)),
    L2.map((_, i) => span(t, BEATS[1] + 1.6 + i * 0.3, BEATS[1] + 2.1 + i * 0.3)),
  ];
  const rootEdges = span(t, BEATS[2] - 0.4, BEATS[2]);
  const rootIn = span(t, BEATS[2] + 0.1, BEATS[2] + 0.5);
  const toCollar = ease(t, BEATS[2] + 0.9, BEATS[2] + 1.7);

  const lit = span(t, BEATS[3], BEATS[3] + 0.3);
  const sibs = span(t, BEATS[3] + 0.3, BEATS[3] + 0.7);
  const climb = ease(t, BEATS[3] + 0.9, BEATS[3] + 3.1);
  const climbing = t >= BEATS[3] + 0.6;
  const [cx, cy] = along(CAT_PATH, climb);
  const lineDone = Math.min(LINE_LEN, climb * CAT_LEN);
  const onPath = (row: number, i: number) => climbing && pathIdx[row] === i && lineDone >= len(CLIMB.slice(0, row + 1)) - 0.5;

  return (
    <Eli5Frame scene={scene}>
      {/* Edges, each drawn as its parent appears. */}
      <g stroke={C.ink500} strokeWidth={2} fill="none" strokeLinecap="round">
        {[1, 2].map((r) =>
          ROWS[r].map((p, i) =>
            [0, 1].map((k) => {
              const c = ROWS[r - 1][2 * i + k];
              const p0 = rowIn[r][i];
              return p0 > 0 && <line key={`${r}${i}${k}`} x1={c.x} y1={c.y} x2={c.x + (p.x - c.x) * p0} y2={c.y + (p.y - c.y) * p0} />;
            }),
          ),
        )}
        {rootEdges > 0 &&
          L2.map((c, k) => <line key={`r${k}`} x1={c.x} y1={c.y} x2={c.x + (ROOT[0] - c.x) * rootEdges} y2={c.y + (ROOT[1] + 10 - c.y) * rootEdges} />)}
      </g>
      {climbing && (
        <path
          d={`M${CLIMB.map((p) => p.join(" ")).join("L")}`}
          stroke={C.cyan}
          strokeWidth={4}
          fill="none"
          strokeLinejoin="round"
          strokeDasharray={`${lineDone.toFixed(1)} ${LINE_LEN.toFixed(1)}`}
        />
      )}

      {/* The leaves, little staircases. */}
      {leaves.map((n, i) => {
        const picked = i === PICK && lit > 0;
        const sib = i === sibIdx[0] && sibs > 0;
        return (
          <At key={i} x={n.x} y={LEAF_Y} s={backOut(leafIn[i])}>
            {(picked || sib) && <rect x={-21} y={-30} width={42} height={36} rx={8} fill="none" stroke={picked ? C.cyan : C.accent} strokeWidth={2.2} />}
            <Stairs x={-14} floor={0} w={7} h={6} n={4} stroke={n.color} fill={C.ink850} />
          </At>
        );
      })}
      {/* The blended rows. */}
      {[1, 2].map((r) =>
        ROWS[r].map((n, i) => {
          const p = rowIn[r][i];
          const sib = sibIdx[r] === i && sibs > 0;
          const on = onPath(r, i);
          return (
            <At key={`${r}${i}`} x={n.x} y={n.y} s={backOut(span(p, 0.6, 1))}>
              {sib && <circle r={17} fill="none" stroke={C.accent} strokeWidth={2.4} />}
              <circle r={12} fill={n.color} stroke={on ? C.cyan : C.ink950} strokeWidth={on ? 3 : 2} className={on ? "e5-glow" : undefined} />
              <circle cx={-4} cy={-4} r={3} fill="#fff" opacity={0.4} />
            </At>
          );
        }),
      )}
      <At x={ROOT[0]} y={ROOT[1]} s={backOut(rootIn) * 1.15}>
        <NameTag label="Alice" />
      </At>
      <text x={ROOT[0] + 66} y={ROOT[1] + 5} fontSize={14} fill={C.cyan} opacity={rootIn}>
        public key
      </text>

      {/* Alice watches, gets her tag, then climbs her own path. */}
      {!climbing ? (
        <g>
          <Cat x={60} y={112} s={2.3} eyes={rootIn > 0 ? "happy" : "open"} look={0.6} tag={toCollar >= 1} />
          {toCollar > 0 && toCollar < 1 && <circle cx={ROOT[0] + (60 - ROOT[0]) * toCollar} cy={ROOT[1] + (112 - 16 - ROOT[1]) * toCollar - 30 * Math.sin(Math.PI * toCollar)} r={4} fill={C.cyan} />}
        </g>
      ) : (
        <At x={cx} y={cy - 2} s={backOut(span(t, BEATS[3] + 0.6, BEATS[3] + 0.9))}>
          <Cat x={0} y={0} s={1.8} eyes={climb >= 1 ? "happy" : "open"} idle={climb >= 1} />
        </At>
      )}

      {/* Under the leaves, how many there are, then what the signature carries. */}
      {sibs <= 0 ? (
        <text x={240} y={LEAF_Y + 24} fontSize={14} fill={C.subtle} textAnchor="middle" opacity={clamp(leafIn[7])}>
          8 sets of stairs here, millions for real
        </text>
      ) : (
        <g fontSize={14} opacity={sibs}>
          <path d={`M120 ${LEAF_Y + 19}h22`} stroke={C.cyan} strokeWidth={4} strokeLinecap="round" />
          <text x={150} y={LEAF_Y + 24} fill={C.fg}>
            the path
          </text>
          <circle cx={242} cy={LEAF_Y + 19} r={7} fill="none" stroke={C.accent} strokeWidth={2.4} />
          <text x={256} y={LEAF_Y + 24} fill={C.fg}>
            neighbors it carries
          </text>
        </g>
      )}
    </Eli5Frame>
  );
}
