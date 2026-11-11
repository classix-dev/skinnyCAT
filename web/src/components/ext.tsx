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
  ethlibCommit: "https://github.com/ethereum/EthLib/commit/dce7a2de23a973d84eac38126a1527763cd3465d",
  ethlib: "https://github.com/ethereum/EthLib",
  sphincsArt: "https://sphincs.art",
  sphincsMinus: "https://github.com/nconsigny/SPHINCS-",
  rivaLabs: "https://github.com/RivaLabs-Core/Post-Quantum-AA-Infra",
  leanSphincs: "https://github.com/leanEthereum/leanSphincs",
};
