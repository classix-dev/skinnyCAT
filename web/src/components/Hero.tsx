import { FlaskConical } from "lucide-react";
import { useApp, type State } from "../store";
import { HashTree } from "./Brand";

/** How far up the tree the cat is. It climbs while a key is derived or a signature is made, and rests on the root. */
function climb(s: State): { t: number; moving: boolean } {
  const key = s.keys.alice.view === "busy" ? s.keys.alice : s.keys.bob.view === "busy" ? s.keys.bob : null;
  if (key) return { t: key.progress, moving: true };
  const sig = s.busy ? s.runs[s.busy]?.steps.find((x) => x.id === "signature") : undefined;
  if (sig?.state === "run") return { t: sig.progress ?? 0, moving: true };
  return { t: 1, moving: false };
}

export function Hero() {
  const s = useApp();
  const { t, moving } = climb(s);
  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-center lg:gap-x-14 xl:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
      <div>
        <h1 className="text-[2.4rem] leading-[1.04] font-semibold tracking-[-0.04em] text-fg sm:text-5xl lg:text-[3.4rem]">
          <span className="bg-gradient-to-r from-accent-hi via-cyan to-accent-hi bg-clip-text text-transparent">Quantum-Secure</span>{" "}
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
      </div>
      <div className="hidden w-full lg:block" style={{ aspectRatio: "320 / 248" }}>
        <HashTree t={t} moving={moving} className="w-full" />
      </div>
    </div>
  );
}
