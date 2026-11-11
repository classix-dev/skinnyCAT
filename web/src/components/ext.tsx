import type { ReactNode } from "react";

/** An external link in body text. */
export function A({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-accent-hi underline decoration-accent-hi/40 underline-offset-2 transition-colors hover:decoration-accent-hi"
    >
      {children}
    </a>
  );
}

export const LINKS = {
  eip8141: "https://eips.ethereum.org/EIPS/eip-8141",
  eip8288: "https://eips.ethereum.org/EIPS/eip-8288",
  ecip1120: "https://github.com/orgs/ethereumclassic/discussions/541",
  workshop: "https://github.com/alessandrobaiocchi/Devcon_Workshop",
  playground: "https://sphincs-playground.vercel.app",
  repo: "https://github.com/classix-dev/skinnyCAT",
  ethlibCommit: "https://github.com/ethereum/EthLib/commit/dce7a2de23a973d84eac38126a1527763cd3465d",
  ethlib: "https://github.com/ethereum/EthLib",
  sphincsArt: "https://sphincs.art",
  sphincsMinus: "https://github.com/nconsigny/SPHINCS-",
  rivaLabs: "https://github.com/RivaLabs-Core/Post-Quantum-AA-Infra",
  leanSphincs: "https://github.com/leanEthereum/leanSphincs",
};

/** The GitHub mark (Octicons mark-github, MIT). */
export function GitHubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}
