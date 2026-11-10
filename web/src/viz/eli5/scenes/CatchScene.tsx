// ELI5 6. The cost: 7,740 bytes against ECDSA's 65, about 14 times the gas of a plain transfer
// per send. Then the contract checks it and the skinny cat gets out of the box.
import { C } from "../../theme";
import { ease, lerp, span } from "../../timeline";
import { At, backOut, CatBox } from "../art";
import { Eli5Frame, useEli5Scene } from "../kit";

const BEATS = [0, 2.4, 5.6, 9.4] as const;
const DUR = 14.6;
const FLOOR = 300;
const NOTE: [number, number] = [52, 60];
const SCROLL_X0 = 104;
const SCROLL_X1 = 462;
const SCROLL_Y = 60;
const BOX: [number, number] = [384, FLOOR];
const BAR_X = 24;
const UNIT = 17;

/** A rolled end of the scroll, centered at (0, 0). */
function Roller() {
  return (
    <g>
      <rect x={-7} y={-28} width={14} height={56} rx={7} fill="#e8d9b0" stroke="#b39a5c" strokeWidth={1.4} />
      <rect x={-4} y={-33} width={8} height={66} rx={4} fill="#b39a5c" />
    </g>
  );
}

export default function CatchScene() {
  const scene = useEli5Scene("catch", BEATS, DUR);
  const t = scene.tl.t;

  const note = span(t, 0.3, 0.75);
  const scrollIn = span(t, BEATS[1], BEATS[1] + 0.35);
  const unroll = ease(t, BEATS[1] + 0.3, BEATS[1] + 2.2);
  const plain = ease(t, BEATS[2] + 0.2, BEATS[2] + 0.6);
  const ours = ease(t, BEATS[2] + 0.8, BEATS[2] + 2.8);
  // A rolled-up copy of the scroll flies into the box.
  const fly = ease(t, BEATS[3] + 0.2, BEATS[3] + 1.2);
  const check = span(t, BEATS[3] + 1.5, BEATS[3] + 2.6);
  const open = ease(t, BEATS[3] + 2.7, BEATS[3] + 3);
  const jump = ease(t, BEATS[3] + 2.9, BEATS[3] + 3.6);
  const tail = span(t, BEATS[3] + 3.6, BEATS[3] + 4.2);

  const width = (SCROLL_X1 - SCROLL_X0) * unroll;
  const rollerX = SCROLL_X0 + width;
  // The rolled scroll flies into the box.
  const sx = lerp(SCROLL_X1, BOX[0], fly);
  const sy = lerp(SCROLL_Y + 10, BOX[1] - 40, fly) - 40 * Math.sin(Math.PI * fly);
  const inBox = fly >= 1;

  return (
    <Eli5Frame scene={scene}>
      {/* Today's sticky note. */}
      <At x={NOTE[0]} y={NOTE[1]} r={-5} s={backOut(note)}>
        <rect x={-24} y={-24} width={48} height={48} rx={2} fill={C.warn} />
        <path d="M-24 18H24V24H-24Z" fill="#000" opacity={0.08} />
        <path d="M-14 -10h28M-14 -2h28M-14 6h18" stroke="#8a5a10" strokeWidth={2} strokeLinecap="round" opacity={0.6} />
      </At>
      <text x={NOTE[0]} y={NOTE[1] + 46} fontSize={14} fill={C.warn} textAnchor="middle" opacity={note}>
        65 bytes
      </text>

      {/* Alice's scroll. */}
      {scrollIn > 0 && (
        <g opacity={scrollIn}>
          {width > 1 && (
            <g>
              <rect x={SCROLL_X0} y={SCROLL_Y - 26} width={width} height={52} fill="#f4ead0" stroke="#b39a5c" strokeWidth={1.2} />
              <clipPath id="e5-scroll-clip">
                <rect x={SCROLL_X0} y={SCROLL_Y - 26} width={width} height={52} />
              </clipPath>
              <g clipPath="url(#e5-scroll-clip)" stroke="#b39a5c" strokeWidth={1.6} strokeLinecap="round" opacity={0.7}>
                {Array.from({ length: 22 }, (_, i) => (
                  <path key={i} d={`M${SCROLL_X0 + 12 + i * 16} ${SCROLL_Y - 14}v28M${SCROLL_X0 + 18 + i * 16} ${SCROLL_Y - 8}v16`} strokeDasharray="3 3" />
                ))}
              </g>
            </g>
          )}
          <At x={SCROLL_X0} y={SCROLL_Y}>
            <Roller />
          </At>
          <At x={rollerX} y={SCROLL_Y}>
            <Roller />
          </At>
          {fly > 0 && !inBox && (
            <At x={sx} y={sy} r={fly * 220} s={lerp(0.9, 0.55, fly)}>
              <Roller />
            </At>
          )}
        </g>
      )}
      <text x={(SCROLL_X0 + SCROLL_X1) / 2} y={SCROLL_Y + 46} fontSize={14} fill={C.fg} textAnchor="middle" opacity={span(unroll, 0.8, 1)}>
        7,740 bytes, as much as 119 sticky notes
      </text>

      {/* Gas. */}
      <g opacity={plain}>
        <text x={BAR_X} y={150} fontSize={14} fill={C.subtle}>
          gas for a plain transfer
        </text>
        <rect x={BAR_X} y={158} width={UNIT * plain} height={16} rx={4} fill={C.accentHi} />
        <text x={BAR_X} y={202} fontSize={14} fill={C.subtle}>
          gas for Alice's send
        </text>
        <rect x={BAR_X} y={210} width={Math.max(0.1, UNIT * 14 * ours)} height={16} rx={4} fill={C.warn} />
        {Array.from({ length: 13 }, (_, i) => (
          <line key={i} x1={BAR_X + UNIT * (i + 1)} y1={210} x2={BAR_X + UNIT * (i + 1)} y2={226} stroke={C.ink900} strokeOpacity={0.5} strokeWidth={1} opacity={UNIT * 14 * ours > UNIT * (i + 1) ? 1 : 0} />
        ))}
        <text x={BAR_X + UNIT * 14 * ours + 8} y={223} fontSize={15} fontWeight={700} fill={C.warn} opacity={span(ours, 0.95, 1)}>
          14×
        </text>
      </g>

      {/* The contract's box. */}
      <At x={BOX[0]} y={BOX[1]} s={0.9}>
        <CatBox open={open} jump={jump} tail={tail} shake={inBox && open === 0 ? check : 0} />
      </At>
      <text x={BOX[0]} y={FLOOR + 16} fontSize={14} textAnchor="middle" fill={jump > 0 ? C.cyan : C.subtle}>
        {jump > 0 ? "valid!" : inBox ? "checking…" : "contract"}
      </text>
      {inBox && open === 0 && (
        <g fill={C.cyan} opacity={0.8}>
          {[0, 1, 2].map((i) => (
            <circle key={i} cx={BOX[0] - 14 + i * 14} cy={BOX[1] - 66 - 6 * Math.abs(Math.sin(t * 8 + i))} r={3} />
          ))}
        </g>
      )}
    </Eli5Frame>
  );
}
