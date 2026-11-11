import { SitCat } from "./Cats";
import { ByClassix } from "./ClassixWordmark";
import { LINKS } from "./ext";

const CREDITS: [string, string, string?][] = [
  [LINKS.sphincsArt, "sphincs.art", "by Tom Wambsgans"],
  [LINKS.ethlibCommit, "EthLib leanSPHINCS spec"],
  [LINKS.sphincsMinus, "SPHINCS-", "by Nicolas Consigny"],
  [LINKS.workshop, "Devcon_Workshop", "by Alessandro Baiocchi"],
  [LINKS.playground, "SPHINCS Playground", "by Project Eleven"],
  [LINKS.rivaLabs, "Post-Quantum-AA-Infra", "by RivaLabs"],
  [LINKS.leanSphincs, "leanSphincs", "competition"],
];

export function Footer() {
  return (
    <footer className="mt-24 border-t border-white/[0.06]">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 text-xs sm:px-6 md:flex-row md:items-start md:justify-between">
        <div className="max-w-2xl">
          <h2 className="mb-2 text-xs font-medium text-fg">Credits</h2>
          <ul className="credits flex flex-wrap gap-x-4 gap-y-1.5 text-subtle" data-testid="credits">
            {CREDITS.map(([href, name, by]) => (
              <li key={href}>
                <a href={href} target="_blank" rel="noopener noreferrer">
                  {name}
                </a>
                {by && ` ${by}`}
              </li>
            ))}
          </ul>
        </div>
        <div className="flex flex-col gap-3 md:items-end">
          <ByClassix className="text-xs" />
          <p className="flex items-end gap-2 text-subtle" data-testid="no-cats-harmed">
            <svg viewBox="-9 -24 18 25" className="h-5 w-4 shrink-0" aria-hidden="true" focusable="false">
              <SitCat />
            </svg>
            No cats were harmed, and none were put in superposition.
          </p>
        </div>
      </div>
    </footer>
  );
}
