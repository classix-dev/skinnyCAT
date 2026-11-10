// A scene's clock. Every scene draws itself as a pure function of `t` (seconds), so the timeline can
// play, pause, scrub and jump between beats, and a still frame is one value of `t`.
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

export interface VizConfig {
  /** Freeze every scene at this fraction of its timeline (0..1), for screenshots. */
  stillAt?: number;
}
export const VizConfigContext = createContext<VizConfig>({});
export const useVizConfig = () => useContext(VizConfigContext);

export interface Timeline {
  t: number;
  duration: number;
  playing: boolean;
  /** Index of the current beat. */
  beat: number;
  beats: readonly number[];
  reduced: boolean;
  /** True once the user has stepped or scrubbed, so captions can be announced. */
  interacted: boolean;
  toggle(): void;
  replay(): void;
  seek(t: number): void;
  goBeat(i: number): void;
}

const EPS = 1e-3;

/** `beats` are the start times of each step, the first one 0. */
export function useTimeline(duration: number, beats: readonly number[], visible: boolean, reduced: boolean): Timeline {
  const { stillAt } = useVizConfig();
  const still = stillAt != null;
  const [t, setT] = useState(() => (still ? stillAt * duration : 0));
  const [playing, setPlaying] = useState(false);
  const [interacted, setInteracted] = useState(false);
  const tRef = useRef(t);
  tRef.current = t;
  const started = useRef(false);
  const resume = useRef(false);

  // Reduced motion: open on the finished picture and never autoplay.
  useEffect(() => {
    if (reduced && !still && !started.current) setT(duration);
  }, [reduced, still, duration]);

  // Autoplay once on first sight, pause off screen, resume on return.
  useEffect(() => {
    if (still || reduced) return;
    if (visible && !started.current) {
      started.current = true;
      setPlaying(true);
    } else if (visible && resume.current) {
      resume.current = false;
      setPlaying(true);
    } else if (!visible) {
      setPlaying((p) => {
        if (p) resume.current = true;
        return false;
      });
    }
  }, [visible, still, reduced]);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const n = tRef.current + dt;
      if (n >= duration) {
        setT(duration);
        setPlaying(false);
        return;
      }
      setT(n);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, duration]);

  const beatAt = (x: number) => {
    let b = 0;
    for (let i = 0; i < beats.length; i++) if (beats[i] <= x + EPS / 2) b = i;
    return b;
  };

  const seek = useCallback(
    (x: number) => {
      started.current = true;
      setInteracted(true);
      setT(Math.max(0, Math.min(duration, x)));
    },
    [duration],
  );

  const goBeat = useCallback(
    (i: number) => {
      const b = Math.max(0, Math.min(beats.length - 1, i));
      started.current = true;
      setInteracted(true);
      if (reduced) {
        setPlaying(false);
        setT(b + 1 < beats.length ? beats[b + 1] - EPS : duration);
      } else {
        setT(beats[b]);
        setPlaying(true);
      }
    },
    [beats, duration, reduced],
  );

  const toggle = useCallback(() => {
    started.current = true;
    setInteracted(true);
    setPlaying((p) => {
      if (!p && tRef.current >= duration - EPS) setT(0);
      return !p;
    });
  }, [duration]);

  const replay = useCallback(() => {
    started.current = true;
    setInteracted(true);
    if (reduced) {
      setT(beats.length > 1 ? beats[1] - EPS : duration);
      return;
    }
    setT(0);
    setPlaying(true);
  }, [reduced, beats, duration]);

  return { t, duration, playing, beat: beatAt(t), beats, reduced, interacted, toggle, replay, seek, goBeat };
}

// ---------------------------------------------------------------------------
// Easing and interpolation
// ---------------------------------------------------------------------------

export const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
export const easeInOut = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2);
export const easeOut = (p: number) => 1 - (1 - p) ** 3;
/** Linear progress of t through [a, b], clamped to 0..1. */
export const span = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
/** Eased progress of t through [a, b]. */
export const ease = (t: number, a: number, b: number) => easeInOut(span(t, a, b));
