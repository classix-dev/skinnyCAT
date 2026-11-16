// The record of the first payment on mainnet, under the hero. Fixed facts from docs/deployments.md.
import { ExternalLink } from "lucide-react";
import { CatInBox } from "./Cats";

const tx = (h: string) => `https://etc.blockscout.com/tx/${h}`;

export const FIRST = {
  block: "25,742,237",
  date: "2026-11-16",
  time: "00:52 UTC",
  memo: "The first payment using a quantum-safe signature on Ethereum Classic, by Classix.dev",
  links: [
    ["Alice pays Bob", tx("0x120ca292224e17de96101e2ff3f34966a9e601001cc2519a73219bbbf055c4ad")],
    ["Bob pays her back", tx("0x22cbcb0c898ac5a344fe1745bfe194f4e5b83947373318f09e22c88c0c20fa5e")],
    ["Bob withdraws ETC", tx("0xdf35e65fb5774a9e7eaaafa07e47dcb21ee45b98a2fb14c64b334b1446e69c08")],
  ] as const,
};

export function FirstPayment() {
  return (
    <section
      aria-labelledby="first-title"
      data-testid="first-payment"
      className="rounded-2xl bg-accent/[0.05] p-4 ring-1 ring-accent/20 ring-inset sm:p-6"
    >
      <div className="flex items-start gap-4">
        <CatInBox className="hidden h-12 w-14 shrink-0 text-accent-hi sm:block" />
        <div className="min-w-0">
          <h2 id="first-title" className="text-lg font-semibold text-fg">
            The First Payment
          </h2>
          <p className="mt-1.5 max-w-3xl text-[15px] leading-relaxed text-muted">
            On {FIRST.date} at {FIRST.time}, in block {FIRST.block}, Alice paid Bob with a leanSPHINCS signature and the
            scETC contract checked it on chain. As far as we can find, it's the first payment on Ethereum Classic made with
            a quantum-safe signature. A quantum computer that breaks ECDSA still can't forge it or move those funds.
          </p>
          <blockquote className="mt-3 border-l-2 border-accent/50 pl-3 text-[14px] text-fg" data-testid="first-memo">
            {FIRST.memo}
          </blockquote>
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[13px]">
            {FIRST.links.map(([label, href]) => (
              <li key={href}>
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-accent-hi underline decoration-accent-hi/40 underline-offset-2 hover:decoration-accent-hi"
                >
                  {label}
                  <ExternalLink className="size-3" aria-hidden />
                  <span className="sr-only">(opens Blockscout in a new tab)</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
