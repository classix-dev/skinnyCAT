import { LEDGER_SYMBOL } from "../generated/contracts";
import { CornerDownRight } from "lucide-react";
import type { CSSProperties } from "react";
import { cx } from "./ui";

// The sequence diagram from README.md, as HTML. Each message is a list item with a plain sentence for
// screen readers. Wide screens draw lifelines and arrows, narrow ones a numbered list.

const PARTIES = [
  { name: "Alice", note: "holds a key" },
  { name: "Alice's browser wallet", note: "pays gas" },
  { name: `${LEDGER_SYMBOL}`, note: "the contract" },
  { name: "Verifier", note: "leanSPHINCS" },
  { name: "Bob", note: "no ETC" },
  { name: "Relayer", note: "any account" },
  { name: "Bob's fresh address", note: "never held ETC" },
] as const;
const [ALICE, AW, L, V, BOB, R, FRESH] = [0, 1, 2, 3, 4, 5, 6];

type Style = "call" | "reply" | "pay" | "offchain";
type Msg = { from: number; to: number; text: string; style?: Style };

const PHASES: { title: string; msgs: Msg[] }[] = [
  {
    title: "Alice Pays Bob in One Transaction",
    msgs: [
      { from: ALICE, to: ALICE, text: "signs “0.4 to Bob” with her leanSPHINCS key" },
      { from: AW, to: L, text: "transfer, with 1 ETC attached" },
      { from: L, to: L, text: `credits 1 ${LEDGER_SYMBOL} to Alice` },
      { from: L, to: V, text: "verify Alice's signature" },
      { from: V, to: L, text: "valid", style: "reply" },
      { from: L, to: L, text: `moves 0.4 ${LEDGER_SYMBOL} to Bob, emits the memo` },
    ],
  },
  {
    title: "Bob Pays Alice Back Through a Relayer",
    msgs: [
      { from: BOB, to: BOB, text: "signs “0.1 to Alice, fee 0.001”" },
      { from: BOB, to: R, text: "the signed message, off chain", style: "offchain" },
      { from: R, to: L, text: "transfer" },
      { from: L, to: V, text: "verify Bob's signature" },
      { from: V, to: L, text: "valid", style: "reply" },
      { from: L, to: R, text: "pays the 0.001 ETC fee", style: "pay" },
    ],
  },
  {
    title: "Bob Withdraws to a Fresh Address",
    msgs: [
      { from: BOB, to: R, text: "signed withdraw of 0.2 to his fresh address", style: "offchain" },
      { from: R, to: L, text: "withdraw" },
      { from: L, to: V, text: "verify" },
      { from: L, to: FRESH, text: "sends 0.2 ETC", style: "pay" },
    ],
  },
];

const COLS = PARTIES.length;
const grid: CSSProperties = { gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))` };

function sentence(m: Msg) {
  const from = PARTIES[m.from].name;
  if (m.from === m.to) return `${from} ${m.text}.`;
  return `${from} to ${PARTIES[m.to].name}: ${m.text}.`;
}

const lineClass: Record<Style, string> = {
  call: "border-accent-hi border-solid",
  reply: "border-subtle border-dashed",
  pay: "border-cyan border-solid",
  offchain: "border-muted border-dotted",
};
const headClass: Record<Style, string> = {
  call: "text-accent-hi",
  reply: "text-subtle",
  pay: "text-cyan",
  offchain: "text-muted",
};

function Arrow({ m, n }: { m: Msg; n: number }) {
  const style = m.style ?? "call";
  if (m.from === m.to) {
    // A note starting at the lifeline, up to three columns wide.
    const span = Math.min(3, COLS - m.from);
    const inset = `calc(100% / ${2 * span})`;
    return (
      <div className="py-2" style={{ gridColumn: `${m.from + 1} / span ${span}` }}>
        <div
          className="relative z-10 inline-flex items-center gap-1.5 rounded-md bg-ink-850 px-2 py-1 text-xs leading-tight text-fg ring-1 ring-ink-600"
          style={{ marginLeft: `calc(${inset} - 10px)`, maxWidth: `calc(100% - ${inset} + 10px)` }}
        >
          <Num n={n} />
          <CornerDownRight className="size-3 shrink-0 text-subtle" aria-hidden />
          <span>{m.text}</span>
        </div>
      </div>
    );
  }
  const lo = Math.min(m.from, m.to);
  const span = Math.abs(m.to - m.from) + 1;
  const inset = `calc(100% / ${2 * span})`;
  const right = m.to > m.from;
  return (
    <div className="pt-2 pb-1" style={{ gridColumn: `${lo + 1} / span ${span}` }}>
      {/* The label may use the full width of the spanned columns, the arrow runs lifeline to lifeline. */}
      <div className="flex items-end justify-center gap-1.5 px-1 text-center text-xs leading-tight text-fg">
        <Num n={n} />
        <span className={cx("rounded bg-ink-900/80 px-0.5", style === "reply" && "text-muted")}>{m.text}</span>
      </div>
      <div className="relative mt-1 h-2">
        <div className={cx("absolute top-1/2 border-t-[1.5px]", lineClass[style])} style={{ left: inset, right: inset }} />
        <svg
          viewBox="0 0 8 8"
          className={cx("absolute top-1/2 size-2 -translate-y-1/2", headClass[style], right ? "-translate-x-full" : "translate-x-0")}
          style={right ? { left: `calc(100% - ${inset})` } : { left: inset }}
          aria-hidden
        >
          <path d={right ? "M0 0 8 4 0 8z" : "M8 0 0 4 8 8z"} fill="currentColor" />
        </svg>
      </div>
    </div>
  );
}

function Num({ n }: { n: number }) {
  return (
    <span className="mono inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-ink-700 text-[9px] text-muted">{n}</span>
  );
}

export function HowItWorks() {
  let n = 0;
  return (
    <section id="how-it-works" aria-labelledby="how-title" className="scroll-mt-20" data-testid="how">
      <h2 id="how-title" className="text-2xl font-semibold tracking-[-0.03em] text-fg sm:text-3xl">
        How It Works
      </h2>
      <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-muted">
        Alice pays Bob, Bob pays back without owning any ETC, then Bob takes ETC out to a fresh address. On this page one
        browser wallet plays both Alice's wallet and the relayer. We kept the cats out of the diagram so it stays exact.
      </p>
      <figure className="mt-6 overflow-hidden rounded-2xl bg-ink-900/70 ring-1 ring-white/[0.07] ring-inset" aria-labelledby="how-caption">
        <figcaption id="how-caption" className="sr-only">
          Sequence diagram of the {LEDGER_SYMBOL} demo, in sixteen numbered messages between Alice, her browser wallet, {LEDGER_SYMBOL}, the
          verifier, Bob, a relayer and Bob's fresh address.
        </figcaption>
        {/* Participant heads, wide screens only. */}
        <div className="hidden border-b border-white/[0.06] px-2 py-3 md:grid" style={grid} aria-hidden>
          {PARTIES.map((p) => (
            <div key={p.name} className="px-1 text-center">
              <div className="text-[13px] leading-tight font-medium text-fg">{p.name}</div>
              <div className="mt-0.5 text-[11px] text-subtle">{p.note}</div>
            </div>
          ))}
        </div>
        {PHASES.map((ph) => {
          const start = n + 1;
          return (
            <section key={ph.title} className="relative px-4 py-4 md:px-2" aria-label={ph.title}>
              <h3 className="mb-2 text-xs font-medium tracking-wide text-accent-hi uppercase md:px-2">{ph.title}</h3>
              <div className="pointer-events-none absolute inset-x-2 top-0 bottom-0 hidden md:grid" style={grid} aria-hidden>
                {PARTIES.map((p) => (
                  <div key={p.name} className="mx-auto w-px bg-ink-600/70" />
                ))}
              </div>
              <ol start={start} className="relative space-y-2 md:space-y-0">
                {ph.msgs.map((m) => {
                  n++;
                  return (
                    <li key={n} className="relative">
                      <span className="sr-only">{sentence(m)}</span>
                      {/* Narrow screens: a numbered line. */}
                      <div className="flex gap-2.5 md:hidden" aria-hidden>
                        <Num n={n} />
                        <div className="min-w-0 text-[13px] leading-snug">
                          <div className="text-xs text-subtle">
                            {m.from === m.to ? PARTIES[m.from].name : `${PARTIES[m.from].name} → ${PARTIES[m.to].name}`}
                          </div>
                          <div className={cx("text-fg", m.style === "reply" && "text-muted")}>{m.text}</div>
                        </div>
                      </div>
                      {/* Wide screens: an arrow between lifelines. */}
                      <div className="hidden md:grid" style={grid} aria-hidden>
                        <Arrow m={m} n={n} />
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          );
        })}
        <div className="flex flex-wrap gap-x-5 gap-y-1 border-t border-white/[0.06] px-4 py-3 text-[11px] text-subtle" aria-hidden>
          <Legend style="call" label="call on chain" />
          <Legend style="reply" label="return value" />
          <Legend style="pay" label="ETC paid out" />
          <Legend style="offchain" label="off chain" />
        </div>
      </figure>
      <p className="mt-4 max-w-2xl text-[13px] leading-relaxed text-muted">
        Every signed message covers the chain ID, the contract, the sender's nonce, the recipient, the amount, the fee, a
        deadline and the memo. A relayer can't change any of it, a signature can't be replayed, and a signature from
        another chain fails.
      </p>
    </section>
  );
}

function Legend({ style, label }: { style: Style; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cx("w-5 border-t-[1.5px]", lineClass[style])} />
      {label}
    </span>
  );
}
