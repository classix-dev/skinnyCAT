// ELI5 1. A hash is a blender. Same fruit, same smoothie, and no way back.
import { C } from "../../theme";
import { clamp, ease, lerp, span } from "../../timeline";
import { At, backOut, Blender, bump, Cat, Check, Cross, easeIn, Fruit, Glass, type FruitKind } from "../art";
import { Eli5Frame, useEli5Scene } from "../kit";

const BEATS = [0, 2.7, 5.4, 8.6] as const;
const DUR = 11;
const FLOOR = 292;
const BX = 196;
const GLASS_X = [318, 404];
const FRUIT: FruitKind[] = ["berry", "banana", "cherry"];
const SMOOTHIE = C.cyan;
const FRUIT_MIX = "#c48cd8";

/** One blend, from fruit dropping in to the smoothie landing in a glass. */
interface Batch {
  drop: number;
  spin: [number, number];
  pour: [number, number];
  glass: number;
  pace: number;
}
const BATCHES: Batch[] = [
  { drop: 0.25, spin: [2.8, 4.1], pour: [4.2, 5.2], glass: 0, pace: 1 },
  { drop: 5.6, spin: [6.6, 7.3], pour: [7.4, 8.2], glass: 1, pace: 0.7 },
];

function fruitPose(t: number, b: Batch, j: number) {
  const a = b.drop + j * 0.32 * b.pace;
  const p = span(t, a, a + 0.6 * b.pace);
  const restX = BX + (j - 1) * 15;
  const restY = FLOOR - 70 - (j % 2) * 12;
  const y = lerp(FLOOR - 250, restY, easeIn(p));
  const shrink = 1 - span(t, b.spin[0], b.spin[0] + 0.7 * b.pace);
  const wobble = t > b.spin[0] ? Math.sin(t * 40 + j) * 4 * shrink : 0;
  return { x: restX + wobble, y, s: shrink, o: p > 0 ? 1 : 0, r: p * 140 * (j % 2 ? 1 : -1) };
}

export default function BlenderScene() {
  const scene = useEli5Scene("blender", BEATS, DUR);
  const t = scene.tl.t;

  // The blender's state at time t, summed over both batches.
  let level = 0;
  let spin = 0;
  let on = false;
  let lid = 0;
  for (const b of BATCHES) {
    const sp = span(t, b.spin[0], b.spin[1]);
    level += ease(t, b.spin[0], b.spin[0] + 0.6 * b.pace) * 0.55 * (1 - span(t, b.pour[0] + 0.1, b.pour[1] - 0.1));
    spin += sp * 1600 * b.pace;
    on ||= t >= b.spin[0] && t < b.spin[1];
    lid = Math.max(lid, bump(t, b.drop - 0.3, b.drop + 1.5 * b.pace, 0.3), bump(t, b.pour[0] - 0.1, b.pour[1], 0.2));
  }
  const shake = on ? Math.sin(t * 70) * 1.6 : 0;
  // Fruit-colored while it whirls, then smoothie.
  const cur = BATCHES[t >= BATCHES[1].drop ? 1 : 0];
  const blendColor = span(t, cur.spin[0], cur.spin[1]) < 0.45 ? FRUIT_MIX : SMOOTHIE;

  // Smoothie blobs hopping from the jar into each glass.
  const blobs = BATCHES.flatMap((b) =>
    [0, 1, 2].map((i) => {
      const a = b.pour[0] + i * 0.22 * b.pace;
      const q = span(t, a, a + 0.45 * b.pace);
      if (q <= 0 || q >= 1) return null;
      const x0 = BX + 10;
      const y0 = FLOOR - 160;
      const x1 = GLASS_X[b.glass];
      const y1 = FLOOR - 70;
      return { x: lerp(x0, x1, q), y: lerp(y0, y1, q) - 70 * 4 * q * (1 - q), key: `${b.glass}${i}` };
    }),
  );
  const glassLevel = BATCHES.map((b) => span(t, b.pour[0] + 0.25 * b.pace, b.pour[1]) * 0.82);

  const same = span(t, 8.1, 8.45);
  const back = ease(t, BEATS[3] + 0.3, BEATS[3] + 1.3);
  const noBack = span(t, BEATS[3] + 1.3, BEATS[3] + 1.65);
  const ghost = span(t, BEATS[3], BEATS[3] + 0.4);

  return (
    <Eli5Frame scene={scene}>
      {/* Alice watches from the left. */}
      <Cat x={70} y={FLOOR} s={2.7} eyes={on || same > 0 ? "happy" : "open"} look={0.8} />
      <At x={BX + shake} y={FLOOR}>
        <Blender
          level={level}
          color={blendColor}
          spin={spin}
          lid={lid}
          on={on}
          inside={null}
        />
      </At>
      {/* Fruit falls in front of the open jar, then whirls away into the smoothie. */}
      {BATCHES.map((b, bi) =>
        FRUIT.map((k, j) => {
          const f = fruitPose(t, b, j);
          return (
            <At key={`${bi}${k}`} x={f.x + shake} y={f.y} s={f.s * 1.25} r={f.r} o={f.o}>
              <Fruit kind={k} />
            </At>
          );
        }),
      )}
      {blobs.map(
        (b) =>
          b && (
            <circle key={b.key} cx={b.x} cy={b.y} r={8} fill={SMOOTHIE} opacity={0.95} />
          ),
      )}
      {GLASS_X.map((gx, i) => (
        <At key={gx} x={gx} y={FLOOR} o={i === 0 ? 1 : clamp(span(t, BATCHES[1].drop - 0.4, BATCHES[1].drop))}>
          <Glass level={glassLevel[i]} />
        </At>
      ))}
      {/* Same fruit, same smoothie. */}
      {same > 0 && (
        <g>
          <text x={(GLASS_X[0] + GLASS_X[1]) / 2} y={FLOOR - 40} fontSize={30} fontWeight={700} fill={C.cyan} textAnchor="middle" opacity={same}>
            =
          </text>
          <At x={(GLASS_X[0] + GLASS_X[1]) / 2} y={FLOOR - 128} s={backOut(same) * 1.3}>
            <Check />
          </At>
        </g>
      )}
      {/* No way back. */}
      {back > 0 && (
        <g>
          {FRUIT.map((k, j) => (
            <At key={k} x={BX - 30 + j * 30} y={44} s={1.1} o={ghost * 0.55}>
              <Fruit kind={k} />
            </At>
          ))}
          <path
            d={`M${GLASS_X[0]} ${FLOOR - 112}C${GLASS_X[0] + 10} 60 ${BX + 110} 36 ${BX + 52} 44`}
            stroke={C.bad}
            strokeWidth={3}
            strokeDasharray="7 6"
            fill="none"
            pathLength={100}
            strokeDashoffset={0}
            style={{ clipPath: `inset(0 0 0 ${((1 - back) * 100).toFixed(1)}% )` }}
          />
          <At x={BX + 118} y={58} s={backOut(noBack) * 1.4}>
            <Cross />
          </At>
        </g>
      )}
      <g fontSize={14} fill={C.subtle} textAnchor="middle" opacity={0.9}>
        <text x={BX} y={FLOOR + 20}>
          blender
        </text>
        <text x={GLASS_X[0]} y={FLOOR + 20}>
          smoothie
        </text>
        <text x={GLASS_X[1]} y={FLOOR + 20} opacity={clamp(span(t, BATCHES[1].drop - 0.4, BATCHES[1].drop))}>
          same again
        </text>
      </g>
    </Eli5Frame>
  );
}
