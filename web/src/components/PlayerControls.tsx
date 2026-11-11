// The player buttons under a diagram, shared by How It Works and Aggregation. Previous, play or
// pause, next, replay and double speed. Reduced motion keeps previous, next and back to step 1.

import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw } from "lucide-react";
import type { ReactNode } from "react";
import { endedAt, type Action, type Player } from "./howPlayer";
import { Button, cx } from "./ui";

function Ctl({ label, onClick, off, pressed, children, testId }: { label: string; onClick: () => void; off?: boolean; pressed?: boolean; children: ReactNode; testId: string }) {
  return (
    <Button
      size="icon"
      variant="secondary"
      aria-label={label}
      title={label}
      aria-disabled={off || undefined}
      aria-pressed={pressed}
      data-testid={testId}
      onClick={() => !off && onClick()}
      className={cx("aria-disabled:cursor-not-allowed aria-disabled:opacity-40", pressed && "bg-cyan/15 text-cyan ring-cyan/50 hover:bg-cyan/20")}
    >
      {children}
    </Button>
  );
}

export function PlayerControls({ s, dispatch, last, prefix }: { s: Player; dispatch: (a: Action) => void; last: number; prefix: string }) {
  const go = (type: Action["type"]) => () => dispatch({ type } as Action);
  const atEnd = endedAt(s, last);
  return (
    <div role="group" aria-label="Diagram player" className="flex shrink-0 items-center gap-1.5">
      <Ctl label="Previous step" onClick={go("prev")} off={s.step <= 1} testId={`${prefix}-prev`}>
        <ChevronLeft className="size-4" aria-hidden />
      </Ctl>
      {!s.reduced &&
        (s.playing ? (
          <Ctl label="Pause" onClick={go("pause")} testId={`${prefix}-play`}>
            <Pause className="size-4" aria-hidden />
          </Ctl>
        ) : (
          <Ctl label={atEnd ? "Play again from step 1" : "Play"} onClick={go("play")} testId={`${prefix}-play`}>
            <Play className="size-4" aria-hidden />
          </Ctl>
        ))}
      <Ctl label="Next step" onClick={go("next")} off={s.step >= last} testId={`${prefix}-next`}>
        <ChevronRight className="size-4" aria-hidden />
      </Ctl>
      <Ctl label={s.reduced ? "Back to step 1" : "Replay from step 1"} onClick={go("replay")} testId={`${prefix}-replay`}>
        <RotateCcw className="size-4" aria-hidden />
      </Ctl>
      {!s.reduced && (
        <Button
          size="sm"
          variant="secondary"
          aria-pressed={s.fast}
          aria-label="2× speed"
          title="Double speed"
          data-testid={`${prefix}-speed`}
          onClick={go("speed")}
          className={cx("mono w-11 px-0", s.fast && "bg-cyan/15 text-cyan ring-cyan/50 hover:bg-cyan/20")}
        >
          2×
        </Button>
      )}
    </div>
  );
}
