import { LEDGER_SYMBOL } from "../generated/contracts";
import { A, LINKS } from "./ext";

const LIMITS = [
  "The account that submits a transaction isn't quantum-secure. A quantum attacker who breaks it can spend its gas money and nothing else.",
  "Nothing here is audited.",
  "Each signature is 7,740 bytes, so a send costs about 290,000 gas, around 14 times a plain transfer.",
  `All ${LEDGER_SYMBOL} sits in one contract, so a bug there affects every holder.`,
  `leanSPHINCS isn't final. A new version means a new verifier and a new ${LEDGER_SYMBOL}.`,
  "Keys live in this browser's local storage, which suits small amounts only.",
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
          {LIMITS.map((l) => (
            <li key={l} className="flex gap-2.5">
              <span className="mt-[0.55rem] size-1 shrink-0 rounded-full bg-warn" aria-hidden />
              {l}
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
          . We follow the current version because its authors stand behind it, it uses the FIPS 205 hash layout, and its
          test vectors let us check our verifier and signer byte for byte.
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
