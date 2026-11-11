// Meta-transaction against frame transaction, in one picture. Bob sends Alice 0.1, step by step, in
// three ways that share a layout: today's scETC meta-transaction, an EIP-8141 frame transaction a
// paymaster sponsors (the same job a relayer does today), and one where Bob pays his own gas.
// Switching modes shows what moves (who signs the outer transaction, where Bob's money is, who pays
// gas) and what stays (Bob's leanSPHINCS signature, checked by contract code).
// Follows the EIP-8141 draft as of 2026-11-11. leanSPHINCS isn't a protocol scheme there, so the
// signature rides as an ARBITRARY entry and Bob's account checks it itself.
import { useRef, useState } from "react";
import { LEDGER_SYMBOL } from "../generated/contracts";
import { A, LINKS } from "./ext";
import { usePlayer, type Timing } from "./howPlayer";
import { PlayerControls } from "./PlayerControls";
import { cx } from "./ui";

type Mode = "meta" | "paymaster" | "self";
type Part = "tx" | "hash" | "r1" | "r2" | "r3" | "sig" | "fees";

type Step = {
  caption: string;
  /** Rows and actors lit at this step. */
  on: (Part | string)[];
  /** The actor paying gas once this step is done. */
  payer?: string;
  /** Alice has been paid once this step is done. */
  paid?: boolean;
};

type RowSpec = { part: Part; tag: string; tone: "verify" | "send" | "plain"; target: string; note: string };
type Actor = { id: string; name: string; sub: string };

type View = {
  label: string;
  title: React.ReactNode;
  sender: string;
  rowsLabel: string;
  rows: RowSpec[];
  sig: { tag: string; note: string };
  fees: { tag: string; note: string };
  hash: string;
  actors: Actor[];
  received: string;
  steps: Step[];
};

const SIG_HASH = "keccak256(0x06 ‖ rlp(tx)) with the signature's bytes left out";

const VIEWS: Record<Mode, View> = {
  meta: {
    label: "Meta-transaction, today",
    title: (
      <>
        Transaction type <span className="mono">0x00</span>, legacy
      </>
    ),
    sender: "sender: the relayer",
    rowsLabel: "inside",
    rows: [
      { part: "r1", tag: "CALL", tone: "plain", target: LEDGER_SYMBOL, note: "transfer, with Bob's message" },
      { part: "r2", tag: "MESSAGE", tone: "plain", target: "from Bob", note: `0.1 ${LEDGER_SYMBOL} to Alice, a fee, a nonce` },
    ],
    sig: { tag: "leanSPHINCS", note: "Bob's signature over the message, 7,740 bytes" },
    fees: { tag: "nonce, gas price", note: "the relayer's" },
    hash: "Bob signs his message. The relayer signs the transaction with ECDSA.",
    actors: [
      { id: "relayer", name: "Relayer", sub: "an ECDSA account" },
      { id: "scetc", name: LEDGER_SYMBOL, sub: "checks leanSPHINCS, holds Bob's balance" },
      { id: "alice", name: "Alice", sub: "" },
    ],
    received: `received 0.1 ${LEDGER_SYMBOL}`,
    steps: [
      { caption: `Bob signs a message, 0.1 ${LEDGER_SYMBOL} to Alice with a fee, and hands it to a relayer.`, on: ["r2", "sig"] },
      { caption: "The relayer wraps it in an ordinary transaction, signs that with its own ECDSA key and pays the gas.", on: ["tx", "r1", "fees", "hash", "relayer"], payer: "relayer" },
      { caption: `${LEDGER_SYMBOL} checks Bob's leanSPHINCS signature over the message.`, on: ["r1", "sig", "scetc"], payer: "relayer" },
      { caption: `Valid, so ${LEDGER_SYMBOL} moves 0.1 from Bob's balance to Alice's.`, on: ["scetc", "alice"], payer: "relayer", paid: true },
      { caption: `${LEDGER_SYMBOL} pays the relayer Bob's fee, in ETC.`, on: ["scetc", "relayer"], payer: "relayer", paid: true },
      { caption: "Done. It works on ETC today, but needs a relayer, its ECDSA key, and Bob's money inside a wrapper.", on: [], payer: "relayer", paid: true },
    ],
  },
  paymaster: {
    label: "Frame transaction, sponsored",
    title: (
      <>
        Transaction type <span className="mono">0x06</span>
      </>
    ),
    sender: "sender: Bob's account",
    rowsLabel: "frames",
    rows: [
      { part: "r1", tag: "VERIFY", tone: "verify", target: "Bob's account", note: "approves execution" },
      { part: "r2", tag: "VERIFY", tone: "verify", target: "paymaster", note: "approves payment" },
      { part: "r3", tag: "SENDER", tone: "send", target: "Alice", note: "0.1 ETC, as Bob" },
    ],
    sig: { tag: "ARBITRARY", note: "Bob's leanSPHINCS signature, 7,740 bytes" },
    fees: { tag: "nonce, fees", note: "max fee, priority fee" },
    hash: `Bob signs ${SIG_HASH}.`,
    actors: [
      { id: "bob", name: "Bob's account", sub: "code that checks leanSPHINCS" },
      { id: "pm", name: "Paymaster", sub: "a contract that sponsors gas" },
      { id: "alice", name: "Alice", sub: "" },
    ],
    received: "received 0.1 ETC",
    steps: [
      { caption: "Bob has no ETC for gas, the job a relayer does today. Here a paymaster contract sponsors him, inside his own transaction.", on: ["tx", "r1", "r2", "r3", "sig", "fees"] },
      { caption: "Bob signs the whole transaction, every frame and the fees. Nobody wraps it, and anyone can broadcast it.", on: ["hash", "r1", "r2", "r3", "fees"] },
      { caption: "Frame 1, VERIFY Bob. His account checks the leanSPHINCS signature and runs APPROVE for execution only.", on: ["r1", "sig", "bob"] },
      { caption: "Frame 2, VERIFY paymaster. Its code decides whether to sponsor Bob, and runs APPROVE for payment.", on: ["r2", "pm"], payer: "pm" },
      { caption: "Frame 3, SENDER. It runs as Bob's account and sends 0.1 ETC to Alice.", on: ["r3", "bob", "alice"], payer: "pm", paid: true },
      { caption: "Done. Someone else paid the gas, as with a relayer, but there was no ECDSA key and no wrapper.", on: [], payer: "pm", paid: true },
    ],
  },
  self: {
    label: "Frame transaction, Bob pays",
    title: (
      <>
        Transaction type <span className="mono">0x06</span>
      </>
    ),
    sender: "sender: Bob's account",
    rowsLabel: "frames",
    rows: [
      { part: "r1", tag: "VERIFY", tone: "verify", target: "Bob's account", note: "approves execution and payment" },
      { part: "r2", tag: "SENDER", tone: "send", target: "Alice", note: "0.1 ETC, as Bob" },
    ],
    sig: { tag: "ARBITRARY", note: "Bob's leanSPHINCS signature, 7,740 bytes" },
    fees: { tag: "nonce, fees", note: "max fee, priority fee" },
    hash: `Bob signs ${SIG_HASH}.`,
    actors: [
      { id: "bob", name: "Bob's account", sub: "code that checks leanSPHINCS" },
      { id: "alice", name: "Alice", sub: "" },
    ],
    received: "received 0.1 ETC",
    steps: [
      { caption: "Bob's wallet builds a type 0x06 transaction from his account, with two frames and his leanSPHINCS signature.", on: ["tx", "r1", "r2", "sig", "fees"] },
      { caption: "He signs the whole transaction, every frame and the fees.", on: ["hash", "r1", "r2", "fees"] },
      { caption: "Frame 1, VERIFY. The protocol calls Bob's account, read-only, and it checks the leanSPHINCS signature.", on: ["r1", "sig", "bob"] },
      { caption: "Valid, so the account runs APPROVE for execution and payment. Bob's nonce goes up and he pays the gas.", on: ["r1", "bob"], payer: "bob" },
      { caption: "Frame 2, SENDER. It runs as Bob's account and sends 0.1 ETC to Alice.", on: ["r2", "bob", "alice"], payer: "bob", paid: true },
      { caption: "Done. No relayer, no wrapper, and no ECDSA key anywhere.", on: [], payer: "bob", paid: true },
    ],
  },
};

const MODES: Mode[] = ["meta", "paymaster", "self"];
const LAST = 6;
const TIMING: Timing = { last: LAST, runMs: () => 900, dwellMs: 2600 };

function Row({ lit, children, testId }: { lit: boolean; children: React.ReactNode; testId?: string }) {
  return (
    <div
      data-testid={testId}
      data-lit={lit ? "1" : undefined}
      className={cx("rounded-lg px-3 py-2 ring-1 ring-inset transition-colors duration-300", lit ? "bg-cyan/[0.07] ring-cyan/40" : "bg-ink-850 ring-ink-700")}
    >
      {children}
    </div>
  );
}

function ActorCard({ a, lit, pays, sub }: { a: Actor; lit: boolean; pays: boolean; sub: string }) {
  return (
    <div
      data-testid={`fx-${a.id}`}
      data-lit={lit ? "1" : undefined}
      className={cx(
        "flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 ring-1 ring-inset transition-colors duration-300",
        lit ? "bg-accent/[0.08] ring-accent/45" : "bg-ink-900/70 ring-white/[0.07]",
      )}
    >
      <div className="min-w-0">
        <div className="text-[13px] font-medium text-fg">{a.name}</div>
        <div className="text-xs text-muted">{sub}</div>
      </div>
      {pays && <span className="mono shrink-0 rounded-full bg-cyan/12 px-2 py-0.5 text-[11px] text-cyan ring-1 ring-cyan/30 ring-inset">pays gas</span>}
    </div>
  );
}

const Label = ({ children }: { children: React.ReactNode }) => <div className="pt-1 text-[11px] font-medium tracking-wide text-subtle uppercase">{children}</div>;

export function FrameExplainer() {
  const figure = useRef<HTMLElement>(null);
  const [mode, setMode] = useState<Mode>("meta");
  const { s, dispatch } = usePlayer(figure, TIMING);
  const v = VIEWS[mode];
  // Before it plays, and on the server, show the last step at rest.
  const n = s.step === 0 ? LAST : s.step;
  const step = v.steps[n - 1];
  const lit = (p: string) => step.on.includes(p);

  const choose = (m: Mode) => {
    setMode(m);
    dispatch({ type: "replay" });
  };

  return (
    <figure ref={figure} className="mt-6 rounded-2xl bg-ink-900/70 p-4 ring-1 ring-white/[0.07] ring-inset sm:p-6" aria-labelledby="fx-caption" data-testid="fx" data-mode={mode}>
      <div role="group" aria-label="Which transaction" className="flex flex-wrap gap-1 rounded-2xl bg-ink-950/70 p-1 ring-1 ring-white/[0.08] ring-inset sm:inline-flex sm:rounded-full">
        {MODES.map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={mode === m}
            data-testid={`fx-mode-${m}`}
            onClick={() => choose(m)}
            className={cx(
              "cursor-pointer rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors",
              mode === m ? (m === "meta" ? "bg-warn text-ink-950" : "bg-accent text-ink-950") : "text-muted hover:text-fg",
            )}
          >
            {VIEWS[m].label}
          </button>
        ))}
      </div>

      <div className="mt-5 grid gap-5 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div
          className={cx("rounded-xl p-3 ring-1 ring-inset transition-colors duration-300 sm:p-4", lit("tx") ? (mode === "meta" ? "bg-warn/[0.06] ring-warn/40" : "bg-accent/[0.06] ring-accent/40") : "ring-white/[0.07]")}
          data-testid="fx-tx"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-sm font-semibold text-fg">{v.title}</span>
            <span className={cx("mono text-xs", mode === "meta" ? "text-warn" : "text-subtle")} data-testid="fx-sender">
              {v.sender}
            </span>
          </div>
          <div className="mt-3 space-y-1.5">
            <Label>{v.rowsLabel}</Label>
            {v.rows.map((r, i) => (
              <Row key={r.part} lit={lit(r.part)} testId={`fx-${r.part}`}>
                <div className="flex flex-wrap items-baseline gap-x-2 text-[13px]">
                  {v.rowsLabel === "frames" && <span className="mono text-subtle">{i + 1}</span>}
                  <span className={cx("mono font-medium", r.tone === "verify" ? "text-accent-hi" : r.tone === "send" ? "text-cyan" : "text-fg")}>{r.tag}</span>
                  <span className="text-fg">{r.target}</span>
                  <span className="text-xs text-muted">{r.note}</span>
                </div>
              </Row>
            ))}
            <Label>signature</Label>
            <Row lit={lit("sig")} testId="fx-sig">
              <div className="flex flex-wrap items-baseline gap-x-2 text-[13px]">
                <span className="mono font-medium text-fg">{v.sig.tag}</span>
                <span className="text-muted">{v.sig.note}</span>
                <span className="ml-auto rounded-full bg-cyan/10 px-2 py-px text-[11px] text-cyan ring-1 ring-cyan/30 ring-inset" data-testid="fx-same">
                  same in all three
                </span>
              </div>
            </Row>
            <Row lit={lit("fees")}>
              <div className="flex flex-wrap items-baseline gap-x-2 text-[13px]">
                <span className="mono font-medium text-fg">{v.fees.tag}</span>
                <span className="text-muted">{v.fees.note}</span>
              </div>
            </Row>
          </div>
          <div
            className={cx("mono mt-3 rounded-lg px-3 py-2 text-xs ring-1 ring-inset transition-colors duration-300", lit("hash") ? "bg-cyan/[0.07] text-cyan ring-cyan/40" : "text-subtle ring-ink-700")}
            data-testid="fx-hash"
          >
            {v.hash}
          </div>
        </div>

        <div className="space-y-2">
          {v.actors.map((a) => (
            <ActorCard key={a.id} a={a} lit={lit(a.id)} pays={step.payer === a.id} sub={a.id === "alice" ? (step.paid ? v.received : "waiting") : a.sub} />
          ))}
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
        In all three the 7,740 bytes go on chain, about 124,000 gas. <A href={LINKS.eip8288}>EIP-8288</A> would let frame
        transactions aggregate them.
      </p>
    </figure>
  );
}
