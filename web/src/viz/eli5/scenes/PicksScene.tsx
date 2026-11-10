// ELI5 4. The message's hash picks which FORS key signs, so the signer keeps no state, and one key
// covers 2^30 signatures.
import { C, fmt } from "../../theme";
import { clamp, ease, lerp, span } from "../../timeline";
import { At, backOut, Blender, Cat, Envelope, Heart } from "../art";
import { Eli5Frame, useEli5Scene } from "../kit";

const BEATS = [0, 3.2, 6.6, 9.9] as const;
const DUR = 12.6;
const FLOOR = 292;
const BX = 116;
const COLS = 12;
const ROWS = 7;
const TILE = 20;
const GAP = 5;
const GX = 164;
const GY = 58;
const N = COLS * ROWS;
const MAX = 2 ** 30;

const tileXY = (k: number): [number, number] => [GX + (k % COLS) * (TILE + GAP) + TILE / 2, GY + Math.floor(k / COLS) * (TILE + GAP) + TILE / 2];

/** A fixed shuffle of the tiles, so the same frame always lights the same ones. */
const ORDER = (() => {
  const a = Array.from({ length: N }, (_, i) => i);
  let s = 7;
  for (let i = N - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
})();

/** The three messages signed one by one: send, blend, point. */
const SENDS = [
  { at: 0.4, pace: 1 },
  { at: 3.4, pace: 0.65 },
  { at: 4.9, pace: 0.65 },
];
const phases = (s: (typeof SENDS)[number]) => {
  const fly: [number, number] = [s.at, s.at + 0.8 * s.pace];
  const spin: [number, number] = [fly[1], fly[1] + 0.7 * s.pace];
  const beam: [number, number] = [spin[1], spin[1] + 0.5 * s.pace];
  return { fly, spin, beam };
};

export default function PicksScene() {
  const scene = useEli5Scene("picks", BEATS, DUR);
  const t = scene.tl.t;

  let spin = 0;
  let on = false;
  let level = 0;
  const envs: { x: number; y: number; r: number }[] = [];
  const beams: { k: number; p: number }[] = [];
  let count = 0;
  SENDS.forEach((s, i) => {
    const ph = phases(s);
    const f = span(t, ...ph.fly);
    if (f > 0 && f < 1) envs.push({ x: lerp(64, BX, f), y: lerp(FLOOR - 40, FLOOR - 170, f) - 50 * Math.sin(Math.PI * f), r: f * 200 });
    spin += span(t, ...ph.spin) * 900;
    on ||= t >= ph.spin[0] && t < ph.spin[1];
    level = Math.max(level, 0.5 * Math.min(span(t, ph.spin[0], ph.spin[0] + 0.3), 1 - span(t, ph.beam[0], ph.beam[1])));
    const b = span(t, ...ph.beam);
    if (b > 0) beams.push({ k: ORDER[i], p: b });
    if (b >= 1) count = i + 1;
  });

  // The rush, every remaining tile lighting up while the count runs to 2^30.
  const rush = span(t, BEATS[2] + 0.2, BEATS[3] - 0.4);
  const rushLit = Math.floor(easeRush(rush) * (N - 3));
  if (rush > 0) count = Math.max(count, Math.round(3 * (MAX / 3) ** easeRush(rush)));
  const uses = (k: number) => {
    const pos = ORDER.indexOf(k);
    if (pos < count && pos < 3) return 1 + (rush > 0.6 ? 1 : 0) + (rush > 0.9 ? 1 : 0);
    if (pos >= 3 && pos - 3 < rushLit) return 1 + (rush > 0.75 && pos % 2 ? 1 : 0) + (rush >= 1 && pos % 3 === 0 ? 1 : 0);
    return 0;
  };

  const thought = span(t, BEATS[1] + 0.3, BEATS[1] + 0.7) * (1 - span(t, BEATS[2], BEATS[2] + 0.3));
  const lives = span(t, BEATS[3], BEATS[3] + 1.4);
  const done = count >= MAX;

  return (
    <Eli5Frame scene={scene}>
      {/* The counter. */}
      <text x={24} y={46} fontSize={done ? 19 : 26} fontWeight={700} fill={done ? C.cyan : C.fg} className="tabular-nums">
        {fmt(count)}
      </text>
      <text x={24} y={66} fontSize={14} fill={C.subtle}>
        {count === 1 ? "signature" : "signatures"}
      </text>
      {done && (
        <text x={24} y={84} fontSize={14} fill={C.cyan}>
          about a billion
        </text>
      )}

      {/* Spots to sign from. */}
      {Array.from({ length: N }, (_, k) => {
        const [x, y] = tileXY(k);
        const u = uses(k);
        return (
          <g key={k} transform={`translate(${x} ${y})`}>
            <rect x={-TILE / 2} y={-TILE / 2} width={TILE} height={TILE} rx={4} fill={u ? C.cyan : C.ink800} fillOpacity={u ? 0.25 + 0.25 * u : 1} stroke={u ? C.cyan : C.ink600} strokeWidth={1.2} />
            <path d="M-6 6V2H-2V-2H2V-6H6V6Z" fill={u ? C.cyan : C.ink600} opacity={u ? 0.9 : 0.8} />
          </g>
        );
      })}
      <text x={GX + (COLS * (TILE + GAP)) / 2} y={GY + ROWS * (TILE + GAP) + 16} fontSize={14} fill={C.subtle} textAnchor="middle">
        {COLS * ROWS} spots here, 67 million for real
      </text>

      {beams.map(({ k, p }) => {
        const [x, y] = tileXY(k);
        const x0 = BX;
        const y0 = FLOOR - 172;
        const live = p < 1;
        return (
          <g key={k}>
            {live && <line x1={x0} y1={y0} x2={lerp(x0, x, ease(p, 0, 1))} y2={lerp(y0, y, ease(p, 0, 1))} stroke={C.cyan} strokeWidth={3} strokeDasharray="6 5" className="e5-glow" />}
            {p >= 1 && t < BEATS[2] + 0.2 && (
              <At x={x} y={y} s={backOut(span(t, 0, 1)) * 1}>
                <rect x={-TILE / 2 - 3} y={-TILE / 2 - 3} width={TILE + 6} height={TILE + 6} rx={6} fill="none" stroke={C.cyan} strokeWidth={2} />
              </At>
            )}
          </g>
        );
      })}

      <At x={BX} y={FLOOR} s={0.62}>
        <Blender level={level} spin={spin} on={on} lid={envs.length ? 1 : 0} />
      </At>
      {envs.map((e, i) => (
        <At key={i} x={e.x} y={e.y} r={e.r} s={1.1}>
          <Envelope />
        </At>
      ))}
      <Cat x={58} y={FLOOR} s={2.5} eyes={lives > 0 || thought > 0 ? "happy" : "open"} look={0.8} />

      {/* No list to keep. */}
      {thought > 0 && (
        <g opacity={thought}>
          <circle cx={60} cy={FLOOR - 70} r={3} fill={C.ink700} stroke={C.muted} />
          <circle cx={54} cy={FLOOR - 88} r={5} fill={C.ink700} stroke={C.muted} />
          <rect x={16} y={FLOOR - 154} width={64} height={52} rx={18} fill={C.ink700} stroke={C.muted} strokeWidth={1.2} />
          <g transform={`translate(48 ${FLOOR - 128})`}>
            <rect x={-11} y={-15} width={22} height={30} rx={2} fill={C.fg} />
            <path d="M-6 -8h12M-6 -2h12M-6 4h8" stroke={C.ink600} strokeWidth={1.8} strokeLinecap="round" />
            <path d="M-16 -16 16 16" stroke={C.bad} strokeWidth={3.2} strokeLinecap="round" />
          </g>
        </g>
      )}

      {/* Nine lives, next to a billion signatures. */}
      {lives > 0 && (
        <g>
          {Array.from({ length: 9 }, (_, i) => {
            const p = span(lives, i / 12, i / 12 + 0.3);
            return <Heart key={i} x={14 + i * 14} y={FLOOR - 120} s={backOut(p) * 1.05} />;
          })}
          <text x={70} y={FLOOR - 136} fontSize={14} fill={C.pink} textAnchor="middle" opacity={clamp(lives * 2 - 1)}>
            9 lives
          </text>
        </g>
      )}
    </Eli5Frame>
  );
}

/** Slow at first, then a rush, so the count climbs through every order of magnitude. */
function easeRush(p: number) {
  return clamp(p) ** 1.6;
}
