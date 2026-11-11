// The explainer's shell. It renders every heading, paragraph and step list on the server, and
// loads each animated scene as its own chunk when it comes near the viewport.
import { lazy, Suspense, useEffect, useRef, useState, type ComponentType, type LazyExoticComponent } from "react";
import { CREDITS, INTRO, QUANTUM, SCENES, type SceneCopy, type SceneId } from "./copy";
import { useInView } from "./hooks";
import { rich } from "./rich";
import { VizConfigContext, type VizConfig } from "./timeline";

const SCENE_COMPONENTS: Record<SceneId, LazyExoticComponent<ComponentType>> = {
  hash: lazy(() => import("./scenes/HashScene")),
  chain: lazy(() => import("./scenes/ChainScene")),
  wots: lazy(() => import("./scenes/WotsScene")),
  merkle: lazy(() => import("./scenes/MerkleScene")),
  fors: lazy(() => import("./scenes/ForsScene")),
  hypertree: lazy(() => import("./scenes/HypertreeScene")),
  anatomy: lazy(() => import("./scenes/AnatomyScene")),
  verify: lazy(() => import("./scenes/VerifyScene")),
};
const SamplePanel = lazy(() => import("./SamplePanel"));

/** Mounts `children` once the slot is within a screen or so of the viewport. */
function WhenNear({ fallback, children, minH }: { fallback: React.ReactNode; children: React.ReactNode; minH: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const near = useInView(ref, "400px 0px");
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    if (!near || mounted) return;
    // Mount in idle time, so loading a scene never competes with the page's first paint or input.
    const ric = window.requestIdleCallback;
    if (ric) {
      const id = ric(() => setMounted(true), { timeout: 600 });
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(() => setMounted(true), 50);
    return () => window.clearTimeout(id);
  }, [near, mounted]);
  return (
    <div ref={ref} className={minH}>
      {mounted ? <Suspense fallback={fallback}>{children}</Suspense> : fallback}
    </div>
  );
}

function StaticSteps({ copy }: { copy: SceneCopy }) {
  return (
    <div className="rounded-2xl bg-ink-900/70 p-5 ring-1 ring-white/[0.07] ring-inset">
      <p className="sr-only">{copy.figure}</p>
      <ol className="space-y-2.5">
        {copy.steps.map((s, i) => (
          <li key={i} className="flex gap-3 text-[14px] leading-snug text-muted">
            <span className="mono mt-px text-[11px] text-accent-hi" aria-hidden>
              {String(i + 1).padStart(2, "0")}
            </span>
            {rich(s)}
          </li>
        ))}
      </ol>
    </div>
  );
}

function SceneSection({ copy, n }: { copy: SceneCopy; n: number }) {
  const Scene = SCENE_COMPONENTS[copy.id];
  return (
    <section
      id={`how-${copy.id}`}
      aria-labelledby={`how-${copy.id}-h`}
      className="grid gap-5 border-t border-white/[0.06] py-10 sm:py-14 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:gap-14 lg:py-20"
    >
      <div className="lg:sticky lg:top-24 lg:self-start">
        <p className="mono text-xs text-accent-hi">{String(n).padStart(2, "0")}</p>
        <h3 id={`how-${copy.id}-h`} className="mt-2 text-[1.6rem] leading-[1.1] font-semibold tracking-[-0.03em] text-fg sm:text-3xl">
          {copy.title}
        </h3>
        {copy.body.map((p, i) => (
          <p key={i} className="mt-3 max-w-prose text-[15px] leading-relaxed text-muted">
            {rich(p)}
          </p>
        ))}
      </div>
      <WhenNear fallback={<StaticSteps copy={copy} />} minH="min-h-[24rem]">
        <Scene />
      </WhenNear>
    </section>
  );
}

export function SphincsExplainer({ className, config }: { className?: string; config?: VizConfig }) {
  return (
    <VizConfigContext value={config ?? {}}>
      <div className={className} data-testid="sphincs-explainer">
        <header className="max-w-2xl pb-8 sm:pb-10">
          <h2 className="text-[2rem] leading-[1.05] font-semibold tracking-[-0.04em] text-fg sm:text-[2.75rem]">{INTRO.title}</h2>
          {INTRO.lede.map((p, i) => (
            <p key={i} className="mt-4 text-base leading-relaxed text-muted sm:text-lg">
              {rich(p)}
            </p>
          ))}
        </header>
        <WhenNear fallback={<div className="h-[13.5rem] rounded-2xl bg-ink-900/70 ring-1 ring-white/[0.07] ring-inset" />} minH="min-h-[13.5rem]">
          <SamplePanel />
        </WhenNear>
        <div className="mt-6">
          {SCENES.map((s, i) => (
            <SceneSection key={s.id} copy={s} n={i + 1} />
          ))}
        </div>
        <section aria-labelledby="how-quantum-h" className="border-t border-white/[0.06] py-10 sm:py-14">
          <h3 id="how-quantum-h" className="text-[1.6rem] leading-[1.1] font-semibold tracking-[-0.03em] text-fg sm:text-3xl">
            {QUANTUM.title}
          </h3>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {QUANTUM.cards.map((c, i) => (
              <div
                key={c.title}
                className={`rounded-2xl p-5 ring-1 ring-inset ${i === 0 ? "bg-bad/[0.05] ring-bad/25" : "bg-cyan/[0.05] ring-cyan/25"}`}
              >
                <h4 className={`text-base font-semibold ${i === 0 ? "text-bad" : "text-cyan"}`}>{c.title}</h4>
                <p className="mt-2 text-[15px] leading-relaxed text-muted">{rich(c.body)}</p>
              </div>
            ))}
          </div>
        </section>
        <p className="border-t border-white/[0.06] pt-6 text-xs leading-relaxed text-subtle">
          The design is Tom Wambsgans&rsquo;{" "}
          <a className="text-muted underline decoration-ink-500 underline-offset-[3px] hover:text-fg" href={CREDITS.design.href} target="_blank" rel="noopener noreferrer">
            {CREDITS.design.label}
          </a>
          . The spec is{" "}
          <a className="text-muted underline decoration-ink-500 underline-offset-[3px] hover:text-fg" href={CREDITS.spec.href} target="_blank" rel="noopener noreferrer">
            {CREDITS.spec.label}
          </a>{" "}
          at commit <span className="mono">{CREDITS.spec.commit}</span>. The demo key&rsquo;s secret is public, so it is for looking at, never for funds.
        </p>
      </div>
    </VizConfigContext>
  );
}
