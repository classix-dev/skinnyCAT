// The frame transaction explainer. Bob sends Alice 0.1 ETC in one EIP-8141 transaction, step by
// step: the transaction and what it signs, the VERIFY frame that checks his leanSPHINCS signature,
// APPROVE, and the SENDER frame. A toggle swaps in a paymaster for a Bob with no ETC for gas.
// Follows the draft as of 2026-11-11. leanSPHINCS isn't a protocol scheme there, so the signature
// rides as an ARBITRARY entry and Bob's account checks it itself.
import { useRef, useState } from "react";
import { A, LINKS } from "./ext";
import { usePlayer, type Timing } from "./howPlayer";
import { PlayerControls } from "./PlayerControls";
import { cx } from "./ui";

type Mode = "self" | "paymaster";
type Part = "tx" | "hash" | "f1" | "f2" | "f3" | "sig" | "fees" | "bob" | "pm" | "alice";

type Step = {
  caption: string;
  /** Parts lit at this step. */
  on: Part[];
  /** Who pays gas once this step is done. */
  payer?: "bob" | "pm";
  /** Alice has the 0.1 ETC once this step is done. */
  paid?: boolean;
};

const STEPS: Record<Mode, Step[]> = {
  self: [
    { caption: "Bob's wallet builds a type 0x06 transaction from his account, with two frames and his leanSPHINCS signature.", on: ["tx", "f1", "f2", "sig", "fees"] },
    { caption: "He signs the signature hash, keccak256(0x06 ‖ rlp(tx)) with the signature's bytes left out. It covers every frame and the fees.", on: ["hash", "f1", "f2", "fees"] },
    { caption: "Frame 1, VERIFY. The protocol calls Bob's account, read-only. It reads the hash and the 7,740 bytes and checks the signature.", on: ["f1", "sig", "bob"] },
    { caption: "Valid, so the account runs APPROVE for execution and payment. Bob's nonce goes up and he pays the gas.", on: ["f1", "bob"], payer: "bob" },
    { caption: "Frame 2, SENDER. It runs as Bob's account and sends 0.1 ETC to Alice.", on: ["f2", "bob", "alice"], payer: "bob", paid: true },
    { caption: "Done. No relayer, no wrapped token, and no ECDSA key anywhere.", on: [], payer: "bob", paid: true },
  ],
  paymaster: [
    { caption: "Bob has no ETC for gas. His transaction gets a third frame, for a paymaster.", on: ["tx", "f1", "f2", "f3", "sig", "fees"] },
    { caption: "He signs the signature hash, keccak256(0x06 ‖ rlp(tx)) with the signature's bytes left out. It covers every frame and the fees.", on: ["hash", "f1", "f2", "f3", "fees"] },
    { caption: "Frame 1, VERIFY Bob. His account checks the signature and runs APPROVE for execution only.", on: ["f1", "sig", "bob"] },
    { caption: "Frame 2, VERIFY paymaster. Its code decides whether to sponsor Bob, and runs APPROVE for payment.", on: ["f2", "pm"], payer: "pm" },
    { caption: "Frame 3, SENDER. It runs as Bob's account and sends 0.1 ETC to Alice.", on: ["f3", "bob", "alice"], payer: "pm", paid: true },
    { caption: "Done. The paymaster paid the gas, and no ECDSA key was involved.", on: [], payer: "pm", paid: true },
  ],
};

const LAST = 6;
const TIMING: Timing = { last: LAST, runMs: () => 900, dwellMs: 2600 };

type FrameRow = { part: Part; mode: "VERIFY" | "SENDER"; target: string; scope: string };
const FRAMES: Record<Mode, FrameRow[]> = {
  self: [
    { part: "f1", mode: "VERIFY", target: "Bob's account", scope: "approves execution and payment" },
    { part: "f2", mode: "SENDER", target: "Alice", scope: "0.1 ETC, as Bob" },
  ],
  paymaster: [
    { part: "f1", mode: "VERIFY", target: "Bob's account", scope: "approves execution" },
    { part: "f2", mode: "VERIFY", target: "paymaster", scope: "approves payment" },
    { part: "f3", mode: "SENDER", target: "Alice", scope: "0.1 ETC, as Bob" },
  ],
};

function Row({ lit, children, testId }: { lit: boolean; children: React.ReactNode; testId?: string }) {
  return (
    <div
      data-testid={testId}
      data-lit={lit ? "1" : undefined}
      className={cx(
        "rounded-lg px-3 py-2 ring-1 ring-inset transition-colors duration-300",
        lit ? "bg-cyan/[0.07] ring-cyan/40" : "bg-ink-850 ring-ink-700",
      )}
    >
      {children}
    </div>
  );
}

function Actor({ name, sub, lit, badge, testId }: { name: string; sub: string; lit: boolean; badge?: string; testId: string }) {
  return (
    <div
      data-testid={testId}
      data-lit={lit ? "1" : undefined}
      className={cx(
        "flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 ring-1 ring-inset transition-colors duration-300",
        lit ? "bg-accent/[0.08] ring-accent/45" : "bg-ink-900/70 ring-white/[0.07]",
      )}
    >
      <div className="min-w-0">
        <div className="text-[13px] font-medium text-fg">{name}</div>
        <div className="text-xs text-muted">{sub}</div>
      </div>
      {badge && <span className="mono shrink-0 rounded-full bg-cyan/12 px-2 py-0.5 text-[11px] text-cyan ring-1 ring-cyan/30 ring-inset">{badge}</span>}
    </div>
  );
}

export function FrameExplainer() {
  const figure = useRef<HTMLElement>(null);
  const [mode, setMode] = useState<Mode>("self");
  const { s, dispatch } = usePlayer(figure, TIMING);
  // Before it plays, and on the server, show the last step at rest.
  const n = s.step === 0 ? LAST : s.step;
  const step = STEPS[mode][n - 1];
  const lit = (p: Part) => step.on.includes(p);
  const payer = step.payer;

  const choose = (m: Mode) => {
    setMode(m);
    dispatch({ type: "replay" });
  };

  return (
    <figure ref={figure} className="mt-6 rounded-2xl bg-ink-900/70 p-4 ring-1 ring-white/[0.07] ring-inset sm:p-6" aria-labelledby="fx-caption" data-testid="fx">
      <div role="group" aria-label="Who pays the gas" className="inline-grid grid-cols-2 rounded-full bg-ink-950/70 p-1 ring-1 ring-white/[0.08] ring-inset">
        {(["self", "paymaster"] as const).map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={mode === m}
            data-testid={`fx-mode-${m}`}
            onClick={() => choose(m)}
            className={cx(
              "cursor-pointer rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors",
              mode === m ? "bg-accent text-ink-950" : "text-muted hover:text-fg",
            )}
          >
            {m === "self" ? "Bob pays his gas" : "A paymaster pays"}
          </button>
        ))}
      </div>

      <div className="mt-5 grid gap-5 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className={cx("rounded-xl p-3 ring-1 ring-inset transition-colors duration-300 sm:p-4", lit("tx") ? "bg-accent/[0.06] ring-accent/40" : "ring-white/[0.07]")} data-testid="fx-tx">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-sm font-semibold text-fg">
              Transaction type <span className="mono">0x06</span>
            </span>
            <span className="mono text-xs text-subtle">sender: Bob's account</span>
          </div>
          <div className="mt-3 space-y-1.5">
            <div className="text-[11px] font-medium tracking-wide text-subtle uppercase">frames</div>
            {FRAMES[mode].map((f, i) => (
              <Row key={f.part} lit={lit(f.part)} testId={`fx-${f.part}`}>
                <div className="flex flex-wrap items-baseline gap-x-2 text-[13px]">
                  <span className="mono text-subtle">{i + 1}</span>
                  <span className={cx("mono font-medium", f.mode === "VERIFY" ? "text-accent-hi" : "text-cyan")}>{f.mode}</span>
                  <span className="text-fg">{f.target}</span>
                  <span className="text-xs text-muted">{f.scope}</span>
                </div>
              </Row>
            ))}
            <div className="pt-2 text-[11px] font-medium tracking-wide text-subtle uppercase">signatures</div>
            <Row lit={lit("sig")} testId="fx-sig">
              <div className="flex flex-wrap items-baseline gap-x-2 text-[13px]">
                <span className="mono font-medium text-fg">ARBITRARY</span>
                <span className="text-muted">Bob's leanSPHINCS signature, 7,740 bytes</span>
              </div>
            </Row>
            <Row lit={lit("fees")}>
              <div className="flex flex-wrap items-baseline gap-x-2 text-[13px]">
                <span className="mono font-medium text-fg">nonce, fees</span>
                <span className="text-muted">max fee, priority fee</span>
              </div>
            </Row>
          </div>
          <div
            className={cx("mono mt-3 rounded-lg px-3 py-2 text-xs ring-1 ring-inset transition-colors duration-300", lit("hash") ? "bg-cyan/[0.07] text-cyan ring-cyan/40" : "text-subtle ring-ink-700")}
            data-testid="fx-hash"
          >
            signs keccak256(0x06 ‖ rlp(tx)), signature bytes left out
          </div>
        </div>

        <div className="space-y-2">
          <Actor
            testId="fx-bob"
            name="Bob's account"
            sub="code that checks leanSPHINCS"
            lit={lit("bob")}
            badge={payer === "bob" ? "pays gas" : undefined}
          />
          {mode === "paymaster" && (
            <Actor testId="fx-pm" name="Paymaster" sub="sponsors Bob's gas" lit={lit("pm")} badge={payer === "pm" ? "pays gas" : undefined} />
          )}
          <Actor testId="fx-alice" name="Alice" sub={step.paid ? "received 0.1 ETC" : "waiting"} lit={lit("alice")} />
        </div>
      </div>

      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:gap-4">
        <p id="fx-caption" aria-live="polite" data-testid="fx-caption" data-step={n} className="min-h-[3lh] min-w-0 flex-1 text-[13px] leading-snug text-fg sm:min-h-[2lh]">
          <span className="mono mr-2 text-xs text-subtle">
            {n}/{LAST}
          </span>
          {step.caption}
        </p>
        <PlayerControls s={s} dispatch={dispatch} last={LAST} prefix="fx" />
      </div>

      <p className="mt-4 border-t border-white/[0.06] pt-3 text-xs leading-relaxed text-muted">
        As drafted, leanSPHINCS isn't one of the protocol's signature schemes, so Bob's account checks it, and the 7,740
        bytes still cost about 124,000 gas. <A href={LINKS.eip8288}>EIP-8288</A> would make it a scheme and aggregate it.
      </p>
    </figure>
  );
}
