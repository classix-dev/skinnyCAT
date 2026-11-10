import { ChevronRight, KeyRound, Plus, TriangleAlert, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { seedToPhrase } from "../key";
import { cancelImport, createKey, disarmImport, forgetKey, importPhrase, openImport, useApp } from "../store";
import { StepCard, Row } from "./StepCard";
import { Button, Chip, CopyButton, HexValue, Progress, StatusLine, cx, inputClass } from "./ui";

export function KeyStep() {
  const s = useApp();
  return (
    <StepCard
      id="step-key"
      n={1}
      title="Key"
      done={!!s.key}
      aside={s.key && <Chip>leanSPHINCS</Chip>}
    >
      <div data-testid="key-view" data-view={s.keyView}>
        {s.keyView === "none" && <NoKey error={s.keyError} />}
        {s.keyView === "import" && <ImportForm />}
        {s.keyView === "busy" && <Busy progress={s.keyProgress} />}
        {s.keyView === "have" && <HaveKey />}
      </div>
    </StepCard>
  );
}

function NoKey({ error }: { error: string | null }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={createKey} data-testid="key-create">
          <Plus className="size-4" aria-hidden />
          Create Key
        </Button>
        <Button onClick={openImport} data-testid="key-import-open">
          <Upload className="size-4" aria-hidden />
          Import Phrase
        </Button>
      </div>
      {error && <StatusLine tone="error">{error}</StatusLine>}
    </div>
  );
}

function ImportForm() {
  const { keyError, importArmed, key } = useApp();
  const [phrase, setPhrase] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        importPhrase(phrase);
      }}
    >
      <label className="block">
        <span className="mb-1.5 block text-xs font-medium text-muted">Backup phrase</span>
        <textarea
          ref={ref}
          data-testid="key-phrase-in"
          rows={4}
          spellCheck={false}
          autoComplete="off"
          placeholder="24 words"
          aria-invalid={!!keyError && !importArmed}
          value={phrase}
          onChange={(e) => {
            setPhrase(e.target.value);
            disarmImport();
          }}
          className={cx(inputClass, "mono h-auto resize-none py-2 leading-relaxed")}
        />
      </label>
      {keyError && (
        <div data-testid="key-import-error">
          <StatusLine tone="error">{keyError}</StatusLine>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant={importArmed ? "danger" : "primary"} data-testid="key-import-go">
          {importArmed ? "Replace Current Key" : "Use Phrase"}
        </Button>
        <Button variant="ghost" onClick={cancelImport} data-testid="key-import-cancel">
          {key ? "Keep Current Key" : "Cancel"}
        </Button>
      </div>
    </form>
  );
}

function Busy({ progress }: { progress: number }) {
  return (
    <div className="space-y-2.5" data-testid="key-busy">
      <div className="flex items-baseline justify-between text-[13px]">
        <span className="text-fg">Deriving public key</span>
        <span className="mono text-xs text-muted">{Math.round(progress * 100)}%</span>
      </div>
      <Progress value={progress} label="Deriving public key" />
      <p className="text-xs text-subtle">About 230,000 Keccak calls, in a Web Worker.</p>
    </div>
  );
}

function HaveKey() {
  const { key, seed, keyFresh } = useApp();
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  if (!key || !seed) return null;
  const words = seedToPhrase(seed).split(" ");
  return (
    <div className="space-y-3">
      <Row label="Public key">
        <HexValue value={key.publicKey} label="public key" testId="key-pk" head={10} tail={8} />
      </Row>

      <details key={seed} open={keyFresh} className="group rounded-xl bg-ink-950/50 ring-1 ring-inset ring-ink-700">
        <summary className="flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2.5 text-[13px] text-fg select-none hover:bg-white/[0.02]">
          <KeyRound className="size-3.5 text-muted" aria-hidden />
          Backup Phrase
          <span className="ml-auto text-xs text-subtle">24 words</span>
          <ChevronRight className="size-3.5 text-subtle transition-transform group-open:rotate-90" aria-hidden />
        </summary>
        <div className="space-y-3 px-3 pb-3">
          <ol className="grid grid-cols-2 gap-1.5 min-[420px]:grid-cols-3 sm:grid-cols-4" data-testid="key-words">
            {words.map((w, i) => (
              <li key={i} className="flex items-baseline gap-1.5 rounded-md bg-ink-850 px-2 py-1 ring-1 ring-inset ring-ink-700">
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
              Stored in this browser as a demo hot key. Never enter a real wallet's phrase here.
            </p>
            <CopyButton value={words.join(" ")} label="Copy backup phrase" />
          </div>
        </div>
      </details>

      <div className="flex flex-wrap gap-1 pt-1">
        <Button size="sm" variant="ghost" onClick={openImport} data-testid="key-replace">
          Import Another
        </Button>
        <Button
          size="sm"
          variant={armed ? "danger" : "ghost"}
          data-testid="key-forget"
          onClick={() => {
            if (!armed) return setArmed(true);
            setArmed(false);
            forgetKey();
          }}
        >
          {armed ? "Click Again to Forget" : "Forget Key"}
        </Button>
      </div>
    </div>
  );
}
