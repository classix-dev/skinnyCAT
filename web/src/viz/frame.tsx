// The card every scene sits in: the picture, the caption of the current step, and the controls.
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw } from "lucide-react";
import { useId, useRef, type ReactNode, type RefObject } from "react";
import { SCENES, type SceneCopy, type SceneId } from "./copy";
import { useInView, useReducedMotion } from "./hooks";
import { rich } from "./rich";
import { span, useTimeline, type Timeline } from "./timeline";

export function useScene(id: SceneId, beats: readonly number[], duration: number) {
  const ref = useRef<HTMLElement>(null);
  const visible = useInView(ref, "0px", 0.3);
  const reduced = useReducedMotion();
  const tl = useTimeline(duration, beats, visible, reduced);
  const copy = SCENES.find((s) => s.id === id)!;
  return { ref, tl, copy };
}

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

function IconButton({ label, onClick, children }: { label: string; onClick(): void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-md text-muted transition-colors hover:bg-white/5 hover:text-fg"
    >
      {children}
    </button>
  );
}

export function SceneFrame({
  sceneRef,
  tl,
  copy,
  steps,
  children,
  below,
}: {
  sceneRef: RefObject<HTMLElement | null>;
  tl: Timeline;
  copy: SceneCopy;
  /** Captions with real numbers filled in, defaults to the copy's. */
  steps?: string[];
  children: ReactNode;
  /** Interactive controls under the caption. */
  below?: ReactNode;
}) {
  const id = useId();
  const captions = steps ?? copy.steps;
  const n = captions.length;
  const b = tl.beat;
  const done = tl.t >= tl.duration - 1e-3;
  return (
    <figure
      ref={sceneRef}
      aria-labelledby={`${id}-cap`}
      aria-describedby={`${id}-desc`}
      className="overflow-hidden rounded-2xl bg-ink-900/70 ring-1 ring-white/[0.07] ring-inset"
      onKeyDown={(e) => {
        if (e.target instanceof HTMLInputElement) return;
        if (e.key === "ArrowRight") tl.goBeat(b + 1);
        else if (e.key === "ArrowLeft") tl.goBeat(b - 1);
        else return;
        e.preventDefault();
      }}
    >
      <p id={`${id}-desc`} className="sr-only">
        {copy.figure}
      </p>
      <div className="relative">{children}</div>
      <figcaption className="border-t border-white/[0.06] px-4 pt-3.5 pb-3 sm:px-5">
        <div className="flex items-start gap-3">
          <span className="mono mt-[3px] shrink-0 text-[11px] text-accent-hi tabular-nums" aria-hidden>
            {String(b + 1).padStart(2, "0")}/{String(n).padStart(2, "0")}
          </span>
          <p
            id={`${id}-cap`}
            className="min-h-[2.75rem] text-[14px] leading-snug text-fg sm:min-h-[2.5rem] sm:text-[15px]"
            aria-live={tl.interacted && !tl.playing ? "polite" : "off"}
          >
            {rich(captions[b])}
          </p>
        </div>
        {below}
        <div className="mt-2 flex items-center gap-1" role="group" aria-label="Animation controls">
          <IconButton label="Previous step" onClick={() => tl.goBeat(b - 1)}>
            <ChevronLeft className="size-4" aria-hidden />
          </IconButton>
          {!tl.reduced && (
            <IconButton label={tl.playing ? "Pause" : done ? "Play again" : "Play"} onClick={tl.toggle}>
              {tl.playing ? <Pause className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />}
            </IconButton>
          )}
          <IconButton label="Next step" onClick={() => tl.goBeat(b + 1)}>
            <ChevronRight className="size-4" aria-hidden />
          </IconButton>
          <ol className="mx-2 flex h-8 min-w-0 flex-1 items-center gap-1" aria-label="Steps">
            {captions.map((c, i) => {
              const a = tl.beats[i];
              const z = i + 1 < n ? tl.beats[i + 1] : tl.duration;
              const fill = tl.reduced ? (i <= b ? 1 : 0) : span(tl.t, a, z);
              return (
                <li key={i} className="flex h-full min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => tl.goBeat(i)}
                    aria-label={`Step ${i + 1} of ${n}: ${c}`}
                    aria-current={i === b ? "step" : undefined}
                    className="group flex h-full w-full cursor-pointer items-center"
                  >
                    <span className="relative h-1 w-full overflow-hidden rounded-full bg-ink-600 transition-[height] group-hover:h-1.5">
                      <span
                        className={cx("absolute inset-y-0 left-0 rounded-full", i === b ? "bg-cyan" : "bg-accent")}
                        style={{ width: `${fill * 100}%` }}
                      />
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
          <IconButton label="Replay from the start" onClick={tl.replay}>
            <RotateCcw className="size-4" aria-hidden />
          </IconButton>
        </div>
      </figcaption>
    </figure>
  );
}

/** A box that keeps an SVG's aspect ratio and lets it fill the card. */
export function Stage({ w, h, label, children, className }: { w: number; h: number; label: string; children: ReactNode; className?: string }) {
  return (
    <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label} className={cx("block h-auto w-full select-none", className)}>
      {children}
    </svg>
  );
}
