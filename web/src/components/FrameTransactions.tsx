import { LEDGER_SYMBOL } from "../generated/contracts";
import { A, LINKS } from "./ext";
import { FrameExplainer } from "./FrameExplainer";

// Copy from docs/frame-transactions.md, cut down. The explainer and a table over paragraphs.

const ROWS: [string, string, string][] = [
  ["Bob signs with", "leanSPHINCS", "leanSPHINCS"],
  ["signature checked by", `the ${LEDGER_SYMBOL} contract`, "Bob's account, a contract"],
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
      <div className="mt-2 max-w-2xl space-y-3 text-[15px] leading-relaxed text-muted" data-testid="frames-intro">
        <p>
          A meta-transaction is a signed message that someone else submits. Bob signs a {LEDGER_SYMBOL} transfer with his
          leanSPHINCS key, and a relayer wraps it in an ordinary transaction and pays the gas.
        </p>
        <p>
          We use one because on ETC only an ECDSA account can send a transaction and pay for it. So it needs a relayer, an
          ECDSA key in the path, and a wrapped token.
        </p>
        <p>
          A frame transaction, <A href={LINKS.eip8141}>EIP-8141</A>, drops all three. Bob's own account checks his
          leanSPHINCS signature and pays its own gas, in plain ETC.
        </p>
      </div>

      <FrameExplainer />
      <p className="mt-3 max-w-2xl text-[13px] leading-relaxed text-muted">
        The <A href={LINKS.workshop}>Devcon workshop</A> sends this kind of transaction on the Daisugi testnet.
      </p>

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
