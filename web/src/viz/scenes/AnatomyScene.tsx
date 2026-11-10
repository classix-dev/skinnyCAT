// Scene 7. The 7,740 bytes of this signature as a mosaic, one square per byte, and a proportional bar.
import { useEffect, useMemo, useRef, useState } from "react";
import { ECDSA_SIG_SIZE, signatureGroups, signatureSections, type Group, type Section } from "../data/explain";
import { SceneFrame, useScene } from "../frame";
import { useWidth } from "../hooks";
import { useSample } from "../sample";
import { C, describeByte, fmt, GROUP_COLOR, GROUP_LABEL } from "../theme";
import { span } from "../timeline";
import "../viz.css";

const BEATS = [0, 3.0, 5.0, 7.2] as const;
const DUR = 9.2;

const GROUP_INFO: Record<Group, string> = {
  randomizer: "Derived from a secret and the message, then hashed into the digest, so nobody without the key can predict which leaves a message will pick.",
  fors: "24 openings of 176 bytes, each a secret leaf and the 10 siblings up to its tree's root.",
  bottom: "A 4-byte counter, 64 chain values and 8 siblings. It signs the FORS key.",
  middle: "A 4-byte counter, 64 chain values and 8 siblings. It signs the bottom tree's root.",
  top: "A 4-byte counter, 64 chain values and 10 siblings. It signs the middle root, and its climb ends at PK.root.",
};

// Brighter for the short fields, so counters and FORS secrets stand out.
const PART_LIGHT: Record<Section["part"], number> = { randomizer: 1, secret: 1, counter: 1, path: 0.62, chains: 0.78, auth: 0.55 };

export default function AnatomyScene() {
  const { ex } = useSample();
  const box = useRef<HTMLDivElement>(null);
  const width = useWidth(box);
  const compact = width > 0 && width < 560;
  const cols = compact ? 90 : 129; // 90 x 86 or 129 x 60, both exactly 7,740
  const rows = 7740 / cols;
  const { ref, tl, copy } = useScene("anatomy", BEATS, DUR);
  const t = tl.t;
  const canvas = useRef<HTMLCanvasElement>(null);
  const [focus, setFocus] = useState<Group | null>(null);
  const [hover, setHover] = useState<number | null>(null);

  const sections = useMemo(() => signatureSections(), []);
  const groups = useMemo(() => signatureGroups(), []);
  const partOf = useMemo(() => {
    const out = new Array<Section>(7740);
    for (const s of sections) for (let i = 0; i < s.length; i++) out[s.offset + i] = s;
    return out;
  }, [sections]);

  const fill = Math.round(span(t, 0.2, BEATS[1] - 0.3) * 7740);
  const autoFocus: Group[] | null =
    t >= BEATS[3] ? null : t >= BEATS[2] ? ["bottom", "middle", "top"] : t >= BEATS[1] ? ["randomizer", "fors"] : null;
  const lit = (g: Group) => (focus ? focus === g : autoFocus ? autoFocus.includes(g) : true);
  const ecdsa = span(t, BEATS[3], BEATS[3] + 0.8);

  const cellPx = width > 0 ? Math.floor((width / cols) * 4) / 4 : 5;

  useEffect(() => {
    const c = canvas.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx || width === 0) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = cols * cellPx;
    const h = rows * cellPx;
    if (c.width !== Math.round(w * dpr)) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const gap = cellPx > 4 ? 0.8 : 0.5;
    for (let i = 0; i < 7740; i++) {
      const x = (i % cols) * cellPx;
      const y = Math.floor(i / cols) * cellPx;
      if (i >= fill) {
        ctx.globalAlpha = 1;
        ctx.fillStyle = C.ink800;
      } else {
        const s = partOf[i];
        const v = ex.signature[i] / 255;
        ctx.fillStyle = GROUP_COLOR[s.group];
        ctx.globalAlpha = (0.18 + 0.82 * v) * PART_LIGHT[s.part] * (lit(s.group) ? 1 : 0.14);
      }
      ctx.fillRect(x, y, cellPx - gap, cellPx - gap);
    }
    if (hover !== null) {
      ctx.globalAlpha = 1;
      ctx.strokeStyle = C.fg;
      ctx.lineWidth = 1.2;
      ctx.strokeRect((hover % cols) * cellPx - 0.6, Math.floor(hover / cols) * cellPx - 0.6, cellPx + 0.4, cellPx + 0.4);
    }
    ctx.globalAlpha = 1;
  });

  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const col = Math.floor(((e.clientX - r.left) / r.width) * cols);
    const row = Math.floor(((e.clientY - r.top) / r.height) * rows);
    if (col < 0 || col >= cols || row < 0 || row >= rows) return setHover(null);
    setHover(row * cols + col);
  };

  const info = hover !== null
    ? `Byte ${fmt(hover)}: 0x${ex.signature[hover].toString(16).padStart(2, "0")}, ${describeByte(sections, hover)}`
    : focus
      ? GROUP_INFO[focus]
      : "Hover or tap a square to read its byte. Pick a section to see what it holds.";

  return (
    <SceneFrame sceneRef={ref} tl={tl} copy={copy}>
      <div ref={box} className="px-2 pt-4 pb-3 sm:px-5 sm:pt-5">
        {/* Proportional bar of the five sections. */}
        <div className="flex h-7 w-full overflow-hidden rounded-md" aria-hidden>
          {groups.map((g) => (
            <div
              key={g.group}
              className="h-full transition-opacity duration-300"
              style={{
                width: `${(g.length / 7740) * 100}%`,
                minWidth: 3,
                background: `color-mix(in oklab, ${GROUP_COLOR[g.group]} ${lit(g.group) ? 75 : 18}%, transparent)`,
                boxShadow: "inset -1px 0 0 rgb(3 5 12 / 0.9)",
                transform: `scaleX(${span(fill, g.offset, g.offset + g.length)})`,
                transformOrigin: "left",
              }}
            />
          ))}
        </div>
        <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Sections of the signature">
          {groups.map((g) => (
            <li key={g.group}>
              <button
                type="button"
                aria-pressed={focus === g.group}
                onClick={() => setFocus((f) => (f === g.group ? null : g.group))}
                className={[
                  "flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-[12px] ring-1 ring-inset transition-colors",
                  focus === g.group ? "bg-white/[0.06] text-fg ring-white/20" : "text-muted ring-white/[0.07] hover:text-fg",
                ].join(" ")}
              >
                <span className="size-2 rounded-[2px]" style={{ background: GROUP_COLOR[g.group] }} aria-hidden />
                {GROUP_LABEL[g.group]}
                <span className="mono text-subtle tabular-nums">{fmt(g.length)}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex items-end gap-3 sm:gap-5">
          <div className="min-w-0">
            <canvas
              ref={canvas}
              role="img"
              aria-label={`${copy.figure} Bytes shown: ${fmt(fill)} of 7,740.`}
              className="block touch-none"
              style={{ width: cols * cellPx, height: rows * cellPx }}
              onPointerMove={onMove}
              onPointerDown={onMove}
              onPointerLeave={() => setHover(null)}
            />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <p className="min-h-[2.5rem] max-w-xl flex-1 text-[13px] leading-snug text-muted" aria-live="polite">
            {info}
          </p>
          <div className="flex items-end gap-3" style={{ opacity: ecdsa }} aria-hidden={ecdsa === 0}>
            <div>
              <div className="grid gap-[0.8px]" style={{ gridTemplateColumns: `repeat(13, ${cellPx - 0.8}px)` }}>
                {Array.from({ length: ECDSA_SIG_SIZE }, (_, i) => (
                  <span key={i} style={{ width: cellPx - 0.8, height: cellPx - 0.8, background: C.warn, opacity: 0.85 }} />
                ))}
              </div>
            </div>
            <p className="text-[12px] leading-tight text-muted">
              <span className="mono text-warn">65 bytes</span>
              <br />
              ECDSA, to scale
            </p>
          </div>
        </div>
      </div>
    </SceneFrame>
  );
}
