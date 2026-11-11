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
        <p className="inline-flex items-center gap-2 rounded-full bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent-hi ring-1 ring-accent/25 ring-inset">
          <span className="size-1.5 rounded-full bg-cyan" aria-hidden />
          leanSPHINCS on Ethereum Classic
        </p>
        <h1 className="mt-5 text-[2.4rem] leading-[1.04] font-semibold tracking-[-0.04em] text-fg sm:text-5xl lg:text-[3.4rem]">
          <span className="bg-gradient-to-r from-accent-hi via-cyan to-accent-hi bg-clip-text text-transparent">Quantum-Secure</span>{" "}
          Payments on Ethereum Classic
        </h1>
        <p className="mt-4 max-w-xl text-base leading-relaxed text-muted sm:text-lg" data-testid="lead">
          Meet skinnyCAT, a knock-off demo with a silly name. Alice and Bob are cats with leanSPHINCS keys made in this
          browser. Alice pays Bob. Bob is a skinny stray with no ETC to his name, and he pays her back anyway.
        </p>
        <p className="mt-4 max-w-xl border-l-2 border-cyan/40 pl-3 text-[15px] leading-relaxed text-fg" data-testid="schrodinger">
          Until a quantum computer looks, an ECDSA key is fine and broken at the same time. A leanSPHINCS key is just fine.
        </p>
        <div
          role="note"
          aria-label="Proof of concept"
          data-testid="disclaimer"
          className="mt-6 flex max-w-xl gap-3 rounded-xl bg-warn/[0.06] p-3.5 ring-1 ring-warn/25 ring-inset"
        >
          <FlaskConical className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
          <p className="text-[13px] leading-relaxed text-muted">
            <span className="font-medium text-fg">A proof of concept and an experiment, built for fun.</span> It isn't meant
            for real use. Nothing here is audited, so use tiny amounts only.
          </p>
        </div>
        <p className="mt-4 max-w-xl text-[13px] leading-relaxed text-subtle" data-testid="definition">
          Quantum-secure here means a quantum computer can't spend the funds. Gas is still paid by an ordinary account, which
          only risks its own gas money. The cat is a quantum joke. Hash-based signatures protect the funds, and superposition
          has nothing to do with it.
        </p>
      </div>
      <div className="hidden w-full lg:block" style={{ aspectRatio: "320 / 248" }}>
        <HashTree t={t} moving={moving} className="w-full" />
      </div>
    </div>
  );
}
