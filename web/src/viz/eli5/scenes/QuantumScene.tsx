// ELI5 5. Shor's algorithm breaks ECDSA's lock. Against a hash, Grover's search only speeds up
// guessing, from about 2^128 to about 2^64 tries.
import { C } from "../../theme";
import { clamp, ease, lerp, span } from "../../timeline";
import { At, backOut, Blender, Cat, Cross, Fruit, Padlock, Pow, QuantumChandelier, type FruitKind } from "../art";
import { Eli5Frame, useEli5Scene } from "../kit";

const BEATS = [0, 2.4, 5.2, 8.6] as const;
const DUR = 12.6;
const FLOOR = 292;
const LOCK: [number, number] = [104, 214];
const BX = 352;
const QC: [number, number] = [232, 6];
const KINDS: FruitKind[] = ["cherry", "banana", "berry"];
const GUESSES = Array.from({ length: 9 }, (_, i) => ({ at: BEATS[2] + 0.5 + i * 0.62, kind: KINDS[i % 3] }));

export default function QuantumScene() {
  const scene = useEli5Scene("quantum", BEATS, DUR);
  const t = scene.tl.t;

  const drop = ease(t, 0.2, 1.4);
  const qcY = lerp(-130, QC[1], drop) + Math.sin(t * 2) * 2 * drop;
  const glow = clamp(0.3 + span(t, BEATS[1], BEATS[1] + 0.4) + span(t, BEATS[2], BEATS[2] + 0.4));
  const zap = t >= BEATS[1] + 0.3 && t < BEATS[1] + 1.2;
  const flick = zap && Math.floor(t * 20) % 3 !== 0;
  const open = ease(t, BEATS[1] + 1, BEATS[1] + 1.6);
  const broken = open > 0.5;
  const counterIn = span(t, 0.6, 1.1);
  const strike = span(t, BEATS[2] + 0.1, BEATS[2] + 0.5);
  const faster = span(t, BEATS[2] + 0.5, BEATS[2] + 0.9);
  const far = span(t, BEATS[3], BEATS[3] + 0.5);

  let spin = 0;
  let on = false;
  const flying: { x: number; y: number; r: number; kind: FruitKind; key: number }[] = [];
  let lastMiss = -1;
  GUESSES.forEach((g, i) => {
    const p = span(t, g.at, g.at + 0.5);
    if (p > 0 && p < 1) flying.push({ x: lerp(QC[0] + 18, BX, p), y: lerp(qcY + 90, FLOOR - 150, p) - 40 * Math.sin(Math.PI * p), r: p * 300, kind: g.kind, key: i });
    spin += span(t, g.at + 0.5, g.at + 0.8) * 500;
    on ||= t >= g.at + 0.5 && t < g.at + 0.8;
    if (t >= g.at + 0.8) lastMiss = i;
  });
  const missAge = lastMiss >= 0 ? t - (GUESSES[lastMiss].at + 0.8) : 99;

  return (
    <Eli5Frame scene={scene}>
      {/* Today's lock. */}
      <At x={LOCK[0]} y={LOCK[1]} s={1.15}>
        <Padlock open={open} color={broken ? C.bad : C.accentHi} label="ECDSA" />
      </At>
      <text x={LOCK[0]} y={FLOOR + 4} fontSize={14} textAnchor="middle" fill={broken ? C.bad : C.subtle}>
        {broken ? "picked open" : "today's keys"}
      </text>

      {/* The blender with Alice beside it. */}
      <At x={BX} y={FLOOR} s={0.8}>
        <Blender level={0.5} spin={spin} on={on} />
      </At>
      <Cat x={436} y={FLOOR} s={2.3} eyes={far > 0 ? "happy" : open > 0 ? "wide" : "open"} look={-0.8} flip />

      {/* Guesses needed. */}
      <g opacity={counterIn}>
        <text x={404} y={30} fontSize={14} textAnchor="middle" fill={C.subtle}>
          guesses needed
        </text>
        <g opacity={1 - 0.6 * strike}>
          <Pow base="2" exp="128" x={faster > 0 ? 372 : 404} y={68} size={faster > 0 ? 22 : 30} fill={C.fg} />
        </g>
        {strike > 0 && <line x1={faster > 0 ? 352 : 378} y1={60} x2={lerp(faster > 0 ? 352 : 378, faster > 0 ? 394 : 432, strike)} y2={60} stroke={C.bad} strokeWidth={3} strokeLinecap="round" />}
        {faster > 0 && (
          <At x={436} y={68} s={backOut(faster)}>
            <Pow base="2" exp="64" x={0} y={0} size={30} fill={C.cyan} />
          </At>
        )}
        {far > 0 && (
          <g opacity={far}>
            <text x={404} y={92} fontSize={14} textAnchor="middle" fill={C.cyan}>
              still far out of reach
            </text>
            <rect x={340} y={102} width={128} height={8} rx={4} fill={C.ink800} stroke={C.ink600} />
            <rect x={340} y={102} width={1.5} height={8} rx={1} fill={C.bad} />
            <text x={340} y={124} fontSize={11} fill={C.subtle}>
              tried so far
            </text>
          </g>
        )}
      </g>

      {/* The quantum computer. */}
      {zap && (
        <path
          d={`M${QC[0] - 8} ${qcY + 96}L${QC[0] - 40} ${qcY + 118}L${QC[0] - 30} ${qcY + 124}L${QC[0] - 78} ${qcY + 146}L${QC[0] - 66} ${qcY + 150}L${LOCK[0] + 26} ${LOCK[1] - 50}`}
          stroke={flick ? C.warn : C.cyan}
          strokeWidth={4}
          fill="none"
          strokeLinejoin="round"
          className="e5-glow"
        />
      )}
      <At x={QC[0]} y={qcY}>
        <QuantumChandelier glow={glow} t={t} />
      </At>
      <text x={QC[0]} y={qcY + 120} fontSize={14} textAnchor="middle" fill={C.subtle} opacity={drop}>
        quantum computer
      </text>
      {far > 0 && <path d={`M${QC[0] + 30} ${qcY + 30}q-4 6 0 9q4 -3 0 -9z`} fill={C.accentHi} opacity={far} />}

      {flying.map((f) => (
        <At key={f.key} x={f.x} y={f.y} r={f.r} s={0.9}>
          <Fruit kind={f.kind} />
        </At>
      ))}
      {lastMiss >= 0 && missAge < 0.55 && (
        <At x={BX + 46} y={FLOOR - 146} s={backOut(span(missAge, 0, 0.25)) * (1 - span(missAge, 0.35, 0.55))}>
          <Cross r={10} />
        </At>
      )}
    </Eli5Frame>
  );
}
