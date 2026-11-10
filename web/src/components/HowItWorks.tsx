import { ChevronDown } from "lucide-react";

const ITEMS: [string, string][] = [
  ["Hash-Based Keys", "leanSPHINCS signs with Keccak-256 hash trees. There is no elliptic curve for a quantum computer to attack."],
  ["Your Own Contract", "The wallet is a contract at an address fixed by your public key. It moves funds only on a leanSPHINCS signature, checked on chain for about 82,000 gas."],
  ["The Gas Wallet", "ETC has no account abstraction, so an ordinary wallet submits the call and pays gas. Its key can't touch your funds."],
  ["No Replays", "Each signature covers the chain, wallet, nonce, recipient, amount and a one-hour deadline."],
  ["Checked Before Sending", "The page verifies each signature in JavaScript and against the deployed verifier, then simulates the transaction."],
];

export function HowItWorks() {
  return (
    <details className="group rounded-2xl ring-1 ring-inset ring-white/[0.07] open:bg-ink-900/60" data-testid="how">
      <summary className="flex cursor-pointer items-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium text-fg select-none hover:bg-white/[0.02] sm:px-5">
        How It Works
        <ChevronDown className="ml-auto size-4 text-subtle transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <ol className="space-y-3.5 px-4 pt-1 pb-5 sm:px-5">
        {ITEMS.map(([t, d], i) => (
          <li key={t} className="flex gap-3">
            <span className="mono pt-0.5 text-xs text-accent-hi" aria-hidden>
              0{i + 1}
            </span>
            <div>
              <h3 className="text-[13px] font-medium text-fg">{t}</h3>
              <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{d}</p>
            </div>
          </li>
        ))}
      </ol>
    </details>
  );
}
