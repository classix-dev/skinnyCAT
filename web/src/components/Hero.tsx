import { FlaskConical } from "lucide-react";
import { useApp } from "../store";
import { HashTree } from "./Brand";

export function Hero() {
  const { busy, keys } = useApp();
  const active = !!busy || keys.alice.view === "busy" || keys.bob.view === "busy";
  return (
    <div className="lg:sticky lg:top-24">
      <p className="inline-flex items-center gap-2 rounded-full bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent-hi ring-1 ring-accent/25 ring-inset">
        <span className="size-1.5 rounded-full bg-cyan" aria-hidden />
        leanSPHINCS on Ethereum Classic
      </p>
      <h1 className="mt-5 text-[2.4rem] leading-[1.04] font-semibold tracking-[-0.04em] text-fg sm:text-5xl lg:text-[3.4rem]">
        <span className="bg-gradient-to-r from-accent-hi via-cyan to-accent-hi bg-clip-text text-transparent">Quantum-Secure</span>{" "}
        Payments on Ethereum Classic
      </h1>
      <p className="mt-4 max-w-md text-base leading-relaxed text-muted sm:text-lg">
        Alice and Bob each get a leanSPHINCS key, made in this browser. Alice pays Bob, and Bob pays back without holding
        any ETC.
      </p>
      <div
        role="note"
        aria-label="Proof of concept"
        data-testid="disclaimer"
        className="mt-6 flex max-w-md gap-3 rounded-xl bg-warn/[0.06] p-3.5 ring-1 ring-warn/25 ring-inset"
      >
        <FlaskConical className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
        <p className="text-[13px] leading-relaxed text-muted">
          <span className="font-medium text-fg">A proof of concept and an experiment, built for fun.</span> It isn't meant
          for real use. Nothing here is audited, so use tiny amounts only.
        </p>
      </div>
      <p className="mt-4 max-w-md text-[13px] leading-relaxed text-subtle" data-testid="definition">
        Quantum-secure here means a quantum computer can't spend the funds. Gas is still paid by an ordinary account, which
        only risks its own gas money.
      </p>
      <div className="mt-10 hidden max-w-sm lg:block" style={{ aspectRatio: "320 / 208" }}>
        <HashTree active={active} className="w-full" />
      </div>
    </div>
  );
}
