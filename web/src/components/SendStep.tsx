import { Check, ExternalLink, Send, X } from "lucide-react";
import { isAddress } from "viem";
import { send, setSendAmount, setSendTo, useApp, type State, type Step } from "../store";
import { StepCard } from "./StepCard";
import { Button, Field, HexValue, Progress, Spinner, StatusLine, cx, inputClass } from "./ui";

function hint(s: State): string {
  if (!s.key) return "Create or import a key first.";
  if (!s.conn) return "Connect a gas wallet to submit.";
  if (s.wallet && s.wallet.balance === 0n) return "Fund the wallet first.";
  if (s.wallet && !s.wallet.deployed) return "The first send also deploys your wallet contract.";
  return "Signing takes a few seconds, in the background.";
}

export function SendStep() {
  const s = useApp();
  const badTo = !!s.sendTo && !isAddress(s.sendTo.trim());
  const confirmed = s.steps?.find((x) => x.id === "confirmed")?.state === "ok";
  return (
    <StepCard id="step-send" n={3} title="Send" done={confirmed && !s.sending}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <Field label="Recipient">
          <input
            data-testid="send-to"
            className={cx(inputClass, "mono")}
            placeholder="0x…"
            spellCheck={false}
            autoComplete="off"
            aria-invalid={badTo}
            value={s.sendTo}
            onChange={(e) => setSendTo(e.target.value)}
          />
        </Field>
        <div className="flex flex-col gap-2 min-[420px]:flex-row min-[420px]:items-end">
          <Field label="Amount" suffix={s.net.currency.symbol}>
            <input
              data-testid="send-amount"
              inputMode="decimal"
              autoComplete="off"
              className={cx(inputClass, "mono pr-14")}
              value={s.sendAmount}
              onChange={(e) => setSendAmount(e.target.value)}
            />
          </Field>
          <Button
            type="submit"
            variant="primary"
            disabled={s.sending || !s.key || !s.conn || !s.walletAddr}
            data-testid="send-go"
            className="min-[420px]:w-auto"
          >
            {s.sending ? <Spinner className="size-4" /> : <Send className="size-4" aria-hidden />}
            {s.sending ? "Sending" : "Sign and Send"}
          </Button>
        </div>
        <div data-testid="send-hint">
          {s.sendError ? <StatusLine tone="error">{s.sendError}</StatusLine> : <p className="text-xs text-subtle">{hint(s)}</p>}
        </div>
      </form>
      {s.steps && <Stepper steps={s.steps} />}
    </StepCard>
  );
}

function Stepper({ steps }: { steps: Step[] }) {
  // The explorer row only shows once there is something to open.
  const shown = steps.filter((x) => x.id !== "explorer" || x.state !== "idle");
  return (
    <ol
      aria-label="Send progress"
      aria-live="polite"
      data-testid="stepper"
      className="mt-4 rounded-xl bg-ink-950/50 p-3 ring-1 ring-inset ring-ink-700 sm:p-4"
    >
      {shown.map((st, i) => (
        <StepRow key={st.id} st={st} last={i === shown.length - 1} />
      ))}
    </ol>
  );
}

function StepIcon({ state }: { state: Step["state"] }) {
  const base = "relative z-10 flex size-5 items-center justify-center rounded-full";
  if (state === "ok")
    return (
      <span className={cx(base, "bg-cyan/15 text-cyan ring-1 ring-cyan/40")}>
        <Check className="size-3" aria-label="done" strokeWidth={3} />
      </span>
    );
  if (state === "fail")
    return (
      <span className={cx(base, "bg-bad/15 text-bad ring-1 ring-bad/40")}>
        <X className="size-3" aria-label="failed" strokeWidth={3} />
      </span>
    );
  if (state === "run")
    return (
      <span className={cx(base, "bg-accent/15 text-accent-hi ring-1 ring-accent/50")}>
        <Spinner className="size-3" />
        <span className="sr-only">running</span>
      </span>
    );
  return (
    <span className={cx(base, "bg-ink-900 ring-1 ring-ink-600")}>
      <span className="size-1.5 rounded-full bg-ink-500" />
      <span className="sr-only">waiting</span>
    </span>
  );
}

function StepRow({ st, last }: { st: Step; last: boolean }) {
  const explorer = st.id === "explorer";
  return (
    <li data-testid={`step-${st.id}`} data-state={st.state} className="relative flex gap-3 pb-3 last:pb-0">
      {!last && (
        <span
          aria-hidden
          className={cx("absolute top-5 bottom-0 left-[9.5px] w-px", st.state === "ok" ? "bg-cyan/35" : "bg-ink-700")}
        />
      )}
      <StepIcon state={st.state} />
      <div className="min-w-0 flex-1 sm:flex sm:items-start sm:justify-between sm:gap-4">
        <span
          className={cx(
            "block shrink-0 pt-px text-[13px] leading-5",
            st.state === "idle" ? "text-subtle" : st.state === "fail" ? "text-bad" : "text-fg",
          )}
        >
          {st.label}
        </span>
        <div
          data-testid={`step-${st.id}-detail`}
          className={cx(
            "min-w-0 text-xs leading-5 sm:flex-1 sm:text-right",
            st.state === "fail" ? "text-bad whitespace-pre-line break-words sm:max-w-[75%] sm:text-left" : "text-muted",
          )}
        >
          {explorer && st.href ? (
            <a
              href={st.href}
              target="_blank"
              rel="noopener noreferrer"
              className="mono inline-flex items-center gap-1 text-accent-hi underline decoration-accent-hi/40 underline-offset-2 hover:decoration-accent-hi"
            >
              {st.text}
              <ExternalLink className="size-3" aria-hidden />
            </a>
          ) : (
            <div className="flex flex-wrap items-center gap-x-2 sm:justify-end">
              {st.value && <HexValue value={st.value} label={st.label.toLowerCase()} href={st.href} head={10} tail={6} />}
              {st.text && <span className={cx(st.state !== "fail" && "mono")}>{st.text}</span>}
            </div>
          )}
          {st.state === "run" && st.progress !== undefined && (
            <div className="mt-1.5 w-full sm:ml-auto sm:w-40">
              <Progress value={st.progress} label={`${st.label} progress`} />
            </div>
          )}
        </div>
      </div>
    </li>
  );
}
