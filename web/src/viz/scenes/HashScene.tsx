// Scene 1. Keccak-256 as a 1,600-bit state, drawn round by round from a real computation.
import { useEffect, useMemo, useRef, useState } from "react";
import { clampText, keccakRounds, KECCAK_BLOCK } from "../data/keccakf";
import { SceneFrame, useScene } from "../frame";
import { useSample } from "../sample";
import { C } from "../theme";
import { span } from "../timeline";
import "../viz.css";

const BEATS = [0, 1.8, 5.8, 7.4] as const;
const DUR = 9.4;

// 5 x 5 lanes of 8 x 8 bits, one byte per row of a lane.
const CELL = 7;
const PITCH = 8;
const LANE = 8 * PITCH - 1;
const GAP = 4;
const SIZE = 5 * LANE + 4 * GAP; // 331
const RATE_LANES = KECCAK_BLOCK / 8; // 17
const ROUND_STEPS = ["θ", "ρ", "π", "χ", "ι"];

interface Look {
  state: Uint8Array;
  /** Bytes of the absorbed block shown so far, during absorb. */
  shown: number;
  inputLen: number;
  /** 0 while mixing, 1 once the output is read, 2 once the 16 kept bytes are marked. */
  out: 0 | 1 | 2;
}

function draw(ctx: CanvasRenderingContext2D, look: Look) {
  ctx.clearRect(0, 0, SIZE, SIZE);
  for (let lane = 0; lane < 25; lane++) {
    const lx = (lane % 5) * (LANE + GAP);
    const ly = Math.floor(lane / 5) * (LANE + GAP);
    const capacity = lane >= RATE_LANES;
    for (let j = 0; j < 8; j++) {
      const byteIndex = lane * 8 + j;
      const v = look.state[byteIndex];
      const hidden = byteIndex >= look.shown;
      for (let b = 0; b < 8; b++) {
        const on = !hidden && ((v >> b) & 1) === 1;
        let color: string = capacity ? C.ink850 : C.ink800;
        let alpha = 1;
        if (on) {
          if (look.shown < 200) color = byteIndex < look.inputLen ? C.accentHi : C.warn;
          else if (look.out === 0) color = C.accent;
          else if (lane < 4) {
            color = C.cyan;
            alpha = look.out === 2 && lane >= 2 ? 0.35 : 1;
          } else {
            color = C.accent;
            alpha = 0.32;
          }
        }
        ctx.globalAlpha = alpha;
        ctx.fillStyle = color;
        ctx.fillRect(lx + b * PITCH, ly + j * PITCH, CELL, CELL);
      }
    }
  }
  ctx.globalAlpha = 1;
}

function bitsDiffer(a: Uint8Array, b: Uint8Array) {
  let n = 0;
  for (let i = 0; i < a.length; i++) {
    let x = a[i] ^ b[i];
    while (x) {
      n += x & 1;
      x >>= 1;
    }
  }
  return n;
}

export default function HashScene() {
  const sample = useSample();
  const [text, setText] = useState(sample.text);
  const [diff, setDiff] = useState<number | null>(null);
  // A newly signed message becomes the text to hash.
  useEffect(() => setText(clampText(sample.text)), [sample.text]);
  const { ref, tl, copy } = useScene("hash", BEATS, DUR);
  const canvas = useRef<HTMLCanvasElement>(null);

  const bytes = useMemo(() => new TextEncoder().encode(text), [text]);
  const states = useMemo(() => keccakRounds(bytes), [bytes]);
  const digest = states[24].subarray(0, 32);
  const prevDigest = useRef(digest);
  useEffect(() => {
    if (prevDigest.current !== digest) {
      setDiff(bitsDiffer(prevDigest.current, digest));
      prevDigest.current = digest;
    }
  }, [digest]);

  const t = tl.t;
  const absorbing = t < BEATS[1];
  const round = absorbing ? 0 : Math.min(24, Math.floor(span(t, BEATS[1] + 0.1, BEATS[2] - 0.3) * 24.999));
  const outShown = Math.round(span(t, BEATS[2], BEATS[2] + 1.1) * 32);
  const keep = t >= BEATS[3];
  const look: Look = {
    state: states[round],
    shown: absorbing ? Math.round(span(t, 0.15, 1.5) * KECCAK_BLOCK) : 200,
    inputLen: bytes.length,
    out: t >= BEATS[2] ? (keep ? 2 : 1) : 0,
  };

  useEffect(() => {
    const c = canvas.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    const scale = c.width / SIZE;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    draw(ctx, look);
  });

  const phase = absorbing ? "Absorb" : round < 24 || t < BEATS[2] ? `Round ${Math.max(1, round)} of 24` : "Squeeze";

  return (
    <SceneFrame
      sceneRef={ref}
      tl={tl}
      copy={copy}
      below={
        <p className="mt-1 text-[13px] text-subtle" aria-live="polite">
          {diff !== null && diff > 0 ? (
            <>
              Your edit changed <span className="mono text-fg tabular-nums">{diff}</span> of the 256 output bits.
            </>
          ) : (
            "Edit the text above the grid. Any change scrambles the whole output."
          )}
        </p>
      }
    >
      <div className="p-4 sm:p-5">
        <label htmlFor="sx-hash-in" className="flex items-baseline justify-between text-[11px] tracking-wide text-subtle uppercase">
          <span>Text to hash</span>
          <span className="mono normal-case tabular-nums">{bytes.length} bytes</span>
        </label>
        <input
          id="sx-hash-in"
          value={text}
          onChange={(e) => {
            setText(clampText(e.target.value));
            if (tl.t < BEATS[3]) tl.seek(BEATS[3]);
          }}
          spellCheck={false}
          autoComplete="off"
          className="mono mt-1.5 h-10 w-full rounded-lg bg-ink-850 px-3 text-[14px] text-fg ring-1 ring-ink-600 ring-inset focus:ring-accent focus:outline-none"
        />
        <div className="mt-4 grid items-center gap-5 sm:grid-cols-[minmax(0,331px)_minmax(0,1fr)] sm:gap-6">
          <div className="mx-auto w-full max-w-[331px]">
            <canvas
              ref={canvas}
              width={SIZE * 2}
              height={SIZE * 2}
              role="img"
              aria-label={`The Keccak state, ${phase.toLowerCase()}. 1,600 bits in 25 lanes of 64.`}
              className="sx-canvas block aspect-square w-full"
            />
            <div className="mono mt-2 flex justify-between text-[10.5px] text-subtle">
              <span>
                <span className="mr-1 inline-block size-2 rounded-[2px] bg-ink-800 ring-1 ring-ink-600" aria-hidden />
                rate, 136 bytes
              </span>
              <span>
                <span className="mr-1 inline-block size-2 rounded-[2px] bg-ink-850 ring-1 ring-ink-700" aria-hidden />
                capacity, 64 bytes
              </span>
            </div>
          </div>
          <div className="min-w-0">
            <p className="mono text-[11px] tracking-wide text-subtle uppercase">Keccak-f[1600]</p>
            <p className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-fg tabular-nums">{phase}</p>
            <p className="mono mt-1 flex gap-2 text-[15px]" aria-hidden>
              {ROUND_STEPS.map((s, i) => {
                const lit = !absorbing && round < 24 && Math.floor(t * 12) % 5 === i;
                return (
                  <span key={s} className={lit ? "text-cyan" : "text-ink-500"}>
                    {s}
                  </span>
                );
              })}
            </p>
            <p className="mt-4 text-[11px] tracking-wide text-subtle uppercase">Keccak-256 output</p>
            <div className="mono mt-1.5 grid w-fit grid-cols-8 gap-x-3 gap-y-1 text-[13px] sm:text-[14px]" role="group" aria-label="The 32-byte hash">
              {Array.from(digest, (v, i) => {
                const shown = i < outShown;
                const kept = i < 16;
                return (
                  <span
                    key={`${i}-${v}`}
                    className={[
                      "tabular-nums transition-colors duration-300",
                      shown ? "sx-flash" : "",
                      !shown ? "" : keep ? (kept ? "text-cyan" : "text-subtle") : "text-fg",
                    ].join(" ")}
                  >
                    {shown ? v.toString(16).padStart(2, "0") : <span className="inline-block h-[3px] w-[1.2em] rounded-full bg-ink-600 align-middle" aria-hidden />}
                  </span>
                );
              })}
            </div>
            <p className={`mt-3 text-[13px] leading-snug transition-opacity duration-500 ${keep ? "opacity-100" : "opacity-0"}`}>
              <span className="text-cyan">First 16 bytes kept.</span>{" "}
              <span className="text-muted">Every hash in leanSPHINCS is cut to this size.</span>
            </p>
          </div>
        </div>
      </div>
    </SceneFrame>
  );
}
