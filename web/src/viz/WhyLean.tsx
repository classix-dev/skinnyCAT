// Why leanSPHINCS, under the explainer's heading in both versions, with the Devcon 8 recordings.

const TELSY = "https://www.telsy.com/en/sphincs-stateless-hash-based-digital-signature/";
const yt = (id: string) => `https://www.youtube.com/watch?v=${id}`;

export const TALKS = [
  { title: "Post-Quantum Transition", who: "Justin Drake and Kev, keynote", href: yt("rqJ5ir-8hAQ") },
  { title: "PQ Ethereum Q&A", who: "Justin Drake", href: yt("BA1Vpoq1Y6o") },
  { title: "leanSPHINCS: Signing for the Long Run", who: "Nico, Ethereum Foundation", href: yt("Bu_u9FUqFaA") },
  { title: "leanSPHINCS for Developers", who: "Matteo Vicari and Alessandro Baiocchi, Riva Labs", href: yt("-DZ-jEntxV8") },
];

const link = "text-accent-hi underline decoration-accent-hi/40 underline-offset-2 transition-colors hover:decoration-accent-hi";

export function WhyLean() {
  return (
    <div className="mt-5 space-y-3 text-[15px] leading-relaxed text-muted sm:text-base" data-testid="why-lean">
      <p>
        Every ETC and Ethereum account is guarded by ECDSA today, and a large quantum computer could work out an
        ECDSA private key from its public key. leanSPHINCS is built from hash functions alone, which that attack
        doesn't break. It's{" "}
        <a href={TELSY} target="_blank" rel="noopener noreferrer" className={link}>
          SPHINCS+
        </a>
        , the scheme NIST standardized as SLH-DSA, cut down to fit Ethereum. Fewer
        signatures per key buy a smaller signature that's cheaper to check, and Ethereum's post-quantum roadmap has
        it in line to replace ECDSA for accounts.
      </p>
      <div>
        <p className="text-sm text-subtle">Talks from Devcon 8 in Mumbai</p>
        <ul className="mt-1.5 space-y-1 text-[14px]">
          {TALKS.map((t) => (
            <li key={t.href}>
              <a href={t.href} target="_blank" rel="noopener noreferrer" className={link}>
                {t.title}
              </a>{" "}
              <span className="text-subtle">{t.who}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
