// Key degradation. Each leanSPHINCS signature opens one leaf in each of a FORS instance's 24 trees,
// and the digest picks the instance at random, so instances get reused and weaken. A slider sets
// how many signatures one key has made, and the picture shows one tree of an average instance and
// the chance that one forgery attempt works.
import { useId, useMemo, useState } from "react";
import { A } from "./ext";
import { cx } from "./ui";

const ETHLIB_SPEC = "https://github.com/ethereum/EthLib/blob/dce7a2de23a973d84eac38126a1527763cd3465d/EthLib/Cryptography/Sphincs/README.md";

const LEAVES = 1024; // leaves per FORS tree
const TREES = 24; // trees per FORS instance
const INSTANCES_LOG2 = 26; // 2^26 FORS instances, picked by the digest
const HASH_BITS = 128; // a 16-byte hash caps classical security here
const BUDGET_LOG2 = 30;
const MIN_LOG2 = 16;
const MAX_LOG2 = 40;

const logFact = (() => {
  const t = [0];
  return (r: number) => {
    for (let i = t.length; i <= r; i++) t[i] = t[i - 1] + Math.log(i);
    return t[r];
  };
})();

/**
 * Bits against one forgery attempt after 2^e signatures. The number of uses of the instance a
 * forger lands on is Poisson with mean 2^e / 2^26, a tree with r uses has 1 - (1 - 1/1024)^r of its
 * leaves open, and a forgery needs an open leaf in all 24 trees. A simple model, not the proof.
 */
export function wearBits(e: number): number {
  const lam = 2 ** (e - INSTANCES_LOG2);
  const sd = Math.sqrt(lam);
  let p = 0;
  for (let r = Math.max(1, Math.floor(lam - 12 * sd - 20)); r <= Math.ceil(lam + 40 * sd + 200); r++) {
    const open = 1 - (1 - 1 / LEAVES) ** r;
    p += Math.exp(-lam + r * Math.log(lam) - logFact(r) + TREES * Math.log(open));
  }
  return Math.min(HASH_BITS, -Math.log2(p));
}

/** A fixed shuffle of the leaves, so the same leaves stay open as the count grows. */
const ORDER = (() => {
  const a = Array.from({ length: LEAVES }, (_, i) => i);
  let s = 0x2545f491;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) >>> 0;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
})();

const COLS = 64;
const ROWS = LEAVES / COLS;

function squares(ids: number[]) {
  return ids.map((i) => `M${(i % COLS) * 3} ${Math.floor(i / COLS) * 3}h2v2h-2z`).join("");
}

const fmtCount = (e: number) => {
  const n = 2 ** e;
  if (n >= 1e12) return `${(n / 1e12).toFixed(1)} trillion`;
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} billion`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} million`;
  return n.toLocaleString("en-US");
};

const fmtUses = (lam: number) => (lam < 1 ? lam.toFixed(lam < 0.01 ? 4 : 2) : Math.round(lam).toLocaleString("en-US"));

export function KeyDegradation() {
  const [e, setE] = useState(BUDGET_LOG2);
  const inputId = useId();
  const lam = 2 ** (e - INSTANCES_LOG2);
  const open = Math.round(LEAVES * (1 - (1 - 1 / LEAVES) ** lam));
  const bits = wearBits(e);
  const tone = e <= BUDGET_LOG2 ? "ok" : bits >= 64 ? "warn" : "bad";
  const paths = useMemo(() => ({ open: squares(ORDER.slice(0, open)), shut: squares(ORDER.slice(open)) }), [open]);

  return (
    <section id="key-degradation" aria-labelledby="wear-title" className="scroll-mt-20" data-testid="wear">
      <h2 id="wear-title" className="text-2xl font-semibold tracking-[-0.03em] text-fg sm:text-3xl">
        Key Degradation
      </h2>
      <div className="mt-2 max-w-2xl space-y-3 text-[15px] leading-relaxed text-muted">
        <p>
          A leanSPHINCS key wears out. Each signature opens one secret leaf in each of the 24 trees of a FORS, a Forest of Random Subsets. The key keeps no
          state, so the message picks which of its 67 million FORS instances signs, and over time instances get picked
          again and open more leaves. Once enough are open, a forger can sign.
        </p>
        <p>
          The lean part is the budget. leanSPHINCS is sized for 2<sup>30</sup> signatures per key, where standard SLH-DSA
          is sized for 2<sup>64</sup>. The smaller budget is what lets it be both small and cheap to check. So
          don't use one key millions of times. Make a new key and move the funds.
        </p>
      </div>
      <blockquote className="mt-4 max-w-2xl border-l-2 border-cyan/50 pl-3 text-[14px] leading-relaxed text-fg">
        Never sign more than <span className="mono">2^30</span> messages with one key.
        <footer className="mt-1 text-xs text-subtle not-italic">
          <A href={ETHLIB_SPEC}>EthLib's leanSPHINCS spec</A>, whose proof gives 127 bits up to 1,182,000,000 signatures
        </footer>
      </blockquote>

      <figure className="mt-6 rounded-2xl bg-ink-900/70 p-4 ring-1 ring-white/[0.07] ring-inset sm:p-6" aria-labelledby={`${inputId}-cap`}>
        <figcaption id={`${inputId}-cap`} className="sr-only">
          One FORS tree of 1,024 leaves after a chosen number of signatures, with the leaves an average instance has
          opened, and the security left against one forgery attempt.
        </figcaption>
        <label htmlFor={inputId} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm">
          <span className="text-muted">Signatures made with one key</span>
          <span className="mono text-fg" data-testid="wear-count">
            2<sup>{e}</sup>, about {fmtCount(e)}
          </span>
        </label>
        <div className="relative mt-3">
          <input
            id={inputId}
            type="range"
            min={MIN_LOG2}
            max={MAX_LOG2}
            step={1}
            value={e}
            onChange={(ev) => setE(Number(ev.target.value))}
            aria-valuetext={`2 to the ${e} signatures, about ${fmtCount(e)}`}
            data-testid="wear-slider"
            className="w-full cursor-pointer accent-[var(--color-accent)]"
          />
          <div className="mono relative mt-1 flex h-4 justify-between text-[11px] text-subtle" aria-hidden>
            <span>2^{MIN_LOG2}</span>
            <span
              className="absolute -translate-x-1/2 whitespace-nowrap text-cyan"
              style={{ left: `${((BUDGET_LOG2 - MIN_LOG2) / (MAX_LOG2 - MIN_LOG2)) * 100}%` }}
            >
              budget 2^{BUDGET_LOG2}
            </span>
            <span>2^{MAX_LOG2}</span>
          </div>
        </div>

        <div className="mt-5 grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,16rem)] md:items-center">
          <div>
            <svg viewBox={`0 0 ${COLS * 3 - 1} ${ROWS * 3 - 1}`} className="w-full" aria-hidden="true" focusable="false">
              <path d={paths.shut} className="fill-ink-700" />
              <path d={paths.open} className={cx(tone === "ok" ? "fill-cyan" : tone === "warn" ? "fill-warn" : "fill-bad")} />
            </svg>
            <p className="mt-2 text-xs text-subtle">
              One tree of an average FORS instance. <span className="text-fg" data-testid="wear-open">{open.toLocaleString("en-US")}</span>{" "}
              of 1,024 leaves open after {fmtUses(lam)} uses.
            </p>
          </div>
          <div>
            <div className="text-xs text-muted">Security against one forgery attempt</div>
            <div
              className={cx("mono mt-1 text-3xl leading-none", tone === "ok" ? "text-cyan" : tone === "warn" ? "text-warn" : "text-bad")}
              data-testid="wear-bits"
              data-tone={tone}
            >
              {bits >= HASH_BITS ? "128" : bits < 1 ? "0" : bits.toFixed(0)} bits
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-ink-800" aria-hidden>
              <div
                className={cx("h-full rounded-full transition-[width] duration-300", tone === "ok" ? "bg-cyan" : tone === "warn" ? "bg-warn" : "bg-bad")}
                style={{ width: `${(Math.max(0, bits) / HASH_BITS) * 100}%` }}
              />
            </div>
            <p className="mt-2 text-xs leading-snug text-subtle">
              {e <= BUDGET_LOG2
                ? "Within the budget. The 16-byte hash caps it at 128 bits."
                : bits >= 64
                  ? "Past the budget. Every doubling costs about 20 bits."
                  : "Forgery is within reach."}
            </p>
          </div>
        </div>
      </figure>
    </section>
  );
}
