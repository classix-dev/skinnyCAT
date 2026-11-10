import { LEDGER_SYMBOL } from "../generated/contracts";
import { ChevronLeft, ChevronRight, CornerDownRight, Pause, Play, RotateCcw } from "lucide-react";
import { useRef, type CSSProperties, type ReactNode } from "react";
import { CAT_H, CAT_W, CourierRunner, ItemIcon } from "./HowCat";
import { balancesAfter, COLS, fmt, PARTIES, PHASES, runMs, sentence, STEPS, type Balances, type Msg, type Step, type Style } from "./howData";
import { done, ended, LAST, speedOf, useHowPlayer, type Action, type Player } from "./howPlayer";
import { Button, cx } from "./ui";

// The sequence diagram from README.md, as HTML. Each message is a list item with a plain sentence for
// screen readers. Wide screens draw lifelines and arrows, narrow ones a numbered list with a small
// lane view in the bar underneath. A courier cat plays the messages in order once the diagram
// scrolls into view. The pre-rendered page shows the whole diagram at rest, and the cat only
// appears after hydration.

const grid: CSSProperties = { gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))` };

const lineClass: Record<Style, string> = {
  call: "border-accent-hi border-solid",
  reply: "border-subtle border-dashed",
  pay: "border-cyan border-solid",
  offchain: "border-muted border-dotted",
};
const headClass: Record<Style, string> = {
  call: "text-accent-hi",
  reply: "text-subtle",
  pay: "text-cyan",
  offchain: "text-muted",
};

type Status = "active" | "past" | "future";
/** What a row needs to draw the cat: the run's duration, whether it's still going, and a key. */
type CatPlay = { ms: number; moving: boolean; reduced: boolean; run: number };

/** The cat's width on wide screens. */
const DESK_W = 58;

const dur = (ms: number) => ({ "--how-d": `${Math.round(ms)}ms` }) as CSSProperties;

/**
 * The cat on a track from one lifeline to another, both given as offsets from the row's left edge.
 * It sets off centred on the sender's lifeline and stops with its nose at the arrowhead. `drop`
 * lowers it by that many px, and in the diagram the labels sit above it, so the rows stay tight.
 */
function Track({ m, from, to, play, w = DESK_W, drop = 0 }: { m: Msg; from: string; to: string; play: CatPlay; w?: number; drop?: number }) {
  const right = m.to > m.from;
  const pose = play.reduced || !play.moving ? (right ? "how-at-r" : "how-at-l") : right ? "how-run-r" : "how-run-l";
  return (
    <div
      className="pointer-events-none absolute z-20"
      style={{
        bottom: -drop,
        left: right ? `calc(${from} - ${w / 2}px)` : to,
        width: right ? `calc(${to} - ${from} - ${w / 2}px)` : `calc(${from} - ${to} - ${w / 2}px)`,
        height: (w * (CAT_H + 8)) / CAT_W,
      }}
    >
      {/* Started at the far end, the run plays to the near one, so the base pose is where it arrives. */}
      <div key={play.run} className={cx("h-full w-full", pose)} style={dur(play.ms)}>
        <CourierRunner carry={m.carry} left={!right} mode={play.moving && !play.reduced ? "run" : "stand"} width={w} />
      </div>
    </div>
  );
}

function Arrow({ m, n, status, play }: { m: Msg; n: number; status: Status; play: CatPlay | null }) {
  const style = m.style ?? "call";
  const active = status === "active";
  if (m.from === m.to) {
    // A note starting at the lifeline, up to three columns wide.
    const span = Math.min(3, COLS - m.from);
    const inset = `calc(100% / ${2 * span})`;
    return (
      <div className="py-2" style={{ gridColumn: `${m.from + 1} / span ${span}` }}>
        <div
          className={cx(
            "relative z-10 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs leading-tight text-fg ring-1 transition-colors duration-300",
            active ? "bg-cyan/10 ring-cyan/60" : "bg-ink-850 ring-ink-600",
          )}
          style={{ marginLeft: `calc(${inset} - 10px)`, maxWidth: `calc(100% - ${inset} + 10px)` }}
        >
          <Num n={n} status={status} />
          <CornerDownRight className={cx("size-3 shrink-0", active ? "text-cyan" : "text-subtle")} aria-hidden />
          <span>{m.text}</span>
          {/* The cat works beside the note, facing it, without taking any room. */}
          {play && (
            <div className="pointer-events-none absolute top-1/2 left-full z-20 ml-1 -translate-y-[58%]">
              <div key={play.run} className="how-appear" style={dur(play.ms)}>
                <CourierRunner carry={m.carry} left mode={play.moving && !play.reduced ? "act" : "stand"} width={DESK_W} />
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }
  const lo = Math.min(m.from, m.to);
  const span = Math.abs(m.to - m.from) + 1;
  const inset = `calc(100% / ${2 * span})`;
  const right = m.to > m.from;
  return (
    <div className="pt-2.5 pb-0.5" style={{ gridColumn: `${lo + 1} / span ${span}` }}>
      {/* The label may use the full width of the spanned columns, the arrow runs lifeline to lifeline. */}
      <div className="flex items-end justify-center gap-1.5 px-1 text-center text-xs leading-tight text-fg">
        <Num n={n} status={status} />
        <span
          className={cx(
            "relative z-[25] rounded px-1 ring-1 transition-colors duration-300",
            active ? "bg-cyan/10 ring-cyan/50" : "bg-ink-900/80 ring-transparent",
            style === "reply" && !active && "text-muted",
          )}
        >
          {m.text}
        </span>
      </div>
      <div className="relative h-5">
        <div className={cx("absolute bottom-1.5 border-t-[1.5px]", lineClass[style])} style={{ left: inset, right: inset }} />
        {active && (
          <div
            key={play?.run}
            className={cx("absolute bottom-[5px] h-[3px] rounded-full bg-cyan shadow-[0_0_10px_var(--color-cyan)]", play && !play.reduced && "how-lit")}
            style={{ left: inset, right: inset, transformOrigin: right ? "left" : "right", ...dur(play?.ms ?? 0) }}
          />
        )}
        <svg
          viewBox="0 0 8 8"
          className={cx("absolute bottom-1.5 size-2 translate-y-[calc(50%-0.75px)]", active ? "text-cyan" : headClass[style], right ? "-translate-x-full" : "translate-x-0")}
          style={right ? { left: `calc(100% - ${inset})` } : { left: inset }}
          aria-hidden
        >
          <path d={right ? "M0 0 8 4 0 8z" : "M8 0 0 4 8 8z"} fill="currentColor" />
        </svg>
        {play && !play.moving && !play.reduced && (
          <span
            key={`ping-${play.run}`}
            className="how-ping pointer-events-none absolute bottom-1.5 size-4 translate-y-1/2 rounded-full ring-2 ring-cyan"
            style={{ left: `calc(${right ? `100% - ${inset}` : inset} - 8px)` }}
            aria-hidden
          />
        )}
        {play && <Track m={m} from={right ? inset : `calc(100% - ${inset})`} to={right ? `calc(100% - ${inset})` : inset} play={play} drop={3} />}
      </div>
    </div>
  );
}

function Num({ n, status = "future" }: { n: number; status?: Status }) {
  return (
    <span
      className={cx(
        "mono inline-flex size-4 shrink-0 items-center justify-center rounded-full text-[9px] transition-colors duration-300",
        status === "active" ? "bg-cyan font-semibold text-ink-950" : status === "past" ? "bg-ink-600 text-fg" : "bg-ink-700 text-muted",
      )}
    >
      {n}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Balances.
// ---------------------------------------------------------------------------

type ChipDef = { key: keyof Balances; party: number; unit: "sc" | "eth"; label: (v: string) => string };
const CHIPS: ChipDef[] = [
  { key: "alice", party: 0, unit: "sc", label: (v) => `${v} ${LEDGER_SYMBOL}` },
  { key: "bob", party: 4, unit: "sc", label: (v) => `${v} ${LEDGER_SYMBOL}` },
  { key: "relayer", party: 5, unit: "eth", label: (v) => `${v} ETC in fees` },
  { key: "fresh", party: 6, unit: "eth", label: (v) => `${v} ETC` },
];

function Chip({ c, bal, compact = false }: { c: ChipDef; bal: Balances; compact?: boolean }) {
  const v = bal[c.key];
  return (
    <span
      key={v}
      data-testid={`how-bal-${c.key}`}
      data-value={fmt(v)}
      className={cx(
        "mono inline-flex items-center gap-1 rounded-full bg-ink-800 leading-none whitespace-nowrap text-fg ring-1 ring-ink-600",
        compact ? "px-1.5 py-[3px] text-[10px]" : "px-2 py-1 text-[11px]",
        v !== 0 && "how-pop",
      )}
    >
      <span className={cx("size-1.5 shrink-0 rounded-full", c.unit === "sc" ? "bg-cyan" : "bg-warn")} />
      {compact ? fmt(v) : c.label(fmt(v))}
    </span>
  );
}

/** The narrow-screen view of the cat: seven stations in a row, the cat running between them. */
function Lane({ step, play, bal }: { step: Step | null; play: CatPlay | null; bal: Balances }) {
  const x = (i: number) => `${((i + 0.5) / COLS) * 100}%`;
  const w = 46;
  return (
    <div className="relative h-[90px] md:hidden" aria-hidden data-testid="how-lane">
      <div className="absolute top-[36px] h-px bg-ink-600" style={{ left: x(0), right: `${(0.5 / COLS) * 100}%` }} />
      {step && step.from !== step.to && (
        <div
          key={play?.run}
          className={cx("absolute top-[35px] h-[3px] rounded-full bg-cyan shadow-[0_0_8px_var(--color-cyan)]", play && !play.reduced && "how-lit")}
          style={{
            left: x(Math.min(step.from, step.to)),
            width: `${(Math.abs(step.to - step.from) / COLS) * 100}%`,
            transformOrigin: step.to > step.from ? "left" : "right",
            ...dur(play?.ms ?? 0),
          }}
        />
      )}
      {PARTIES.map((p, i) => {
        const lit = step && (step.from === i || step.to === i);
        const chip = CHIPS.find((c) => c.party === i);
        return (
          <div key={p.name} className="absolute top-[32px] flex -translate-x-1/2 flex-col items-center" style={{ left: x(i) }}>
            <span className={cx("size-2 rounded-full ring-2 ring-ink-900 transition-colors", lit ? "bg-cyan" : "bg-ink-500")} />
            <span className={cx("mt-1 text-[10px] leading-none whitespace-nowrap", lit ? "text-fg" : "text-subtle")}>{p.short}</span>
            {chip && (
              <span className="mt-1">
                <Chip c={chip} bal={bal} compact />
              </span>
            )}
          </div>
        );
      })}
      {step && play && (
        <div className="absolute top-0 h-[38px] w-full">
          {step.from === step.to ? (
            <div className="absolute bottom-[-2px]" style={{ left: `calc(${x(step.from)} - ${w * 0.7}px)` }}>
              <div key={play.run} className="how-appear" style={dur(play.ms)}>
                <CourierRunner carry={step.carry} mode={play.moving && !play.reduced ? "act" : "stand"} width={w} />
              </div>
            </div>
          ) : (
            <Track m={step} from={x(step.from)} to={x(step.to)} play={play} w={w} />
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The controls and the caption.
// ---------------------------------------------------------------------------

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

function Controls({ s, dispatch }: { s: Player; dispatch: (a: Action) => void }) {
  const go = (type: Action["type"]) => () => dispatch({ type } as Action);
  const atEnd = ended(s);
  return (
    <div role="group" aria-label="Diagram player" className="flex shrink-0 items-center gap-1.5">
      <Ctl label="Previous step" onClick={go("prev")} off={s.step <= 1} testId="how-prev">
        <ChevronLeft className="size-4" aria-hidden />
      </Ctl>
      {!s.reduced &&
        (s.playing ? (
          <Ctl label="Pause" onClick={go("pause")} testId="how-play">
            <Pause className="size-4" aria-hidden />
          </Ctl>
        ) : (
          <Ctl label={atEnd ? "Play again from step 1" : "Play"} onClick={go("play")} testId="how-play">
            <Play className="size-4" aria-hidden />
          </Ctl>
        ))}
      <Ctl label="Next step" onClick={go("next")} off={s.step >= LAST} testId="how-next">
        <ChevronRight className="size-4" aria-hidden />
      </Ctl>
      <Ctl label={s.reduced ? "Back to step 1" : "Replay from step 1"} onClick={go("replay")} testId="how-replay">
        <RotateCcw className="size-4" aria-hidden />
      </Ctl>
      {!s.reduced && (
        <Button
          size="sm"
          variant="secondary"
          aria-pressed={s.fast}
          aria-label="Double speed"
          title="Double speed"
          data-testid="how-speed"
          onClick={go("speed")}
          className={cx("mono w-11 px-0", s.fast && "bg-cyan/15 text-cyan ring-cyan/50 hover:bg-cyan/20")}
        >
          2×
        </Button>
      )}
    </div>
  );
}

function Caption({ s }: { s: Player }) {
  const step = s.step ? STEPS[s.step - 1] : null;
  return (
    <p
      aria-live="polite"
      data-testid="how-caption"
      data-step={s.step}
      className="min-h-[3lh] min-w-0 flex-1 text-[13px] leading-snug text-fg sm:min-h-[2lh]"
    >
      {step ? (
        <>
          <span className="mono mr-1.5 inline-block rounded bg-ink-700 px-1.5 py-px text-[11px] text-muted">
            <span aria-hidden>
              {step.n}/{LAST}
            </span>
            <span className="sr-only">
              Step {step.n} of {LAST}.
            </span>
          </span>
          {step.caption}
        </>
      ) : s.reduced ? (
        <span className="text-muted">Sixteen steps. Step through them with the arrows to see what moves at each one.</span>
      ) : (
        <span className="text-muted">Sixteen steps. Press play and a cat carries each message across, or step through with the arrows.</span>
      )}
    </p>
  );
}

// ---------------------------------------------------------------------------

export function HowItWorks() {
  const figure = useRef<HTMLElement>(null);
  const { s, dispatch } = useHowPlayer(figure);
  const cur = s.step;
  const bal = balancesAfter(done(s));
  const curStep = cur ? STEPS[cur - 1] : null;
  const play: CatPlay | null = curStep ? { ms: runMs(curStep) / speedOf(s), moving: !s.arrived, reduced: s.reduced, run: s.run } : null;
  let n = 0;
  return (
    <section id="how-it-works" aria-labelledby="how-title" className="scroll-mt-20" data-testid="how">
      <h2 id="how-title" className="text-2xl font-semibold tracking-[-0.03em] text-fg sm:text-3xl">
        How It Works
      </h2>
      <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-muted">
        Alice pays Bob, Bob pays back without owning any ETC, then Bob takes ETC out to a fresh address. On this page one
        browser wallet plays both Alice's wallet and the relayer. A cat carries each message across so you can watch what
        moves. The arrows and labels are exact, and the cat doesn't touch what it carries.
      </p>
      <figure
        ref={figure}
        className="mt-6 overflow-clip rounded-2xl bg-ink-900/70 ring-1 ring-white/[0.07] ring-inset"
        aria-labelledby="how-caption"
        data-testid="how-figure"
        data-step={cur}
        data-playing={s.playing ? "1" : "0"}
        data-arrived={s.arrived ? "1" : "0"}
        data-reduced={s.reduced ? "1" : "0"}
      >
        <figcaption id="how-caption" className="sr-only">
          Sequence diagram of the {LEDGER_SYMBOL} demo, in sixteen numbered messages between Alice, her browser wallet, {LEDGER_SYMBOL}, the
          verifier, Bob, a relayer and Bob's fresh address.
        </figcaption>
        {/* Participant heads and balances, wide screens only. */}
        <div className="sticky top-14 z-30 hidden border-b border-white/[0.06] bg-ink-900 px-2 py-3 md:grid" style={grid} aria-hidden>
          {PARTIES.map((p, i) => {
            const chip = CHIPS.find((c) => c.party === i);
            const lit = curStep && (curStep.from === i || curStep.to === i);
            return (
              <div key={p.name} className="flex flex-col items-center px-1 text-center">
                <div className={cx("text-[13px] leading-tight font-medium transition-colors duration-300", lit ? "text-cyan" : "text-fg")}>{p.name}</div>
                <div className="mt-0.5 text-[11px] text-subtle">{p.note}</div>
                {chip && (
                  <div className="mt-1.5">
                    <Chip c={chip} bal={bal} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {PHASES.map((ph, pi) => {
          const start = n + 1;
          const phaseOn = curStep?.phase === pi;
          return (
            <section key={ph.title} className="relative px-4 py-4 md:px-2" aria-label={ph.title} data-testid={`how-phase-${pi + 1}`} data-on={phaseOn ? "1" : undefined}>
              <h3
                className={cx(
                  "mb-2 flex items-center gap-2 text-xs font-medium tracking-wide uppercase transition-colors duration-300 md:px-2",
                  phaseOn ? "text-cyan [text-shadow:0_0_12px_color-mix(in_oklab,var(--color-cyan)_55%,transparent)]" : "text-accent-hi",
                )}
              >
                <span className={cx("size-1.5 rounded-full transition-colors duration-300", phaseOn ? "bg-cyan shadow-[0_0_8px_var(--color-cyan)]" : "bg-ink-600")} aria-hidden />
                {ph.title}
              </h3>
              <div className="pointer-events-none absolute inset-x-2 top-0 bottom-0 hidden md:grid" style={grid} aria-hidden>
                {PARTIES.map((p, i) => (
                  <div
                    key={p.name}
                    className={cx("mx-auto w-px transition-colors duration-300", curStep && (curStep.from === i || curStep.to === i) ? "bg-cyan/35" : "bg-ink-600/70")}
                  />
                ))}
              </div>
              <ol start={start} className="relative space-y-1 md:space-y-0">
                {ph.msgs.map((m) => {
                  n++;
                  const status: Status = n === cur ? "active" : n < cur ? "past" : "future";
                  const active = status === "active";
                  return (
                    <li key={n} className="relative" data-testid={`how-step-${n}`} data-status={status}>
                      <span className="sr-only">{sentence(m)}</span>
                      {/* Narrow screens: a numbered line. */}
                      <div
                        className={cx(
                          "-mx-2 flex gap-2.5 rounded-lg px-2 py-1.5 ring-1 transition-colors duration-300 md:hidden",
                          active ? "bg-cyan/[0.07] ring-cyan/35" : "ring-transparent",
                        )}
                        aria-hidden
                      >
                        <Num n={n} status={status} />
                        <div className="min-w-0 flex-1 text-[13px] leading-snug">
                          <div className={cx("text-xs", active ? "text-cyan" : "text-subtle")}>
                            {m.from === m.to ? PARTIES[m.from].name : `${PARTIES[m.from].name} → ${PARTIES[m.to].name}`}
                          </div>
                          <div className={cx("text-fg", m.style === "reply" && !active && "text-muted")}>{m.text}</div>
                        </div>
                        {active && play && (
                          <div key={play.run} className={cx("self-center", !s.reduced && "how-appear")}>
                            <ItemIcon carry={m.carry} className="h-5 w-6" />
                          </div>
                        )}
                      </div>
                      {/* Wide screens: an arrow between lifelines. */}
                      <div className="hidden md:grid" style={grid} aria-hidden>
                        <Arrow m={m} n={n} status={status} play={active ? play : null} />
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          );
        })}
        <div className="flex flex-wrap gap-x-5 gap-y-1 border-t border-white/[0.06] px-4 py-3 text-[11px] text-subtle" aria-hidden>
          <Legend style="call" label="call on chain" />
          <Legend style="reply" label="return value" />
          <Legend style="pay" label="ETC paid out" />
          <Legend style="offchain" label="off chain" />
          <span className="inline-flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-cyan" />
            {LEDGER_SYMBOL}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-warn" />
            ETC
          </span>
        </div>
        {/* The player. It sticks to the bottom of the screen while the diagram is in view. */}
        <div className="sticky bottom-0 z-30 border-t border-white/[0.08] bg-ink-900 px-3 pt-1 pb-2.5 shadow-[0_-12px_24px_-12px_var(--color-ink-950)] sm:px-4 md:pt-2.5" data-testid="how-player">
          <Lane step={curStep} play={play} bal={bal} />
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:gap-4">
            <Caption s={s} />
            <Controls s={s} dispatch={dispatch} />
          </div>
        </div>
      </figure>
      <p className="mt-4 max-w-2xl text-[13px] leading-relaxed text-muted">
        Every signed message covers the chain ID, the contract, the sender's nonce, the recipient, the amount, the fee, a
        deadline and the memo. A relayer can't change any of it, a signature can't be replayed, and a signature from
        another chain fails.
      </p>
    </section>
  );
}

function Legend({ style, label }: { style: Style; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cx("w-5 border-t-[1.5px]", lineClass[style])} />
      {label}
    </span>
  );
}
