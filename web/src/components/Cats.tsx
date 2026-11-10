// The cats. Decorative art is aria-hidden; the one state that means something (the box opening
// or staying shut) is announced in words by CatStage. Motion lives in style.css under the cat-*
// classes, and each base style is the final pose, so prefers-reduced-motion shows static poses.

import { useId, type CSSProperties } from "react";
import type { Who } from "../key";
import type { Run } from "../store";
import { headInner, markInner } from "./catArt";
import { cx } from "./ui";

const FUR = "#c9d6ff";
const CYAN = "var(--color-cyan)";
const BLUE = "var(--color-accent)";

/** The skinnyCAT mark, the cat slipping out of its box with the lit tail path. */
export function LogoMark({ className }: { className?: string }) {
  return <svg viewBox="0 0 64 64" className={className} aria-hidden="true" focusable="false" dangerouslySetInnerHTML={{ __html: markInner() }} />;
}

/** The favicon head. */
export function CatHead({ className }: { className?: string }) {
  return <svg viewBox="0 0 32 32" className={className} aria-hidden="true" focusable="false" dangerouslySetInnerHTML={{ __html: headInner() }} />;
}

function Eyes({ awake, l, r, y, rx = 1.8, ry = 2.4 }: { awake: boolean; l: number; r: number; y: number; rx?: number; ry?: number }) {
  if (awake)
    return (
      <g fill={CYAN}>
        <ellipse cx={l} cy={y} rx={rx} ry={ry} />
        <ellipse cx={r} cy={y} rx={rx} ry={ry} />
      </g>
    );
  // Asleep, eyes shut. Nobody has made them a key yet.
  return (
    <path
      d={`M${l - 2} ${y} q2 1.6 4 0 M${r - 2} ${y} q2 1.6 4 0`}
      stroke="currentColor"
      strokeOpacity="0.8"
      strokeWidth="1.5"
      strokeLinecap="round"
      fill="none"
    />
  );
}

/**
 * Alice is a well-fed cat with a collar and a cyan tag. Bob is the skinny stray, narrow face and
 * a nicked ear. Eyes stay shut until the cat has a key.
 */
export function CatAvatar({ who, awake, className }: { who: Who; awake: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true" focusable="false" fill="none" strokeLinecap="round" strokeLinejoin="round">
      {who === "alice" ? (
        <>
          <path d="M6.5 16.5 6 4.5 12.2 9.6H19.8L26 4.5 25.5 16.5Q25.5 25.6 16 25.6T6.5 16.5Z" stroke="currentColor" strokeWidth="2" fill="var(--color-ink-800)" />
          <Eyes awake={awake} l={12.2} r={19.8} y={16.4} />
          <path d="M15 20.6h2l-1 1.1z" fill="currentColor" stroke="currentColor" strokeWidth="0.8" />
          <path d="M10 25.2Q16 28.4 22 25.2" stroke={CYAN} strokeWidth="1.6" />
          <circle cx="16" cy="28.4" r="1.7" fill={CYAN} />
        </>
      ) : (
        <>
          <path
            d="M9.5 17 9 9.6 10.7 8.7 8.8 3.4 13.6 9H18.4L23.4 3 22.5 17Q22.5 27.6 16 27.6T9.5 17Z"
            stroke="currentColor"
            strokeWidth="2"
            fill="var(--color-ink-800)"
          />
          <Eyes awake={awake} l={13.2} r={18.8} y={17} rx={1.5} ry={2.2} />
          <path d="M15.1 21.4h1.8l-.9 1z" fill="currentColor" stroke="currentColor" strokeWidth="0.8" />
          <path d="M9.4 20.5 6.5 21.6M22.6 20.5 25.5 21.6" stroke="currentColor" strokeOpacity="0.6" strokeWidth="1.2" />
        </>
      )}
    </svg>
  );
}

/** The cat courier, carrying Bob's signed note in its mouth. */
export function CourierCat({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 32" className={className} aria-hidden="true" focusable="false" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6.5 15.5 6 3.5 12.2 8.6H19.8L26 3.5 25.5 15.5Q25.5 24.6 16 24.6T6.5 15.5Z" stroke={FUR} strokeOpacity="0.85" strokeWidth="2" fill="var(--color-ink-800)" />
      <g fill={CYAN}>
        <ellipse cx="12.2" cy="15" rx="1.7" ry="2.3" />
        <ellipse cx="19.8" cy="15" rx="1.7" ry="2.3" />
      </g>
      <g transform="rotate(-8 27 24)">
        <rect x="18.5" y="19" width="17" height="11" rx="1.6" fill="var(--color-ink-900)" stroke={CYAN} strokeWidth="1.6" />
        <path d="M18.8 19.6 27 25.6 35.2 19.6" stroke={CYAN} strokeWidth="1.4" />
      </g>
    </svg>
  );
}

/** An empty, open box. For when nothing is there. */
export function EmptyBox({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 32" className={className} aria-hidden="true" focusable="false" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 13H31V29H9Z" fill="var(--color-ink-900)" stroke={BLUE} strokeWidth="1.8" />
      <path d="M9 13 4 8M31 13 36 8.5" stroke={BLUE} strokeWidth="1.8" />
      <path d="M17 21h6" stroke={BLUE} strokeOpacity="0.5" strokeWidth="1.4" />
    </svg>
  );
}

/** A startled cat for errors. Ears back, eyes wide, perfectly fine. */
export function OopsCat({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" focusable="false" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4.5 13 2.5 5.5 8.5 8H15.5L21.5 5.5 19.5 13Q19.5 20.5 12 20.5T4.5 13Z" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="9.2" cy="13" r="1.7" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="14.8" cy="13" r="1.7" stroke="currentColor" strokeWidth="1.3" />
      <path d="M11 17.3h2" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

/** A small sitting cat, drawn with its feet at (0, 0), about 22 units tall. */
export function SitCat({ awake = true }: { awake?: boolean }) {
  return (
    <g fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d="M-3.4 -8.4Q-5.2 -4 -4.6 0H4.6Q5.2 -4 3.4 -8.4" stroke={FUR} strokeWidth="1.7" fill="var(--color-ink-900)" />
      <path d="M-6.4 -13.6 -6.8 -22.4 -2.6 -18.6H2.6L6.8 -22.4 6.4 -13.6Q6.4 -8.2 0 -8.2T-6.4 -13.6Z" stroke={FUR} strokeWidth="1.7" fill="var(--color-ink-900)" />
      {awake ? (
        <g fill={CYAN}>
          <ellipse cx="-2.5" cy="-13.4" rx="1.1" ry="1.5" />
          <ellipse cx="2.5" cy="-13.4" rx="1.1" ry="1.5" />
        </g>
      ) : (
        <path d="M-3.8 -13.2q1.3 1 2.6 0M1.2 -13.2q1.3 1 2.6 0" stroke={FUR} strokeWidth="1.1" />
      )}
    </g>
  );
}

// ---------------------------------------------------------------------------
// A climb along a stepped path, shared by the hero tree and the run stage.
// ---------------------------------------------------------------------------

type Pt = [number, number];

/** Where a point at fraction t of the polyline's length sits, and the total length. */
export function along(pts: Pt[], t: number): { at: Pt; length: number } {
  const segs = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]));
  const length = segs.reduce((a, b) => a + b, 0);
  let d = Math.max(0, Math.min(1, t)) * length;
  for (let i = 0; i < segs.length; i++) {
    if (d <= segs[i] || i === segs.length - 1) {
      const f = segs[i] ? Math.min(1, d / segs[i]) : 0;
      return { at: [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f], length };
    }
    d -= segs[i];
  }
  return { at: pts[pts.length - 1], length };
}

export const polyline = (pts: Pt[]) => pts.map(([x, y], i) => `${i ? "L" : "M"}${x} ${y}`).join("");

/** The cat, placed on a path at fraction t, climbing when moving is true. */
export function Climber({ pts, t, moving, scale = 1 }: { pts: Pt[]; t: number; moving: boolean; scale?: number }) {
  const { at } = along(pts, t);
  const style: CSSProperties = { transform: `translate(${at[0]}px, ${at[1]}px) scale(${scale})` };
  return (
    <g className="cat-glide" style={style} data-testid="climber">
      <g className={cx("cat-anim", moving ? "cat-climb" : "cat-bob")}>
        <SitCat />
      </g>
    </g>
  );
}

// ---------------------------------------------------------------------------
// The stage under each run: the climb while signing, then the box moment.
// ---------------------------------------------------------------------------

export type Scene = "climb" | "verify" | "open" | "shut";

/** Which scene a run is in, or null before signing starts and after a refusal that signed nothing. */
export function sceneOf(run: Run): Scene | null {
  const st = (id: string) => run.steps.find((x) => x.id === id);
  const failed = (id: string) => st(id)?.state === "fail";
  // A signature the verifier turned down, either checked directly or as the revert of a send.
  const rejected =
    failed("local") ||
    failed("onchain") ||
    ["simulate", "sent", "confirmed"].some((id) => failed(id) && /BadSignature/.test(st(id)?.text ?? ""));
  if (rejected) return "shut";
  if (st("onchain")?.state === "ok") return "open";
  if (st("local")?.state === "run" || st("local")?.state === "ok" || st("onchain")?.state === "run") return "verify";
  if (st("signature")?.state === "run") return "climb";
  return null;
}

const CAPTION: Record<Scene, string> = {
  climb: "Signing walks from a leaf up to the public root, and the cat climbs along.",
  verify: "In goes the signature. The verifier is checking.",
  open: "Valid. The box opens and the cat jumps out.",
  shut: "Not valid, so the box stays shut.",
};
const CHANGED = "The signed note was changed on the way, so the signature no longer matches and the box stays shut.";

/** A signature that checked out, then failed on chain because someone changed what it covers. */
const changedOnTheWay = (run: Run) => run.steps.find((x) => x.id === "onchain")?.state === "ok";

// The climb in the stage: a leaf at the bottom left, its path up to the root at the top right, and
// one sibling per level, the nodes a signature carries.
const CLIMB: Pt[] = [
  [22, 66],
  [22, 58],
  [30, 58],
  [30, 50],
  [30, 41],
  [44, 41],
  [44, 32],
  [44, 22],
  [70, 22],
  [70, 15],
];
/** Indices into CLIMB of the nodes on the path below the root, leaf first. */
const NODES = [0, 3, 6];
const SIBLINGS: { at: Pt; stub: string }[] = [
  { at: [38, 66], stub: "M38 66V58H30" },
  { at: [58, 50], stub: "M58 50V41H44" },
  { at: [96, 32], stub: "M96 32V22H70" },
];

export function CatStage({ run, testId }: { run: Run; testId: string }) {
  const scene = sceneOf(run);
  if (!scene) return null;
  const sig = run.steps.find((x) => x.id === "signature");
  const t = scene === "climb" ? (sig?.progress ?? 0) : 1;
  return (
    <div
      data-testid={testId}
      data-scene={scene}
      className={cx(
        "flex items-center gap-3 rounded-xl px-3 py-2 ring-1 ring-inset sm:gap-4",
        scene === "shut" ? "bg-bad/[0.05] ring-bad/25" : scene === "open" ? "bg-cyan/[0.05] ring-cyan/20" : "bg-ink-950/50 ring-ink-700",
      )}
    >
      <svg viewBox={`${scene === "climb" ? 4 : 12} 0 100 72`} className="h-[76px] w-[106px] shrink-0 overflow-visible" aria-hidden="true" focusable="false" fill="none">
        {scene === "climb" ? <ClimbScene t={t} /> : <BoxScene scene={scene} key={scene} />}
      </svg>
      <p role="status" className={cx("text-[13px] leading-snug", scene === "shut" ? "text-bad" : scene === "open" ? "text-fg" : "text-muted")}>
        {scene === "shut" && changedOnTheWay(run) ? CHANGED : CAPTION[scene]}
      </p>
    </div>
  );
}

function ClimbScene({ t }: { t: number }) {
  const { length } = along(CLIMB, 1);
  const reached = (i: number) => t * length + 0.01 >= along(CLIMB.slice(0, i + 1), 1).length;
  return (
    <g strokeLinecap="round" strokeLinejoin="round">
      {SIBLINGS.map((s) => (
        <g key={s.stub}>
          <path d={s.stub} stroke="var(--color-ink-500)" strokeWidth="1.4" />
          <rect x={s.at[0] - 3.5} y={s.at[1] - 3.5} width="7" height="7" rx="1.8" stroke={BLUE} strokeWidth="1.3" fill="var(--color-ink-850)" />
        </g>
      ))}
      <path d={polyline(CLIMB)} stroke="var(--color-ink-500)" strokeWidth="2" />
      <path d={polyline(CLIMB)} stroke={CYAN} strokeWidth="2.6" strokeDasharray={`${t * length} ${length}`} className="cat-glide-dash" />
      {NODES.map((i) => (
        <circle key={i} cx={CLIMB[i][0]} cy={CLIMB[i][1]} r="3.2" fill={reached(i) ? CYAN : "var(--color-ink-600)"} />
      ))}
      <rect x="65.5" y="6.5" width="9" height="9" rx="2.4" fill={t >= 0.999 ? CYAN : "var(--color-ink-600)"} />
      <Climber pts={CLIMB} t={t} moving={t < 1} scale={1.1} />
    </g>
  );
}

function BoxScene({ scene }: { scene: "verify" | "open" | "shut" }) {
  const open = scene === "open";
  const clip = `cat-clip-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <g strokeLinecap="round" strokeLinejoin="round">
      <defs>
        <clipPath id={clip}>
          <rect x="0" y="-20" width="120" height="88" />
        </clipPath>
      </defs>
      {open && (
        <>
          <path d="M80 58H90V46H98V24" stroke={CYAN} strokeWidth="2.4" pathLength={1} className="cat-anim cat-tail" />
          <g fill={CYAN} className="cat-anim cat-tail-dots">
            <circle cx="90" cy="58" r="2.4" />
            <circle cx="90" cy="46" r="2.4" />
            <circle cx="98" cy="46" r="2.4" />
            <rect x="94.4" y="15.4" width="7.2" height="7.2" rx="1.9" />
          </g>
          <g clipPath={`url(#${clip})`}>
            <g className="cat-anim cat-jump" data-testid="box-cat">
              <path d="M50.5 22 50 8.5 56.8 14.3H63.2L70 8.5 69.5 22Q69.5 30.5 60 30.5T50.5 22Z" stroke={FUR} strokeWidth="2.4" fill="var(--color-ink-900)" />
              <path d="M55.5 30Q54.6 36 55 46M64.5 30Q65.4 36 65 46" stroke={FUR} strokeWidth="2.4" />
              <g fill={CYAN}>
                <ellipse cx="56.3" cy="22.4" rx="1.7" ry="2.2" />
                <ellipse cx="63.7" cy="22.4" rx="1.7" ry="2.2" />
              </g>
              <path d="M50 25.2 44.5 24.3M50 27.4 45 28.6M70 25.2 75.5 24.3M70 27.4 75 28.6" stroke={BLUE} strokeWidth="1.3" />
            </g>
          </g>
        </>
      )}
      {scene === "verify" && (
        <g className="cat-anim cat-drop">
          <rect x="52" y="6" width="16" height="11" rx="2" fill="var(--color-ink-900)" stroke={CYAN} strokeWidth="1.6" />
          <path d="M55.5 10h9M55.5 13.2h6" stroke={CYAN} strokeWidth="1.2" />
        </g>
      )}
      {scene === "shut" && (
        <g className="cat-anim cat-bounce">
          <g transform="rotate(-18 24 22)">
            <rect x="16" y="14" width="16" height="11" rx="2" fill="var(--color-ink-900)" stroke="var(--color-bad)" strokeWidth="1.6" />
            <path d="M19.5 18h9M19.5 21.2h6" stroke="var(--color-bad)" strokeWidth="1.2" />
          </g>
        </g>
      )}
      <g className={cx(scene !== "open" && "cat-anim cat-wobble")}>
        <path d="M40 40H80V68H40Z" fill="var(--color-ink-850)" stroke={BLUE} strokeWidth="2.4" />
        <path d="M40 40H60" stroke={BLUE} strokeWidth="2.4" className={cx("cat-flap-l", open && "is-open cat-anim")} />
        <path d="M80 40H60" stroke={BLUE} strokeWidth="2.4" className={cx("cat-flap-r", open && "is-open cat-anim")} />
        {scene === "shut" && <rect x="55.5" y="36.5" width="9" height="13" rx="1" fill="var(--color-warn)" fillOpacity="0.6" />}
      </g>
      {open && (
        <g fill={FUR} className="cat-anim cat-paws">
          <ellipse cx="55" cy="40.6" rx="3" ry="2.1" />
          <ellipse cx="65" cy="40.6" rx="3" ry="2.1" />
        </g>
      )}
    </g>
  );
}
