// The explainer with its toggle: "Like I'm Five" by default, and "The Real Thing", the detailed
// scenes. Safe to prerender. The server always renders the default, and the reader's stored
// choice or a #how-… link is applied after hydration.
//
// The detailed version's shell is small and imported here, so index.ts can keep exporting it. Its
// eight scenes, the sample signature and the signing worker are their own chunks, and nothing
// fetches them until a reader picks The Real Thing (hovering the button warms the first two).
import { Microscope } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Eli5Explainer } from "./eli5/Eli5Explainer";
import { MODES, UI } from "./eli5/copy";
import { DEFAULT_MODE, initialMode, modeFromHash, storeMode, type Mode } from "./mode";
import { SphincsExplainer } from "./SphincsExplainer";
import { VizConfigContext, type VizConfig } from "./timeline";

const warmReal = () => {
  void import("./SamplePanel");
  void import("./scenes/HashScene");
};

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

function CatFace({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true" focusable="false">
      <path d="M6 18 5.5 4.5 12 10H20L26.5 4.5 26 18Q26 27.5 16 27.5T6 18Z" fill="currentColor" fillOpacity="0.18" stroke="currentColor" strokeWidth="2.6" strokeLinejoin="round" />
      <g fill="currentColor">
        <ellipse cx="11.6" cy="18" rx="2.2" ry="2.9" />
        <ellipse cx="20.4" cy="18" rx="2.2" ry="2.9" />
      </g>
    </svg>
  );
}

function ModeToggle({ mode, onChange }: { mode: Mode; onChange(m: Mode): void }) {
  const opts: { m: Mode; icon: React.ReactNode }[] = [
    { m: "eli5", icon: <CatFace className="size-4" /> },
    { m: "real", icon: <Microscope className="size-4" aria-hidden /> },
  ];
  return (
    <div role="group" aria-label="Explainer version" className="relative inline-grid grid-cols-2 rounded-full bg-ink-900/90 p-1 ring-1 ring-white/[0.09] ring-inset">
      <span
        aria-hidden
        className="absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-full bg-accent shadow-[0_0_24px_-4px_var(--color-accent)] transition-transform duration-300 ease-out"
        style={{ transform: mode === "real" ? "translateX(100%)" : undefined }}
      />
      {opts.map(({ m, icon }) => (
        <button
          key={m}
          type="button"
          aria-pressed={mode === m}
          data-mode={m}
          onClick={() => onChange(m)}
          onPointerEnter={m === "real" ? warmReal : undefined}
          onFocus={m === "real" ? warmReal : undefined}
          className={cx(
            "relative z-10 inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-full px-3.5 text-[14px] font-semibold whitespace-nowrap transition-colors sm:px-5 sm:text-[15px]",
            mode === m ? "text-ink-950" : "text-muted hover:text-fg",
          )}
        >
          {icon}
          {MODES[m]}
        </button>
      ))}
    </div>
  );
}


/** Scrolls to the element with this id once it exists, and moves focus to its heading. */
function useJump(target: string | null, done: () => void) {
  useEffect(() => {
    if (!target) return;
    let raf = 0;
    let settled = 0;
    const t0 = performance.now();
    const place = (el: Element) => {
      const top = el.getBoundingClientRect().top;
      if (Math.abs(top - 16) > 4) window.scrollTo({ top: window.scrollY + top - 16 });
    };
    const tick = () => {
      const el = document.getElementById(target);
      const now = performance.now();
      if (el) {
        if (!settled) {
          settled = now;
          place(el);
          const h = el.matches("h1,h2,h3,h4") ? el : el.querySelector<HTMLElement>("h2,h3");
          if (h instanceof HTMLElement) {
            if (!h.hasAttribute("tabindex")) h.setAttribute("tabindex", "-1");
            h.focus({ preventScroll: true });
          }
        } else place(el); // Scenes above can still grow as they load.
        if (now - settled > 1200) return done();
      } else if (now - t0 > 8000) return done();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, done]);
}

export function Explainer({ className, config }: { className?: string; config?: VizConfig }) {
  const [mode, setMode] = useState<Mode>(DEFAULT_MODE);
  const [jump, setJump] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);

  // After hydration, open what the URL or the stored choice asks for.
  useEffect(() => {
    const m = initialMode();
    setMode(m);
    const h = window.location.hash.slice(1);
    if (m === "real" && h && h !== "real") setJump(h);
    const onHash = () => {
      const want = modeFromHash(window.location.hash);
      if (!want) return;
      setMode(want);
      storeMode(want);
      setJump(window.location.hash.slice(1));
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const choose = useCallback((m: Mode) => {
    setMode(m);
    storeMode(m);
    // Drop a hash that would reopen the other version on reload.
    const h = modeFromHash(window.location.hash);
    if (h && h !== m) history.replaceState(null, "", window.location.pathname + window.location.search);
    // From deep in the long version, come back up to the top of the explainer.
    const top = root.current?.getBoundingClientRect().top ?? 0;
    if (top < -40) window.scrollTo({ top: window.scrollY + top - 16 });
  }, []);

  const seeReal = useCallback((anchor: string) => {
    setMode("real");
    storeMode("real");
    history.replaceState(null, "", `#${anchor}`);
    setJump(anchor);
  }, []);

  const clearJump = useCallback(() => setJump(null), []);
  useJump(mode === "real" ? jump : null, clearJump);

  return (
    <VizConfigContext value={config ?? {}}>
      <div ref={root} className={className} data-testid="explainer" data-mode={mode}>
        <div className="mb-8 flex flex-wrap items-center gap-x-4 gap-y-2 sm:mb-10">
          <ModeToggle mode={mode} onChange={choose} />
        </div>
        <div id={mode}>
          {mode === "eli5" ? (
            <Eli5Explainer onSeeReal={seeReal} />
          ) : (
            <>
              <SphincsExplainer config={config} />
              <button
                type="button"
                onClick={() => choose("eli5")}
                className="mt-6 inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg px-4 text-[15px] font-semibold text-accent-hi ring-1 ring-accent/30 ring-inset transition-colors hover:bg-accent/10 hover:text-fg"
              >
                <CatFace className="size-4" />
                {UI.toEli5}
              </button>
            </>
          )}
        </div>
      </div>
    </VizConfigContext>
  );
}
