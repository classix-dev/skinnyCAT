import { FlaskConical, Newspaper } from "lucide-react";
import { useAppSel, type State } from "../store";
import { HashTree } from "./Brand";
import { GitHubMark, LINKS } from "./ext";

/**
 * How far up the tree the cat is, or 1 when it rests on the root. It climbs while a signature is
 * made. Key derivation stays inside its own card and doesn't move the cat.
 */
function climb(s: State): number {
  const sig = s.busy ? s.runs[s.busy]?.steps.find((x) => x.id === "signature") : undefined;
  return sig?.state === "run" ? Math.min(sig.progress ?? 0, 0.999) : 1;
}

const heroButton =
  "inline-flex h-9 items-center gap-2 rounded-lg bg-white/[0.04] px-3.5 text-sm font-medium text-fg ring-1 ring-ink-600 ring-inset transition-colors hover:bg-white/[0.08]";

export function Hero() {
  const t = useAppSel(climb);
  const moving = t < 1;
  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-center lg:gap-x-14 xl:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
      <div>
        <h1 className="text-[2.4rem] leading-[1.04] font-semibold tracking-[-0.04em] text-fg sm:text-5xl lg:text-[3.4rem]">
          <span className="bg-gradient-to-r from-accent-hi via-cyan to-accent-hi bg-clip-text text-transparent">Quantum-Safe</span>{" "}
          Payments on Ethereum Classic
        </h1>
        <p className="mt-5 max-w-xl text-base leading-relaxed text-muted sm:text-lg" data-testid="lead">
          skinnyCAT moves ETC with a leanSPHINCS signature, which a quantum computer can't forge. Make a key in your browser,
          deposit ETC to it, and only that key can spend it.
        </p>
        <p className="mt-3 max-w-xl text-base leading-relaxed text-muted sm:text-lg">
          Try it with two cats. Alice pays Bob, and Bob pays her back without holding any ETC.
        </p>
        <p
          role="note"
          aria-label="Educational demo"
          data-testid="disclaimer"
          className="mt-6 flex max-w-xl items-center gap-2.5 text-[13px] text-muted"
        >
          <FlaskConical className="size-4 shrink-0 text-warn" aria-hidden />
          An educational demo, not a production app. It isn't audited, so use tiny amounts.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <a href={LINKS.repo} target="_blank" rel="noopener noreferrer" data-testid="hero-github" className={heroButton}>
            <GitHubMark className="size-4" />
            Source on GitHub
          </a>
          <a
            href={LINKS.post}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="hero-post"
            title="The First Payment Using a Quantum-Safe Signature on Ethereum Classic"
            className={heroButton}
          >
            <Newspaper className="size-4" aria-hidden />
            Read the Blog Post
          </a>
        </div>
      </div>
      <div className="hidden w-full lg:block" style={{ aspectRatio: "320 / 248" }}>
        <HashTree t={t} moving={moving} className="w-full" />
      </div>
    </div>
  );
}
