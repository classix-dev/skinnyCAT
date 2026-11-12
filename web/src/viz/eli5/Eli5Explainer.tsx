// The "Like I'm Five" explainer. Six short scenes, each a sentence, an animated picture in the
// detailed explainer's frame, and a line saying what it stands for. One link at the end opens the
// detailed version. All the words render on the server.
import { WhyLean } from "../WhyLean";
import { ArrowRight } from "lucide-react";
import type { ComponentType } from "react";
import { rich } from "../rich";
import { ELI5_INTRO, ELI5_SCENES, UI, type Eli5Copy, type Eli5Id } from "./copy";
import BlenderScene from "./scenes/BlenderScene";
import CatchScene from "./scenes/CatchScene";
import PicksScene from "./scenes/PicksScene";
import QuantumScene from "./scenes/QuantumScene";
import StairsScene from "./scenes/StairsScene";
import TreeScene from "./scenes/TreeScene";

const SCENE_COMPONENTS: Record<Eli5Id, ComponentType> = {
  blender: BlenderScene,
  stairs: StairsScene,
  tree: TreeScene,
  picks: PicksScene,
  quantum: QuantumScene,
  catch: CatchScene,
};

/** Called with the id of the detailed section to open. */
export type SeeReal = (anchor: string) => void;

function RealLink({ anchor, onSeeReal, children, className }: { anchor: string; onSeeReal: SeeReal; children: React.ReactNode; className?: string }) {
  return (
    <a
      href={`#${anchor}`}
      className={className}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        onSeeReal(anchor);
      }}
    >
      {children}
    </a>
  );
}

function Eli5Section({ copy }: { copy: Eli5Copy }) {
  const Scene = SCENE_COMPONENTS[copy.id];
  return (
    <section
      id={`eli5-${copy.id}`}
      aria-labelledby={`eli5-${copy.id}-h`}
      data-testid="eli5-scene"
      className="grid gap-4 border-t border-white/[0.06] py-8 sm:gap-5 sm:py-12 lg:grid-cols-[minmax(0,21rem)_minmax(0,1fr)] lg:grid-rows-[auto_1fr] lg:gap-x-14 lg:py-16"
    >
      <div className="lg:col-start-1">
        <h3 id={`eli5-${copy.id}-h`} className="text-[1.6rem] leading-[1.1] font-semibold tracking-[-0.03em] text-fg sm:text-3xl">
          {copy.title}
        </h3>
        <p className="mt-3 max-w-prose text-[16px] leading-relaxed text-muted sm:text-[17px]">{rich(copy.body)}</p>
      </div>
      <div className="lg:col-start-2 lg:row-span-2 lg:row-start-1">
        <Scene />
      </div>
      <aside className="self-start rounded-xl bg-ink-900/60 px-4 py-3 ring-1 ring-white/[0.06] ring-inset lg:col-start-1" aria-label={`${UI.realLabel}, ${copy.title}`}>
        <p className="text-[11px] font-medium tracking-wide text-subtle uppercase">{UI.realLabel}</p>
        <p className="mt-1 text-[14px] leading-snug text-muted">{rich(copy.real)}</p>
      </aside>
    </section>
  );
}

export function Eli5Explainer({ onSeeReal }: { onSeeReal: SeeReal }) {
  return (
    <div data-testid="eli5-explainer">
      <header className="max-w-3xl pb-6 sm:pb-8">
        <h2 className="text-[2rem] leading-[1.05] font-semibold tracking-[-0.04em] text-fg sm:text-[2.75rem]">{ELI5_INTRO.title}</h2>
        <p className="mt-4 text-base leading-relaxed text-muted sm:text-lg">{ELI5_INTRO.lede}</p>
        <WhyLean />
      </header>
      {ELI5_SCENES.map((s) => (
        <Eli5Section key={s.id} copy={s} />
      ))}
      <div className="flex flex-col items-start gap-3 rounded-2xl bg-accent/[0.06] p-5 ring-1 ring-accent/20 ring-inset sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <p className="text-lg font-semibold text-fg">{UI.toReal}</p>
        <RealLink
          anchor="real"
          onSeeReal={onSeeReal}
          className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg bg-accent px-4 text-[15px] font-semibold text-ink-950 transition-colors hover:bg-accent-hi"
        >
          {UI.seeReal}
          <ArrowRight className="size-4" aria-hidden />
        </RealLink>
      </div>
    </div>
  );
}
