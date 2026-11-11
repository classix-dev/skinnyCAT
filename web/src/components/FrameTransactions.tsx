import { LEDGER_SYMBOL } from "../generated/contracts";
import type { ReactNode } from "react";
import { A, LINKS } from "./ext";
import { cx } from "./ui";

// Copy from docs/frame-transactions.md, cut down. Diagrams and a table over paragraphs.

function Box({ title, sub, tone = "neutral", dashed, children }: { title: string; sub?: string; tone?: "neutral" | "accent" | "cyan" | "warn"; dashed?: boolean; children?: ReactNode }) {
  return (
    <div
      className={cx(
        "rounded-lg px-3 py-2",
        dashed ? "border border-dashed border-ink-500" : "ring-1 ring-inset",
        !dashed && tone === "neutral" && "bg-ink-850 ring-ink-600",
        tone === "accent" && "bg-accent/[0.07] ring-accent/35",
        tone === "cyan" && "bg-cyan/[0.05] ring-cyan/30",
        tone === "warn" && "bg-warn/[0.06] ring-warn/30",
      )}
    >
      <div className="text-[13px] font-medium text-fg">{title}</div>
      {sub && <div className="mt-0.5 text-xs leading-relaxed text-muted">{sub}</div>}
      {children && <div className="mt-2 space-y-2">{children}</div>}
    </div>
  );
}

const ROWS: [string, string, string][] = [
  ["fork needed", "no", "yes, an ECIP"],
  ["who submits", "a relayer", "anyone, or Bob"],
  ["ECDSA in the path", "the relayer's key, gas money only", "none"],
  ["what Bob holds", `${LEDGER_SYMBOL}, wrapped ETC`, "ETC in his own account"],
  ["gas paid by", "the relayer, repaid from Bob's fee", "Bob's account, or a paymaster"],
  ["signature on chain", "7,740 bytes in calldata", "7,740 bytes, or an aggregate proof with EIP-8288"],
];

export function FrameTransactions() {
  return (
    <section id="frame-transactions" aria-labelledby="frames-title" className="scroll-mt-20" data-testid="frames">
      <h2 id="frames-title" className="text-2xl font-semibold tracking-[-0.03em] text-fg sm:text-3xl">
        Frame Transactions Instead of Meta-Transactions
      </h2>
      <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-muted">
        On ETC only an ECDSA account can pay gas, so {LEDGER_SYMBOL} uses a relayer. Ethereum's draft fix is the frame
        transaction, <A href={LINKS.eip8141}>EIP-8141</A>.
      </p>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <figure className="rounded-2xl bg-ink-900/70 p-4 ring-1 ring-white/[0.07] ring-inset sm:p-5" aria-labelledby="frames-today">
          <figcaption id="frames-today" className="text-sm font-semibold text-fg">
            Today on ETC, a Meta-Transaction
          </figcaption>
          <div className="mt-4">
            <Box title="Legacy transaction" sub="signed by the relayer's ECDSA key, which pays the gas" tone="warn">
              <Box title={`Call to ${LEDGER_SYMBOL}`} sub="transfer or withdraw">
                <Box title="Bob's signed message" sub="recipient, amount, fee, nonce, deadline, chain, memo" tone="accent">
                  <Box title="leanSPHINCS signature" sub="7,740 bytes, checked by the verifier contract" tone="cyan" />
                </Box>
              </Box>
            </Box>
          </div>
        </figure>

        <figure className="rounded-2xl bg-ink-900/70 p-4 ring-1 ring-white/[0.07] ring-inset sm:p-5" aria-labelledby="frames-8141">
          <figcaption id="frames-8141" className="text-sm font-semibold text-fg">
            With EIP-8141, Transaction Type <span className="mono">0x06</span>
          </figcaption>
          <div className="mt-4">
            <Box title="Frame transaction from Bob's account" sub="no ECDSA signature anywhere" tone="accent">
              <Box title="VERIFY frame" sub="Bob's account checks his leanSPHINCS signature over the whole transaction, then runs APPROVE for execution and payment" tone="cyan" />
              <Box title="SENDER frame" sub="runs as Bob's account and sends ETC to Alice" />
              <Box title="Paymaster VERIFY frame, optional" sub="approves payment only, when Bob has no ETC for gas" dashed />
            </Box>
          </div>
          <p className="mt-4 text-[13px] leading-relaxed text-muted">
            The <A href={LINKS.workshop}>Devcon workshop</A> sends one on the Daisugi testnet.
          </p>
        </figure>
      </div>

      <div className="mt-4 overflow-x-auto rounded-2xl ring-1 ring-white/[0.07] ring-inset">
        <table className="w-full min-w-[34rem] text-left text-[13px]" data-testid="frames-table">
          <caption className="sr-only">{LEDGER_SYMBOL} today compared with frame transactions</caption>
          <thead>
            <tr className="border-b border-white/[0.07] text-xs text-muted">
              <th scope="col" className="px-4 py-2.5 font-medium">
                <span className="sr-only">Aspect</span>
              </th>
              <th scope="col" className="px-4 py-2.5 font-medium">{LEDGER_SYMBOL} today</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Frame transactions</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map(([k, a, b]) => (
              <tr key={k} className="border-b border-white/[0.05] last:border-0">
                <th scope="row" className="px-4 py-2.5 font-normal whitespace-nowrap text-subtle">
                  {k}
                </th>
                <td className="px-4 py-2.5 text-fg">{a}</td>
                <td className="px-4 py-2.5 text-fg">{b}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-4 max-w-2xl text-[13px] leading-relaxed text-muted">
        ETC would need an ECIP and a hard fork, plus a basefee market like <A href={LINKS.ecip1120}>ECIP-1120</A>, since
        EIP-8141's fee fields follow EIP-1559.
      </p>
    </section>
  );
}
