import { Check, ExternalLink, MessageSquareQuote, X } from "lucide-react";
import type { Run, Step } from "../store";
import { CopyButton, HexValue, Progress, Spinner, cx } from "./ui";

/** The progress of one run, message to explorer, and the memo once the receipt is in. */
export function Timeline({ run, label, testId }: { run: Run; label: string; testId: string }) {
  // The explorer row only shows once there is something to open.
  const shown = run.steps.filter((x) => x.id !== "explorer" || x.state !== "idle");
  return (
    <div className="mt-4 space-y-3" data-testid={testId}>
      <ol aria-label={label} aria-live="polite" className="rounded-xl bg-ink-950/50 p-3 ring-1 ring-ink-700 ring-inset sm:p-4">
        {shown.map((st, i) => (
          <StepRow key={st.id} st={st} last={i === shown.length - 1} />
        ))}
      </ol>
      {run.receipt?.memo && (
        <figure className="rounded-xl bg-accent/[0.06] p-3 ring-1 ring-accent/25 ring-inset sm:p-4" data-testid={`${testId}-memo`}>
          <figcaption className="flex items-center gap-1.5 text-xs text-muted">
            <MessageSquareQuote className="size-3.5 text-accent-hi" aria-hidden />
            Memo event, read from the receipt
            <a
              href={run.receipt.href}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto inline-flex items-center gap-1 text-accent-hi underline decoration-accent-hi/40 underline-offset-2 hover:decoration-accent-hi"
            >
              Blockscout
              <ExternalLink className="size-3" aria-hidden />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          </figcaption>
          <blockquote className="mt-2 text-[15px] leading-snug text-fg" data-testid={`${testId}-memo-text`}>
            {run.receipt.memo}
          </blockquote>
        </figure>
      )}
      {run.signed && (
        <div className="flex items-center justify-between gap-3 rounded-xl bg-ink-950/50 px-3 py-2 text-xs text-muted ring-1 ring-ink-700 ring-inset" data-testid={`${testId}-signed`}>
          <span>Signed and checked, nothing sent. The signature is 7,740 bytes.</span>
          <CopyButton value={run.signed.signature} label="Copy the signature" />
        </div>
      )}
    </div>
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
      {!last && <span aria-hidden className={cx("absolute top-5 bottom-0 left-[9.5px] w-px", st.state === "ok" ? "bg-cyan/35" : "bg-ink-700")} />}
      <StepIcon state={st.state} />
      <div className="min-w-0 flex-1 sm:flex sm:items-start sm:justify-between sm:gap-4">
        <span className={cx("block shrink-0 pt-px text-[13px] leading-5", st.state === "idle" ? "text-subtle" : st.state === "fail" ? "text-bad" : "text-fg")}>
          {st.label}
        </span>
        <div
          data-testid={`step-${st.id}-detail`}
          className={cx(
            "min-w-0 text-xs leading-5 sm:flex-1 sm:text-right",
            st.state === "fail" ? "break-words whitespace-pre-line text-bad sm:max-w-[75%] sm:text-left" : "text-muted",
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
              <span className="sr-only">(opens in a new tab)</span>
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
