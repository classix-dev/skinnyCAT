import { PenLine, Send } from "lucide-react";
import { LEDGER_SYMBOL } from "../generated/contracts";
import { act, setAlice, useApp, type State } from "../store";
import { StepCard } from "./StepCard";
import { Timeline } from "./Timeline";
import { Button, Field, Spinner, StatusLine, cx, inputClass } from "./ui";

function hint(s: State): string {
  if (!s.keys.alice.key) return "Create or import Alice's key first.";
  if (!s.keys.bob.key) return "Bob needs a key too, so Alice has someone to pay.";
  if (s.deployed === false) return "Sending opens once the contracts are on mainnet. Sign Only works now.";
  if (!s.conn) return "Connect a browser wallet to send, or Sign Only to sign and check without sending.";
  return `One transaction. The ETC is deposited to Alice's key first, then her signed transfer moves ${LEDGER_SYMBOL} to Bob.`;
}

export function AliceStep() {
  const s = useApp();
  const f = s.alice;
  const run = s.runs.alice;
  const busy = s.busy === "alice";
  const confirmed = run?.steps.find((x) => x.id === "confirmed")?.state === "ok";
  const ready = !!s.keys.alice.key && !!s.keys.bob.key && !s.busy;
  return (
    <StepCard id="step-alice" n={3} title="Alice Deposits and Pays Bob" done={confirmed && !busy}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void act("alice", false);
        }}
      >
        <div className="flex flex-col gap-3 min-[420px]:flex-row min-[420px]:items-end">
          <Field label="Deposit from the browser wallet" suffix="ETC">
            <input
              data-testid="alice-deposit"
              inputMode="decimal"
              autoComplete="off"
              className={cx(inputClass, "mono pr-12")}
              value={f.deposit}
              onChange={(e) => setAlice({ deposit: e.target.value })}
            />
          </Field>
          <Field label="Send to Bob" suffix={LEDGER_SYMBOL}>
            <input
              data-testid="alice-amount"
              inputMode="decimal"
              autoComplete="off"
              className={cx(inputClass, "mono pr-16")}
              value={f.amount}
              onChange={(e) => setAlice({ amount: e.target.value })}
            />
          </Field>
        </div>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted">Message, signed and emitted on chain</span>
          <textarea
            data-testid="alice-memo"
            rows={3}
            maxLength={280}
            className={cx(inputClass, "h-auto resize-none py-2 leading-relaxed")}
            value={f.memo}
            onChange={(e) => setAlice({ memo: e.target.value })}
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="primary" disabled={!ready || !s.conn || s.deployed === false} data-testid="alice-go">
            {busy && !run?.signOnly ? <Spinner className="size-4" /> : <Send className="size-4" aria-hidden />}
            Sign and Send
          </Button>
          <Button disabled={!ready} onClick={() => void act("alice", true)} data-testid="alice-sign-only">
            {busy && run?.signOnly ? <Spinner className="size-4" /> : <PenLine className="size-4" aria-hidden />}
            Sign Only
          </Button>
        </div>
        <div data-testid="alice-hint">
          {f.error ? <StatusLine tone="error">{f.error}</StatusLine> : <p className="text-xs text-subtle">{hint(s)}</p>}
        </div>
      </form>
      {run && <Timeline run={run} label="Alice's progress" testId="alice-run" />}
    </StepCard>
  );
}
