// The picture-book pieces the ELI5 scenes are drawn from, in the skinnyCAT style (see
// components/Cats.tsx and catArt.ts). Every piece is a pure function of its props, so a scene
// stays a pure function of its clock. The only CSS motion is idle fidgeting (eli5.css), which
// reduced motion turns off.
import { useId, type ReactNode } from "react";
import { C } from "../theme";
import { clamp, lerp } from "../timeline";

export const FUR = "#c9d6ff";
export const PAPER = "#e9eeff";

type Pt = readonly [number, number];

/** Overshooting ease for pops, 0..1 with a little bounce past 1. */
export const backOut = (p: number) => {
  const q = clamp(p) - 1;
  return 1 + 2.7 * q * q * q + 1.7 * q * q;
};
export const easeIn = (p: number) => clamp(p) ** 2;
/** A 0..1..0 bump that ramps up over [a, a+r] and down over [b-r, b]. */
export const bump = (t: number, a: number, b: number, r = 0.25) => clamp(Math.min((t - a) / r, (b - t) / r));

/** Mixes hex colors, the way blending mixes fruit. */
export function mix(...hex: string[]): string {
  const rgb = hex.map((h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)));
  const avg = [0, 1, 2].map((k) => Math.round(rgb.reduce((a, c) => a + c[k], 0) / rgb.length));
  return `#${avg.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** Where a point at fraction t of a polyline's length sits. */
export function along(pts: readonly Pt[], t: number): Pt {
  const segs = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]));
  let d = clamp(t) * segs.reduce((a, b) => a + b, 0);
  for (let i = 0; i < segs.length; i++) {
    if (d <= segs[i] || i === segs.length - 1) {
      const f = segs[i] ? Math.min(1, d / segs[i]) : 0;
      return [lerp(pts[i][0], pts[i + 1][0], f), lerp(pts[i][1], pts[i + 1][1], f)];
    }
    d -= segs[i];
  }
  return pts[pts.length - 1];
}

/** Places children at (x, y), scaled about that point. */
export function At({ x, y, s = 1, r = 0, o = 1, children }: { x: number; y: number; s?: number; r?: number; o?: number; children: ReactNode }) {
  if (o <= 0.001 || s <= 0.001) return null;
  return (
    <g transform={`translate(${x.toFixed(2)} ${y.toFixed(2)})${r ? ` rotate(${r.toFixed(2)})` : ""}${s !== 1 ? ` scale(${s.toFixed(3)})` : ""}`} opacity={o < 1 ? o : undefined}>
      {children}
    </g>
  );
}

/** Text with a 2^64 style power, for SVG. */
export function Pow({ base, exp, x, y, size, fill, anchor = "middle", weight = 600 }: { base: string; exp: string; x: number; y: number; size: number; fill: string; anchor?: "start" | "middle" | "end"; weight?: number }) {
  return (
    <text x={x} y={y} fontSize={size} fill={fill} textAnchor={anchor} fontWeight={weight}>
      {base}
      <tspan dy={-size * 0.42} fontSize={size * 0.62}>
        {exp}
      </tspan>
    </text>
  );
}

// ---------------------------------------------------------------------------
// Cats
// ---------------------------------------------------------------------------

export type Eyes = "open" | "happy" | "wide" | "shut";

/**
 * A sitting cat with its feet at (0, 0), about 24 units tall before scaling. Alice wears a collar
 * with a cyan tag, the sneak wears a bandit mask. `look` shifts the pupils, -1 left to 1 right.
 */
export function Cat({
  x,
  y,
  s = 1,
  who = "alice",
  eyes = "open",
  look = 0,
  flip = false,
  tag = true,
  idle = true,
}: {
  x: number;
  y: number;
  s?: number;
  who?: "alice" | "sneak";
  eyes?: Eyes;
  look?: number;
  flip?: boolean;
  tag?: boolean;
  idle?: boolean;
}) {
  const fur = who === "sneak" ? C.violet : FUR;
  const sw = 1.6;
  const ex = look * 0.8;
  return (
    <g transform={`translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${flip ? -s : s} ${s})`}>
      <g className={idle ? "e5-bob" : undefined} fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path className={idle ? "e5-tail" : undefined} d="M4.2 -1.4C10.5 -1.6 13 -5.2 11.6 -10.8" stroke={fur} strokeWidth={sw} />
        <path d="M-3.4 -8.4Q-5.4 -4 -4.8 0H4.8Q5.4 -4 3.4 -8.4" stroke={fur} strokeWidth={sw} fill={C.ink900} />
        <path d="M-2.6 0V-2.4M2.6 0V-2.4" stroke={fur} strokeWidth={sw * 0.7} strokeOpacity={0.7} />
        <path d="M-6.4 -13.6 -6.8 -22.4 -2.6 -18.6H2.6L6.8 -22.4 6.4 -13.6Q6.4 -8.2 0 -8.2T-6.4 -13.6Z" stroke={fur} strokeWidth={sw} fill={C.ink900} />
        {who === "sneak" && <path d="M-6.3 -15.6Q0 -17.4 6.3 -15.6V-12.2Q0 -13.6 -6.3 -12.2Z" fill={C.ink950} stroke={C.violet} strokeWidth={0.7} />}
        <g className={idle && eyes === "open" ? "e5-blink" : undefined}>
          {eyes === "open" && (
            <g fill={C.cyan}>
              <ellipse cx={-2.5 + ex} cy={-13.6} rx={1.15} ry={1.55} />
              <ellipse cx={2.5 + ex} cy={-13.6} rx={1.15} ry={1.55} />
            </g>
          )}
          {eyes === "wide" && (
            <g fill={C.cyan} stroke={C.cyan} strokeWidth={0.4}>
              <circle cx={-2.6} cy={-13.8} r={1.7} fill={C.ink950} />
              <circle cx={2.6} cy={-13.8} r={1.7} fill={C.ink950} />
              <circle cx={-2.6} cy={-13.8} r={0.6} />
              <circle cx={2.6} cy={-13.8} r={0.6} />
            </g>
          )}
          {eyes === "happy" && <path d="M-3.8 -13.2q1.3 -1.4 2.6 0M1.2 -13.2q1.3 -1.4 2.6 0" stroke={C.cyan} strokeWidth={0.9} />}
          {eyes === "shut" && <path d="M-3.8 -13.4q1.3 1 2.6 0M1.2 -13.4q1.3 1 2.6 0" stroke={fur} strokeWidth={0.9} />}
        </g>
        <path d="M-0.7 -11.2h1.4l-0.7 0.8z" fill={fur} stroke={fur} strokeWidth={0.4} />
        <path d="M-6.4 -11.8-9.6 -12.4M-6.4 -10.6-9.2 -9.8M6.4 -11.8 9.6 -12.4M6.4 -10.6 9.2 -9.8" stroke={C.accent} strokeWidth={0.6} />
        {who === "alice" && (
          <>
            <path d="M-3.9 -8.7Q0 -6.9 3.9 -8.7" stroke={C.cyan} strokeWidth={0.9} />
            {tag && <circle cx={0} cy={-6.9} r={1.1} fill={C.cyan} />}
          </>
        )}
      </g>
    </g>
  );
}

/**
 * The skinny cat from the logo, jumping out of a box. `open` swings the flaps (0..1), `jump`
 * lifts the cat out (0..1), `tail` draws the lit tail path (0..1). Box bottom center at (0, 0),
 * 100 wide and 56 tall.
 */
export function CatBox({ open, jump, tail, shake = 0 }: { open: number; jump: number; tail: number; shake?: number }) {
  const clip = `e5-box-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const rise = lerp(54, 0, jump);
  const sx = Math.sin(shake * Math.PI * 6) * 3 * (1 - shake);
  return (
    <g strokeLinecap="round" strokeLinejoin="round" fill="none">
      <defs>
        <clipPath id={clip}>
          <rect x={-80} y={-200} width={160} height={144} />
        </clipPath>
      </defs>
      {/* The tail, the lit Merkle path from the logo, ending at the root square. */}
      {tail > 0 && (
        <g>
          <path d="M22 -14H40V-38H56V-82" stroke={C.cyan} strokeWidth={4} pathLength={1} strokeDasharray={`${tail} 1`} />
          <g fill={C.cyan} opacity={clamp(tail * 2 - 0.4)}>
            <circle cx={40} cy={-14} r={4.2} />
            <circle cx={40} cy={-38} r={4.2} />
            <circle cx={56} cy={-38} r={4.2} />
          </g>
          <rect x={49} y={-98} width={14} height={14} rx={3.6} fill={C.cyan} opacity={clamp(tail * 3 - 2)} className={tail >= 1 ? "e5-glow" : undefined} />
        </g>
      )}
      <g clipPath={`url(#${clip})`}>
        <g transform={`translate(0 ${rise.toFixed(2)})`} opacity={jump > 0 ? 1 : 0}>
          <path d="M-19 -100 -20 -127 -6.4 -115.4H6.4L20 -127 19 -100Q19 -83 0 -83T-19 -100Z" stroke={FUR} strokeWidth={3.6} fill={C.ink900} />
          <path d="M-9 -84Q-10.8 -72 -10 -52M9 -84Q10.8 -72 10 -52" stroke={FUR} strokeWidth={3.6} />
          <g fill={C.cyan}>
            <ellipse cx={-7.4} cy={-99.2} rx={3.4} ry={4.4} />
            <ellipse cx={7.4} cy={-99.2} rx={3.4} ry={4.4} />
          </g>
          <path d="M-1.4 -92.6h2.8l-1.4 1.6z" fill={FUR} stroke={FUR} strokeWidth={0.8} />
          <path d="M-20 -94.6-31 -96.4M-20 -90.2-30 -87.8M20 -94.6 31 -96.4M20 -90.2 30 -87.8" stroke={C.accent} strokeWidth={2} />
        </g>
      </g>
      <g transform={`translate(${sx.toFixed(2)} 0)`}>
        <path d="M-50 -56H50V0H-50Z" fill={C.ink850} stroke={C.accent} strokeWidth={3.6} />
        <path d="M-20 -26h40" stroke={C.accent} strokeOpacity={0.4} strokeWidth={2.4} />
        {/* Flaps, closed flat on top, swinging out to about 45 degrees. */}
        <path d={`M-50 -56L${lerp(0, -50 - 12, open)} ${lerp(-56, -56 - 12, open)}`} stroke={C.accent} strokeWidth={3.6} />
        <path d={`M50 -56L${lerp(0, 50 + 10, open)} ${lerp(-56, -56 - 11, open)}`} stroke={C.accent} strokeWidth={3.6} />
      </g>
      {jump > 0.6 && (
        <g fill={FUR} opacity={clamp((jump - 0.6) * 4)}>
          <ellipse cx={-10} cy={-55} rx={5.6} ry={4} />
          <ellipse cx={10} cy={-55} rx={5.6} ry={4} />
        </g>
      )}
    </g>
  );
}

/** Nine lives, or any number of small hearts. */
export function Heart({ x, y, s = 1, fill = C.pink }: { x: number; y: number; s?: number; fill?: string }) {
  return <path transform={`translate(${x} ${y}) scale(${s})`} d="M0 3.2C-6 -1-5.6-6.4-2.4-6.4-1-6.4 0-5.2 0-4.2 0-5.2 1-6.4 2.4-6.4 5.6-6.4 6-1 0 3.2Z" fill={fill} />;
}

// ---------------------------------------------------------------------------
// The blender, fruit and smoothies
// ---------------------------------------------------------------------------

export type FruitKind = "berry" | "banana" | "cherry";
export const FRUIT_COLOR: Record<FruitKind, string> = { berry: C.violet, banana: C.warn, cherry: C.bad };

/** A piece of fruit centered at (0, 0), about 20 units across. */
export function Fruit({ kind }: { kind: FruitKind }) {
  if (kind === "banana")
    return (
      <g>
        <path d="M-11 -5Q-4 13 11 -7Q0 -1 -11 -5Z" fill={C.warn} stroke="#c98a20" strokeWidth={1} strokeLinejoin="round" />
        <path d="M-11 -5l-1.6 -1.4M11 -7l1.4 -1.8" stroke="#8a5a10" strokeWidth={1.8} strokeLinecap="round" />
      </g>
    );
  if (kind === "cherry")
    return (
      <g>
        <path d="M-4 -1Q-1 -10 4 -12M5 1Q4 -8 4 -12" stroke="#5fbf7a" strokeWidth={1.3} fill="none" strokeLinecap="round" />
        <circle cx={-4.5} cy={3} r={5.4} fill={C.bad} />
        <circle cx={5} cy={4.4} r={5.4} fill={C.bad} />
        <circle cx={-6} cy={1.4} r={1.4} fill="#fff" opacity={0.6} />
        <circle cx={3.6} cy={2.8} r={1.4} fill="#fff" opacity={0.6} />
      </g>
    );
  return (
    <g>
      {[
        [-3.4, -2.2],
        [3.4, -2.2],
        [0, 3.4],
        [-4.6, 4],
        [4.6, 4],
        [0, -6.8],
      ].map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r={3.6} fill={C.violet} stroke="#7a6ad6" strokeWidth={0.8} />
      ))}
      <path d="M-2 -10.4 0 -8.6 2 -10.4" stroke="#5fbf7a" strokeWidth={1.4} fill="none" strokeLinecap="round" />
    </g>
  );
}

// Blender geometry, origin at the bottom center of the base.
const JAR = "M-38 -150H38L27 -52H-27Z";
const JAR_TOP = -150;
const JAR_BOTTOM = -52;

/**
 * The magic blender, 80 wide and about 165 tall. `level` is the smoothie in the jar (0..1),
 * `spin` the blade angle in degrees, `lid` how far the lid is lifted (0..1), `on` lights the button.
 */
export function Blender({ level = 0, color = C.cyan, spin = 0, lid = 0, on = false, inside }: { level?: number; color?: string; spin?: number; lid?: number; on?: boolean; inside?: ReactNode }) {
  const clip = `e5-jar-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const top = lerp(JAR_BOTTOM, JAR_TOP + 6, clamp(level));
  return (
    <g strokeLinejoin="round" strokeLinecap="round">
      <defs>
        <clipPath id={clip}>
          <path d={JAR} />
        </clipPath>
      </defs>
      {/* Base with its button. */}
      <path d="M-34 -52H34L42 -4Q42 0 38 0H-38Q-42 0 -42 -4Z" fill={C.ink800} stroke={C.accent} strokeWidth={2.6} />
      <circle cx={0} cy={-26} r={7} fill={on ? C.cyan : C.ink700} stroke={on ? C.cyan : C.accent} strokeWidth={2} className={on ? "e5-glow" : undefined} />
      {/* Jar, its contents and the blades. */}
      <path d={JAR} fill={C.ink900} fillOpacity={0.85} />
      <g clipPath={`url(#${clip})`}>
        {level > 0.001 && (
          <>
            <rect x={-40} y={top} width={80} height={JAR_BOTTOM - top + 2} fill={color} opacity={0.88} />
            <path d={`M-40 ${top}Q-20 ${top - 4} 0 ${top}T40 ${top}`} stroke="#fff" strokeOpacity={0.35} strokeWidth={1.5} fill="none" />
          </>
        )}
        {inside}
      </g>
      <g transform={`translate(0 -60) rotate(${spin.toFixed(1)})`}>
        <path d="M-16 0Q-8 -5 0 0Q8 5 16 0" stroke={C.accentHi} strokeWidth={3} fill="none" />
        <circle r={3} fill={C.accentHi} />
      </g>
      <path d={JAR} fill="none" stroke={C.accentHi} strokeWidth={2.6} />
      <path d="M-28 -140 -21 -66" stroke="#fff" strokeOpacity={0.22} strokeWidth={3} />
      {/* The lid tips open from its left hinge. */}
      <g transform={`rotate(${(-38 * clamp(lid)).toFixed(1)} -40 -150)`}>
        <rect x={-42} y={-162} width={84} height={12} rx={4} fill={C.accent} />
        <rect x={-8} y={-170} width={16} height={8} rx={3} fill={C.accentHi} />
      </g>
    </g>
  );
}

/** A glass, bottom center at (0, 0), 44 wide and 86 tall. `level` 0..1. */
export function Glass({ level, color = C.cyan, straw = true }: { level: number; color?: string; straw?: boolean }) {
  const clip = `e5-glass-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const shape = "M-22 -86H22L16 0H-16Z";
  const top = lerp(0, -80, clamp(level));
  return (
    <g strokeLinejoin="round">
      <defs>
        <clipPath id={clip}>
          <path d={shape} />
        </clipPath>
      </defs>
      {straw && level > 0.5 && <path d="M6 -60 14 -104H26" stroke={C.pink} strokeWidth={4} fill="none" strokeLinecap="round" />}
      <path d={shape} fill={C.ink900} fillOpacity={0.8} />
      {level > 0.001 && <rect clipPath={`url(#${clip})`} x={-24} y={top} width={48} height={-top} fill={color} opacity={0.9} />}
      <path d={shape} fill="none" stroke={C.accentHi} strokeWidth={2.4} />
      <path d="M-15 -78 -11 -10" stroke="#fff" strokeOpacity={0.22} strokeWidth={2.6} strokeLinecap="round" />
    </g>
  );
}

// ---------------------------------------------------------------------------
// Notes, stairs, tags, locks and marks
// ---------------------------------------------------------------------------

/** A folded note, centered at (0, 0), 24 by 18. */
export function Note({ glow = false, locked = false, color = PAPER }: { glow?: boolean; locked?: boolean; color?: string }) {
  return (
    <g>
      <path d="M-12 -9H8L12 -5V9H-12Z" fill={locked ? C.ink700 : color} stroke={glow ? C.cyan : locked ? C.ink500 : C.accentHi} strokeWidth={glow ? 2 : 1.2} strokeLinejoin="round" className={glow ? "e5-glow" : undefined} />
      <path d="M8 -9V-5H12" fill="none" stroke={locked ? C.ink500 : C.accent} strokeWidth={1} />
      {locked ? (
        <g transform="translate(0 1)" fill="none" stroke={C.muted} strokeWidth={1.4}>
          <rect x={-4.5} y={-2} width={9} height={7} rx={1.5} fill={C.ink600} />
          <path d="M-2.6 -2V-4.2a2.6 2.6 0 0 1 5.2 0V-2" />
        </g>
      ) : (
        <path d="M-7 -3H5M-7 1H7M-7 5H2" stroke={C.ink600} strokeWidth={1.4} strokeLinecap="round" />
      )}
    </g>
  );
}

/** A four-step staircase from (x, floor), each step `w` wide and `h` tall. */
export function Stairs({ x, floor, w, h, n = 4, stroke = C.accent, fill = C.ink800 }: { x: number; floor: number; w: number; h: number; n?: number; stroke?: string; fill?: string }) {
  let d = `M${x} ${floor}`;
  for (let k = 0; k < n; k++) d += `V${floor - (k + 1) * h}H${x + (k + 1) * w}`;
  d += `V${floor}Z`;
  return <path d={d} fill={fill} stroke={stroke} strokeWidth={1.6} strokeLinejoin="round" />;
}
/** The middle of the top of step k. */
export const stepAt = (x: number, floor: number, w: number, h: number, k: number): Pt => [x + k * w + w / 2, floor - (k + 1) * h];

/** A five-point star centered at (0, 0) with radius r. */
export function Star({ r = 8, fill = C.cyan, className }: { r?: number; fill?: string; className?: string }) {
  const pts = Array.from({ length: 10 }, (_, i) => {
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const rr = i % 2 ? r * 0.45 : r;
    return `${(Math.cos(a) * rr).toFixed(2)},${(Math.sin(a) * rr).toFixed(2)}`;
  }).join(" ");
  return <polygon points={pts} fill={fill} className={className} />;
}

/** A name tag centered at (0, 0). */
export function NameTag({ label, w = 92 }: { label: string; w?: number }) {
  return (
    <g>
      <path d={`M${-w / 2 + 14} -17H${w / 2 - 6}Q${w / 2} -17 ${w / 2} -11V11Q${w / 2} 17 ${w / 2 - 6} 17H${-w / 2 + 14}L${-w / 2} 0Z`} fill={C.cyan} className="e5-glow" />
      <circle cx={-w / 2 + 12} cy={0} r={3.4} fill={C.ink900} />
      <text x={6} y={5.4} fontSize={15} fontWeight={700} fill={C.ink950} textAnchor="middle">
        {label}
      </text>
    </g>
  );
}

/** A padlock, body centered at (0, 0). `open` lifts and swings the shackle. */
export function Padlock({ open, color, label }: { open: number; color: string; label: string }) {
  const lift = 12 * clamp(open);
  return (
    <g strokeLinecap="round" strokeLinejoin="round">
      <g transform={`translate(0 ${-lift}) rotate(${(-25 * clamp(open * 1.4 - 0.4)).toFixed(1)} 20 -24)`}>
        <path d="M-20 -24V-40A20 20 0 0 1 20 -40V-24" fill="none" stroke={color} strokeWidth={8} />
      </g>
      <rect x={-34} y={-26} width={68} height={56} rx={10} fill={C.ink800} stroke={color} strokeWidth={3} />
      {/* An elliptic curve on the lock's face. */}
      <path d="M-18 -4Q-6 -18 0 -6T18 4M-18 4Q-6 18 0 6T18 -4" stroke={color} strokeWidth={1.8} fill="none" opacity={0.75} />
      <text y={22} fontSize={12} fontWeight={700} fill={color} textAnchor="middle" letterSpacing={0.5}>
        {label}
      </text>
    </g>
  );
}

/** A green-free check in a cyan disc. */
export function Check({ r = 10 }: { r?: number }) {
  const k = r / 10;
  return (
    <g>
      <circle r={r} fill={C.cyan} />
      <path d={`M${-4.5 * k} ${0.5 * k}l${3 * k} ${3 * k} ${6 * k} ${-6.5 * k}`} stroke={C.ink950} strokeWidth={2.2 * k} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </g>
  );
}

/** A red cross in a ring. */
export function Cross({ r = 11 }: { r?: number }) {
  const k = r / 11;
  return (
    <g>
      <circle r={r} fill={C.ink900} stroke={C.bad} strokeWidth={2} />
      <path d={`M${-4.5 * k} ${-4.5 * k}l${9 * k} ${9 * k}M${4.5 * k} ${-4.5 * k}l${-9 * k} ${9 * k}`} stroke={C.bad} strokeWidth={2.4} strokeLinecap="round" />
    </g>
  );
}

/** An envelope centered at (0, 0), 30 by 20. */
export function Envelope({ color = PAPER }: { color?: string }) {
  return (
    <g strokeLinejoin="round">
      <rect x={-15} y={-10} width={30} height={20} rx={2.5} fill={color} stroke={C.accent} strokeWidth={1.2} />
      <path d="M-14 -9 0 2 14 -9" fill="none" stroke={C.accent} strokeWidth={1.4} />
    </g>
  );
}

/**
 * The quantum computer as the gold-and-blue chandelier real ones look like, hanging from (0, 0).
 * `glow` 0..1 brightens the qubits.
 */
export function QuantumChandelier({ glow, t }: { glow: number; t: number }) {
  const tiers = [
    { y: 18, w: 64 },
    { y: 46, w: 52 },
    { y: 72, w: 40 },
  ];
  return (
    <g strokeLinecap="round">
      <path d="M0 -40V18" stroke={C.ink500} strokeWidth={2} />
      {tiers.map((tier, i) => (
        <g key={i}>
          <rect x={-tier.w / 2} y={tier.y - 4} width={tier.w} height={8} rx={4} fill="#c9a24a" stroke="#f3d27a" strokeWidth={1.2} />
          {i < tiers.length - 1 &&
            [-0.3, 0, 0.3].map((f) => <path key={f} d={`M${f * tier.w} ${tier.y + 4}V${tiers[i + 1].y - 4}`} stroke="#f3d27a" strokeWidth={1.6} />)}
        </g>
      ))}
      <path d="M-10 76 0 96 10 76" fill="#c9a24a" stroke="#f3d27a" strokeWidth={1.2} />
      {/* Qubits orbiting the middle tier. */}
      {[0, 1, 2, 3, 4].map((k) => {
        const a = t * 2.2 + (k * Math.PI * 2) / 5;
        return <circle key={k} cx={Math.cos(a) * 40} cy={46 + Math.sin(a) * 10} r={3.2} fill={C.cyan} opacity={0.35 + 0.65 * glow} />;
      })}
    </g>
  );
}
