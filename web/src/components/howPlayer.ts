// The How It Works player. A pure reducer (tested on its own) and a hook that drives it with
// timers, starts it once the diagram scrolls into view, and holds still for reduced motion.

import { useEffect, useReducer, useState, type RefObject } from "react";
import { DWELL_MS, runMs, STEPS } from "./howData";

export const LAST = STEPS.length;

export type Player = {
  /** The current step, 1 to 16, or 0 before the first. */
  step: number;
  /** Whether the cat has reached the end of the current step, so its effect has happened. */
  arrived: boolean;
  playing: boolean;
  fast: boolean;
  /** Reduced motion: no running, the cat appears where it ends up. */
  reduced: boolean;
  /** Set by the first play, so scrolling past again doesn't restart it. */
  started: boolean;
  /** Bumped every time a step starts, so the cat's run restarts even on the same step. */
  run: number;
};

export type Action =
  | { type: "play" }
  | { type: "pause" }
  | { type: "next" }
  | { type: "prev" }
  | { type: "replay" }
  | { type: "speed" }
  | { type: "arrive" }
  | { type: "advance" }
  | { type: "autoplay" }
  | { type: "motion"; reduced: boolean };

export const initial: Player = { step: 0, arrived: true, playing: false, fast: false, reduced: false, started: false, run: 0 };

const goTo = (s: Player, step: number): Player => ({ ...s, step, arrived: s.reduced, run: s.run + 1 });

export function reduce(s: Player, a: Action): Player {
  switch (a.type) {
    case "play":
      if (s.reduced) return s;
      if (ended(s) || s.step === 0) return { ...goTo(s, 1), playing: true, started: true };
      return { ...s, playing: true, started: true };
    case "pause":
      return { ...s, playing: false };
    case "next":
      return s.step >= LAST ? { ...s, playing: false } : { ...goTo(s, s.step + 1), playing: false, started: true };
    case "prev":
      return s.step <= 1 ? { ...s, playing: false } : { ...goTo(s, s.step - 1), playing: false, started: true };
    case "replay":
      return { ...goTo(s, 1), playing: !s.reduced, started: true };
    case "speed":
      return { ...s, fast: !s.fast };
    case "arrive":
      if (s.arrived || s.step === 0) return s;
      return { ...s, arrived: true, playing: s.playing && s.step < LAST };
    case "advance":
      if (!s.playing || !s.arrived) return s;
      return s.step >= LAST ? { ...s, playing: false } : { ...goTo(s, s.step + 1), playing: true };
    case "autoplay":
      return s.started || s.reduced ? s : reduce(s, { type: "play" });
    case "motion":
      return a.reduced ? { ...s, reduced: true, playing: false, arrived: true } : { ...s, reduced: false };
  }
}

/** At the last step, arrived and stopped. */
export const ended = (s: Player) => s.step === LAST && s.arrived && !s.playing;

/** How many steps have taken effect, for the balances. */
export const done = (s: Player) => (s.arrived ? s.step : s.step - 1);

export const speedOf = (s: Player) => (s.fast ? 2 : 1);

/** The player, wired to timers, the viewport and the reduced-motion setting. */
export function useHowPlayer(target: RefObject<Element | null>) {
  const [s, dispatch] = useReducer(reduce, initial);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const mq = typeof window.matchMedia === "function" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
    if (!mq) return;
    const set = () => {
      dispatch({ type: "motion", reduced: mq.matches });
    };
    set();
    mq.addEventListener?.("change", set);
    return () => mq.removeEventListener?.("change", set);
  }, []);

  useEffect(() => {
    const el = target.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([e]) => {
        setVisible(e.isIntersecting);
        if (e.isIntersecting) dispatch({ type: "autoplay" });
      },
      { threshold: 0.25 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [target]);

  const speed = speedOf(s);
  useEffect(() => {
    if (s.step === 0) return;
    if (!s.arrived) {
      const t = setTimeout(() => dispatch({ type: "arrive" }), runMs(STEPS[s.step - 1]) / speed);
      return () => clearTimeout(t);
    }
    // Hold between steps while the diagram is off screen, and carry on when it comes back.
    if (s.playing && visible) {
      const t = setTimeout(() => dispatch({ type: "advance" }), DWELL_MS / speed);
      return () => clearTimeout(t);
    }
  }, [s.step, s.arrived, s.playing, s.run, speed, visible]);

  return { s, dispatch };
}
