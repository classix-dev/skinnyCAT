import { ChevronRight, KeyRound, Plus, RefreshCw, TriangleAlert, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { LEDGER_SYMBOL } from "../generated/contracts";
import { NAMES, seedToPhrase, type Who } from "../key";
import { fmt } from "../lib/format";
import { accountUrl, cancelImport, createKey, disarmImport, forgetKey, importPhrase, openImport, refreshAll, useApp } from "../store";
import { CatAvatar } from "./Cats";
import { Row, StepCard } from "./StepCard";
import { Button, CopyButton, HexValue, Progress, StatusLine, Tip, cx, inputClass } from "./ui";

export function KeysStep() {
  const { keys } = useApp();
  const both = !!keys.alice.key && !!keys.bob.key;
  return (
    <StepCard
      id="step-keys"
      wide
      n={1}
      title="Two Cats, Two Keys"
      done={both}
      aside={
        (keys.alice.key || keys.bob.key) && (
          <Tip label="Refresh balances">
            <Button size="icon" variant="ghost" aria-label="Refresh balances" onClick={() => void refreshAll()} data-testid="refresh">
              <RefreshCw className="size-3.5" aria-hidden />
            </Button>
          </Tip>
        )
      }
    >
      <p className="mb-4 text-[13px] leading-relaxed text-muted">
        Each key is made in this browser and lives only here. Its {LEDGER_SYMBOL} account is a hash of the public key, so no
        ECDSA key controls it. One key signs up to 2<sup>30</sup> times, more lives than any cat needs.
      </p>
      <div className="divide-y divide-white/[0.06] rounded-xl bg-ink-950/50 ring-1 ring-ink-700 ring-inset md:grid md:grid-cols-2 md:divide-x md:divide-y-0">
        <KeyPanel who="alice" />
        <KeyPanel who="bob" />
      </div>
    </StepCard>
  );
}

function KeyPanel({ who }: { who: Who }) {
  const slot = useApp().keys[who];
  return (
    <section className="p-3 sm:p-4" aria-labelledby={`${who}-title`} data-testid={`${who}-key`} data-view={slot.view}>
      <div className="flex items-center gap-2">
        <span
          className={cx(
            "flex size-8 items-center justify-center rounded-full",
            who === "alice" ? "bg-accent/10 text-accent-hi ring-1 ring-accent/30" : "bg-cyan/[0.07] text-cyan ring-1 ring-cyan/25",
          )}
          aria-hidden
          data-testid={`${who}-avatar`}
          data-awake={slot.view === "have" ? "1" : undefined}
        >
          <CatAvatar who={who} awake={slot.view === "have"} className="size-7" />
        </span>
        <h3 id={`${who}-title`} className="text-sm font-semibold text-fg">
          {NAMES[who]}
        </h3>
        <span className="text-xs text-subtle">{who === "alice" ? "the well-fed one" : "the skinny stray"}</span>
        {slot.view === "have" && (
          <span className="ml-auto flex items-baseline gap-1 text-sm" aria-live="polite">
            <span className="font-semibold tabular-nums text-fg" data-testid={`${who}-balance`}>
              {slot.balance === null ? "…" : fmt(slot.balance)}
            </span>
            <span className="text-xs text-muted">{LEDGER_SYMBOL}</span>
          </span>
        )}
      </div>
      <div className="mt-3">
        {slot.view === "none" && <NoKey who={who} />}
        {slot.view === "import" && <ImportForm who={who} />}
        {slot.view === "busy" && <Busy who={who} progress={slot.progress} />}
        {slot.view === "have" && <HaveKey who={who} />}
      </div>
    </section>
  );
}

function NoKey({ who }: { who: Who }) {
  const { error } = useApp().keys[who];
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="primary" onClick={() => createKey(who)} data-testid={`${who}-create`}>
          <Plus className="size-3.5" aria-hidden />
          Create Key
        </Button>
        <Button size="sm" onClick={() => openImport(who)} data-testid={`${who}-import-open`}>
          <Upload className="size-3.5" aria-hidden />
          Import Phrase
        </Button>
      </div>
      <p className="text-xs text-subtle" data-testid={`${who}-napping`}>
        No key yet, so {NAMES[who]} is napping.
      </p>
      {error && <StatusLine tone="error">{error}</StatusLine>}
    </div>
  );
}

function ImportForm({ who }: { who: Who }) {
  const { error, importArmed, key } = useApp().keys[who];
  const [phrase, setPhrase] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        importPhrase(who, phrase);
      }}
    >
      <label className="block">
        <span className="mb-1.5 block text-xs font-medium text-muted">{NAMES[who]}'s backup phrase</span>
        <textarea
          ref={ref}
          data-testid={`${who}-phrase-in`}
          rows={3}
          spellCheck={false}
          autoComplete="off"
          placeholder="24 words"
          aria-invalid={!!error && !importArmed}
          value={phrase}
          onChange={(e) => {
            setPhrase(e.target.value);
            disarmImport(who);
          }}
          className={cx(inputClass, "mono h-auto resize-none py-2 leading-relaxed")}
        />
      </label>
      {error && (
        <div data-testid={`${who}-import-error`}>
          <StatusLine tone="error">{error}</StatusLine>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" type="submit" variant={importArmed ? "danger" : "primary"} data-testid={`${who}-import-go`}>
          {importArmed ? "Replace Current Key" : "Use Phrase"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => cancelImport(who)} data-testid={`${who}-import-cancel`}>
          {key ? "Keep Current Key" : "Cancel"}
        </Button>
      </div>
    </form>
  );
}

function Busy({ who, progress }: { who: Who; progress: number }) {
  return (
    <div className="space-y-2" data-testid={`${who}-busy`}>
      <div className="flex items-baseline justify-between text-[13px]">
        <span className="text-fg">Deriving the public key</span>
        <span className="mono text-xs text-muted">{Math.round(progress * 100)}%</span>
      </div>
      <Progress value={progress} label={`Deriving ${NAMES[who]}'s public key`} />
    </div>
  );
}

function HaveKey({ who }: { who: Who }) {
  const s = useApp();
  const { key, seed, fresh, account, nonce, error } = s.keys[who];
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  if (!key || !seed || !account) return null;
  const words = seedToPhrase(seed).split(" ");
  return (
    <div className="space-y-2">
      <div>
        <Row label={`${LEDGER_SYMBOL} account`}>
          <HexValue value={account} label={`${NAMES[who]}'s account`} href={accountUrl(s, who)} testId={`${who}-account`} head={8} tail={6} />
        </Row>
        <Row label="Public key">
          <HexValue value={key.publicKey} label={`${NAMES[who]}'s public key`} testId={`${who}-pk`} head={8} tail={6} />
        </Row>
        <Row label="Nonce">
          <span className="mono text-[13px] text-fg" data-testid={`${who}-nonce`}>
            {nonce === null ? "…" : nonce.toString()}
          </span>
        </Row>
      </div>
      {error && <StatusLine tone="error">{error}</StatusLine>}

      <details key={seed} open={fresh} className="group rounded-lg bg-ink-900/60 ring-1 ring-ink-700 ring-inset">
        <summary className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-[13px] text-fg select-none hover:bg-white/[0.02]">
          <KeyRound className="size-3.5 text-muted" aria-hidden />
          Backup Phrase
          <span className="ml-auto text-xs text-subtle">24 words</span>
          <ChevronRight className="size-3.5 text-subtle transition-transform group-open:rotate-90" aria-hidden />
        </summary>
        <div className="@container space-y-3 px-3 pb-3">
          <ol className="grid grid-cols-2 gap-1.5 @[20rem]:grid-cols-3 @[28rem]:grid-cols-4" data-testid={`${who}-words`}>
            {words.map((w, i) => (
              <li key={i} className="flex items-baseline gap-1.5 rounded-md bg-ink-850 px-2 py-1 ring-1 ring-ink-700 ring-inset">
                <span className="mono w-4 text-right text-[10px] text-subtle" aria-hidden>
                  {i + 1}
                </span>
                <span className="mono text-[13px] text-fg" data-word>
                  {w}
                </span>
              </li>
            ))}
          </ol>
          <div className="flex items-center justify-between gap-3">
            <p className="flex items-start gap-1.5 text-xs text-subtle">
              <TriangleAlert className="mt-px size-3.5 shrink-0 text-warn" aria-hidden />
              Stored in this browser as a demo key. Never enter a real wallet's phrase here.
            </p>
            <CopyButton value={words.join(" ")} label={`Copy ${NAMES[who]}'s backup phrase`} />
          </div>
        </div>
      </details>

      <div className="flex flex-wrap gap-1">
        <Button size="sm" variant="ghost" onClick={() => openImport(who)} data-testid={`${who}-replace`}>
          Import Another
        </Button>
        <Button
          size="sm"
          variant={armed ? "danger" : "ghost"}
          data-testid={`${who}-forget`}
          onClick={() => {
            if (!armed) return setArmed(true);
            setArmed(false);
            forgetKey(who);
          }}
        >
          {armed ? "Click Again to Forget" : "Forget Key"}
        </Button>
      </div>
    </div>
  );
}
