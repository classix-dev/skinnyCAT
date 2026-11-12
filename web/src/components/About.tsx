import { LEDGER_SYMBOL } from "../generated/contracts";
import { A, LINKS } from "./ext";

const LIMITS: [string, string][] = [
  ["submitter", "The account that pays gas isn't quantum-safe. Breaking it gets only its gas money."],
  ["audit", "Nothing here is audited."],
  ["size", "A send costs about 290,000 gas, 14 times a plain transfer."],
  ["contract", `All ${LEDGER_SYMBOL} sits in one contract, so a bug there hits every holder.`],
  ["final", `leanSPHINCS isn't final. A new version means a new ${LEDGER_SYMBOL}.`],
  ["storage", "Keys live in browser storage."],
];

const SPEC: [string, string][] = [
  ["hash", "Keccak-256, truncated to 16 bytes"],
  ["public key", "32 bytes"],
  ["signature", "7,740 bytes"],
  ["lifetime", "2^30 signatures, no signer state"],
];

export function About() {
  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <section id="limitations" aria-labelledby="limits-title" className="scroll-mt-20 rounded-2xl p-4 ring-1 ring-white/[0.07] ring-inset sm:p-6" data-testid="limits">
        <h2 id="limits-title" className="text-lg font-semibold tracking-[-0.02em] text-fg">
          Current Limitations
        </h2>
        <ul className="mt-3 space-y-2 text-[13px] leading-relaxed text-muted">
          {LIMITS.map(([k, l]) => (
            <li key={k} className="flex gap-2.5">
              <span className="mt-[0.55rem] size-1 shrink-0 rounded-full bg-warn" aria-hidden />
              <span>{l}</span>
            </li>
          ))}
        </ul>
      </section>
      <section id="spec" aria-labelledby="spec-title" className="scroll-mt-20 rounded-2xl p-4 ring-1 ring-white/[0.07] ring-inset sm:p-6" data-testid="spec">
        <h2 id="spec-title" className="text-lg font-semibold tracking-[-0.02em] text-fg">
          The Spec
        </h2>
        <p className="mt-3 text-[13px] leading-relaxed text-muted">
          leanSPHINCS as <A href={LINKS.ethlib}>EthLib</A> specifies it, at commit{" "}
          <A href={LINKS.ethlibCommit}>
            <span className="mono">dce7a2d</span>
          </A>
          , checked against its test vectors.
        </p>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[13px]">
          {SPEC.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-subtle">{k}</dt>
              <dd className="mono text-xs leading-5 text-fg">{v}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
