import { ArrowDownToLine, PenLine, Send } from "lucide-react";
import { LEDGER_SYMBOL } from "../generated/contracts";
import { fmt } from "../lib/format";
import { act, setBob, useApp, type State } from "../store";
import type { Kind } from "../ledger";
import { CatAvatar } from "./Cats";
import { StepCard } from "./StepCard";
import { Timeline } from "./Timeline";
import { Button, Field, Spinner, StatusLine, cx, inputClass } from "./ui";

/** About what a relayed send costs in gas, for the fee hint. */
const RELAY_GAS = 300_000n;

function hint(s: State): string {
  if (!s.keys.bob.key) return "Create or import Bob's key first.";
  if (!s.conn) return "Connect a browser wallet to relay, or Sign Only to sign and check without sending.";
  return "Bob signs here, and the cat courier (your browser wallet) submits it for the fee in ETC.";
}

export function BobStep() {
  const s = useApp();
  const f = s.bob;
  const run = s.runs.bob;
  const busy = s.busy === "bob";
  const confirmed = run?.steps.find((x) => x.id === "confirmed")?.state === "ok";
  const ready = !!s.keys.bob.key && !s.busy;
  const gasCost = s.gasPrice ? s.gasPrice * RELAY_GAS : null;
  const tab = (k: Kind, label: string, Icon: typeof Send) => (
    <button
      type="button"
      role="radio"
      aria-checked={f.kind === k}
      data-testid={`bob-kind-${k}`}
      onClick={() => setBob({ kind: k })}
      className={cx(
        "inline-flex h-8 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md px-3 text-[13px] font-medium transition-colors",
        f.kind === k ? "bg-ink-700 text-fg shadow-sm ring-1 ring-ink-500 ring-inset" : "text-muted hover:text-fg",
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {label}
    </button>
  );
  return (
    <StepCard id="step-bob" n={4} title="Bob Pays Back Without ETC" done={confirmed && !busy}>
      <div className="mb-4 flex gap-2.5 rounded-xl bg-cyan/[0.05] p-3 text-[13px] leading-relaxed text-muted ring-1 ring-cyan/20 ring-inset" data-testid="bob-note">
        <CatAvatar who="bob" awake className="size-7 shrink-0 text-cyan" />
        <p>
          <span className="text-fg">Bob never needs ETC.</span> He's a stray, after all. He signs a note, and the cat courier
          submits it, pays the gas and earns the fee Bob signed for. The fee, the amount and the recipient are all inside
          the signature, so the courier can't change any of them.
        </p>
      </div>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void act("bob", false);
        }}
      >
        <div role="radiogroup" aria-label="What Bob signs" className="flex gap-1 rounded-lg bg-ink-950/60 p-1 ring-1 ring-ink-700 ring-inset">
          {tab("transfer", "Pay Alice", Send)}
          {tab("withdraw", "Withdraw ETC", ArrowDownToLine)}
        </div>
        {f.kind === "transfer" ? (
          <Field label={`To ${LEDGER_SYMBOL} account (Alice's by default)`}>
            <input
              data-testid="bob-to"
              className={cx(inputClass, "mono")}
              placeholder="0x…"
              spellCheck={false}
              autoComplete="off"
              value={f.to}
              onChange={(e) => setBob({ to: e.target.value })}
            />
          </Field>
        ) : (
          <Field label="To any ETC address">
            <input
              data-testid="bob-withdraw-to"
              className={cx(inputClass, "mono")}
              placeholder="0x…"
              spellCheck={false}
              autoComplete="off"
              value={f.withdrawTo}
              onChange={(e) => setBob({ withdrawTo: e.target.value })}
            />
          </Field>
        )}
        <div className="flex flex-col gap-3 min-[420px]:flex-row min-[420px]:items-end">
          <Field label="Amount" suffix={f.kind === "transfer" ? LEDGER_SYMBOL : "ETC"}>
            <input
              data-testid="bob-amount"
              inputMode="decimal"
              autoComplete="off"
              className={cx(inputClass, "mono pr-16")}
              value={f.amount}
              onChange={(e) => setBob({ amount: e.target.value })}
            />
          </Field>
          <Field label="Fee to the relayer" suffix="ETC">
            <input
              data-testid="bob-fee"
              inputMode="decimal"
              autoComplete="off"
              className={cx(inputClass, "mono pr-12")}
              value={f.fee}
              onChange={(e) => setBob({ fee: e.target.value })}
            />
          </Field>
        </div>
        <Field label="Message (optional)">
          <input
            data-testid="bob-memo"
            className={inputClass}
            autoComplete="off"
            maxLength={280}
            value={f.memo}
            onChange={(e) => setBob({ memo: e.target.value })}
          />
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="primary" disabled={!ready || !s.conn} data-testid="bob-go">
            {busy && !run?.signOnly ? <Spinner className="size-4" /> : <Send className="size-4" aria-hidden />}
            Sign and Relay
          </Button>
          <Button disabled={!ready} onClick={() => void act("bob", true)} data-testid="bob-sign-only">
            {busy && run?.signOnly ? <Spinner className="size-4" /> : <PenLine className="size-4" aria-hidden />}
            Sign Only
          </Button>
        </div>
        <div data-testid="bob-hint" className="space-y-1">
          {f.error ? <StatusLine tone="error">{f.error}</StatusLine> : <p className="text-xs text-subtle">{hint(s)}</p>}
          {gasCost !== null && (
            <p className="text-xs text-subtle" data-testid="bob-gas-hint">
              A relayed send uses about 300,000 gas, around {fmt(gasCost, "ETC")} at today's gas price.
            </p>
          )}
        </div>
      </form>
      {run && <Timeline run={run} label="Bob's progress" testId="bob-run" />}
    </StepCard>
  );
}
