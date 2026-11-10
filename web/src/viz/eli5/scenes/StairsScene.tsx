// ELI5 2. Hash chains are staircases, a step up is one more blend, and the shown steps must add
// up to a fixed total (WOTS+C's sum of 128, here 8 over four staircases).
import { C } from "../../theme";
import { clamp, ease, lerp, span } from "../../timeline";
import { At, backOut, Cat, Check, Cross, Note, Stairs, Star, stepAt } from "../art";
import { Eli5Frame, useEli5Scene } from "../kit";

const BEATS = [0, 3, 6.8, 10.2, 13.6] as const;
const DUR = 16.2;
const FLOOR = 292;
const SW = 22;
const SH = 44;
const XS = [20, 140, 260, 380];
const DIGITS = [2, 1, 2, 2];
const TOTAL = 7;
const CHEAT = 1;

const at = (i: number, k: number) => stepAt(XS[i], FLOOR, SW, SH, k);

/** A note q steps up staircase i, hopping between steps. */
function notePos(i: number, q: number): [number, number] {
  const k0 = Math.min(3, Math.floor(q));
  const f = q - k0;
  const a = at(i, k0);
  const b = at(i, Math.min(3, k0 + 1));
  return [lerp(a[0], b[0], f), lerp(a[1], b[1], f) - 12 - 16 * Math.sin(Math.PI * f)];
}

export default function StairsScene() {
  const scene = useEli5Scene("stairs", BEATS, DUR);
  const t = scene.tl.t;

  const build = XS.map((_, i) => ease(t, 0.1 + i * 0.15, 0.7 + i * 0.15));
  const secrets = XS.map((_, i) => span(t, 0.9 + i * 0.15, 1.3 + i * 0.15));
  const stars = XS.map((_, i) => span(t, 1.6 + i * 0.15, 2 + i * 0.15));

  // Signing, each shown note climbs from the secret to its digit.
  const rise = DIGITS.map((d, i) => {
    const a = BEATS[1] + 0.3 + i * 0.55;
    return d * span(t, a, a + 0.42 * d);
  });
  const arrived = DIGITS.map((d, i) => rise[i] >= d - 1e-6 && t > BEATS[1] + 0.3 + i * 0.55);
  // Verifying, a copy climbs on to the top.
  const climb = DIGITS.map((d, i) => {
    const a = BEATS[2] + 0.3 + i * 0.5;
    return d + (3 - d) * span(t, a, a + 0.42 * Math.max(1, 3 - d));
  });
  const matched = DIGITS.map((d, i) => t >= BEATS[2] + 0.3 + i * 0.5 + 0.42 * Math.max(1, 3 - d));

  // The cheat.
  const sneak = span(t, BEATS[3], BEATS[3] + 0.4);
  const push = ease(t, BEATS[3] + 0.7, BEATS[3] + 1.3);
  const caught = span(t, BEATS[3] + 1.5, BEATS[3] + 1.9);
  const down = ease(t, BEATS[4] + 0.2, BEATS[4] + 1);
  const noDown = span(t, BEATS[4] + 1, BEATS[4] + 1.35);

  const shown = DIGITS.map((d, i) => (i === CHEAT ? d + push : d));
  const terms = shown.map((d) => Math.round(d));
  const sum = terms.reduce((a, b) => a + b, 0);
  const allIn = arrived.every(Boolean);
  const bad = caught > 0;

  return (
    <Eli5Frame scene={scene}>
      <Cat x={40} y={92} s={2.1} eyes={bad ? "wide" : allIn ? "happy" : "open"} look={0.7} />
      {/* The running total. */}
      <text x={276} y={42} fontSize={28} fontWeight={700} textAnchor="middle" fill={C.fg}>
        {terms.map((d, i) => (
          <tspan key={i} fill={i === CHEAT && bad ? C.bad : C.fg} opacity={arrived[i] ? 1 : 0.18}>
            {arrived[i] ? d : "?"}
            {i < 3 ? " + " : ""}
          </tspan>
        ))}
        <tspan fill={bad ? C.bad : allIn ? C.cyan : C.subtle} opacity={allIn ? 1 : 0.18}>
          {" "}= {allIn ? sum : TOTAL}
        </tspan>
      </text>
      <text x={276} y={64} fontSize={14} textAnchor="middle" fill={bad ? C.bad : C.subtle}>
        {bad ? `should be ${TOTAL}, caught!` : `must add up to ${TOTAL}`}
      </text>
      {bad && (
        <At x={420} y={33} s={backOut(caught) * 1.2}>
          <Cross />
        </At>
      )}

      {XS.map((x, i) => {
        const top = at(i, 3);
        const bottom = at(i, 0);
        const [nx, ny] = notePos(i, i === CHEAT ? rise[i] + push : rise[i]);
        const [vx, vy] = notePos(i, climb[i]);
        const verifying = t >= BEATS[2] + 0.3 + i * 0.5 && !matched[i];
        return (
          <g key={x} opacity={build[i]}>
            <Stairs x={x} floor={FLOOR} w={SW} h={SH} />
            <At x={top[0]} y={top[1] - 24} s={backOut(stars[i])}>
              <Star r={10} className={matched[i] ? "e5-glow" : undefined} />
            </At>
            {/* The secret, locked at the bottom. */}
            <At x={bottom[0]} y={bottom[1] - 12} s={backOut(secrets[i])}>
              <Note locked />
            </At>
            {/* The verifier's copy on its way to the top. */}
            {verifying && (
              <At x={vx} y={vy}>
                <Note glow />
              </At>
            )}
            {/* The note in the signature. */}
            {rise[i] > 0 && (
              <At x={nx} y={ny} r={(rise[i] % 1) * 360}>
                <Note glow={i === CHEAT && push > 0 ? false : arrived[i]} color={i === CHEAT && bad ? "#ffd0d6" : undefined} />
              </At>
            )}
            {arrived[i] && (
              <text x={nx} y={ny - 16} fontSize={15} fontWeight={700} textAnchor="middle" fill={i === CHEAT && bad ? C.bad : C.cyan}>
                {terms[i]}
              </text>
            )}
            {matched[i] && !(i === CHEAT && bad) && (
              <At x={top[0] + 16} y={top[1] - 36} s={backOut(span(t, BEATS[2] + 0.3 + i * 0.5 + 0.42 * Math.max(1, 3 - DIGITS[i]), BEATS[2] + 0.7 + i * 0.5 + 0.42 * Math.max(1, 3 - DIGITS[i]))) * 0.8}>
                <Check />
              </At>
            )}
          </g>
        );
      })}

      {/* The sneak, and the step he can't take back down. */}
      {sneak > 0 && (
        <g>
          <At x={122} y={FLOOR} s={backOut(sneak)}>
            <Cat x={0} y={0} s={1.55} who="sneak" eyes={down > 0 ? "wide" : "open"} look={1} flip />
          </At>
          {push > 0 && push < 1 && (
            <path d={`M130 ${FLOOR - 40}Q150 ${FLOOR - 120} ${at(CHEAT, 2)[0]} ${at(CHEAT, 2)[1] - 24}`} stroke={C.violet} strokeWidth={2} strokeDasharray="4 4" fill="none" opacity={1 - push} />
          )}
        </g>
      )}
      {down > 0 && (() => {
        // On the last staircase, from its note down one step.
        const i = 3;
        const [x1, y1] = at(i, DIGITS[i]);
        const [x2, y2] = at(i, DIGITS[i] - 1);
        const a: [number, number] = [x1 - 14, y1 - 8];
        const b: [number, number] = [x2 - 4, y2 - 22];
        const ctl: [number, number] = [x2 - 22, y1 - 24];
        // A point along the quadratic curve at fraction p.
        const q = (p: number) => [0, 1].map((k) => (1 - p) ** 2 * a[k] + 2 * (1 - p) * p * ctl[k] + p * p * b[k]);
        const [ex, ey] = q(down);
        const [px, py] = q(Math.max(0, down - 0.08));
        const ang = Math.atan2(ey - py, ex - px);
        return (
          <g>
            <path d={`M${a[0]} ${a[1]}Q${lerp(a[0], ctl[0], down)} ${lerp(a[1], ctl[1], down)} ${ex} ${ey}`} stroke={C.bad} strokeWidth={2.6} strokeDasharray="5 4" fill="none" />
            <path
              d={`M${ex} ${ey}l${-8 * Math.cos(ang - 0.5)} ${-8 * Math.sin(ang - 0.5)}M${ex} ${ey}l${-8 * Math.cos(ang + 0.5)} ${-8 * Math.sin(ang + 0.5)}`}
              stroke={C.bad}
              strokeWidth={2.6}
              strokeLinecap="round"
            />
            <At x={ctl[0] + 4} y={ctl[1] + 10} s={backOut(noDown)}>
              <Cross r={10} />
            </At>
          </g>
        );
      })()}

      <g fontSize={14} fill={C.subtle} textAnchor="middle" opacity={clamp(secrets[0])}>
        <text x={240} y={FLOOR + 20}>
          secret notes at the bottom, public stars on top
        </text>
      </g>
    </Eli5Frame>
  );
}
