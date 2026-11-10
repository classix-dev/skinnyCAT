// The signature the scenes draw from, and a form to sign another message in the browser.
import { useState } from "react";
import { toHex } from "./data/explain";
import { signText, useSample } from "./sample";
import { fmt, shortHex } from "./theme";

function Field({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] tracking-wide text-subtle uppercase">{label}</dt>
      <dd className="mono mt-0.5 truncate text-[13px] text-fg" title={title}>
        {value}
      </dd>
    </div>
  );
}

export default function SamplePanel() {
  const { text, ex, ms } = useSample();
  const [draft, setDraft] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = progress !== null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = draft.trim();
    if (!t || busy) return;
    setError(null);
    setProgress(0);
    try {
      await signText(t, setProgress);
      setDraft("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setProgress(null);
    }
  };

  return (
    <div className="overflow-hidden rounded-2xl bg-ink-900/70 ring-1 ring-white/[0.07] ring-inset">
      <div className="grid gap-5 p-4 sm:p-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:gap-8">
        <div className="min-w-0">
          <p className="text-[11px] tracking-wide text-subtle uppercase">The message</p>
          <p className="mt-1 truncate text-xl font-medium tracking-[-0.02em] text-fg" data-testid="sx-text">
            &ldquo;{text}&rdquo;
          </p>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5">
            <Field label="keccak256, signed" value={shortHex(ex.message, 6, 4)} title={toHex(ex.message)} />
            <Field label="Signature" value={`${fmt(ex.signature.length)} bytes`} />
            <Field label="PK.seed" value={shortHex(ex.pkSeed, 5, 3)} title={toHex(ex.pkSeed)} />
            <Field label="PK.root" value={shortHex(ex.pkRoot, 5, 3)} title={toHex(ex.pkRoot)} />
          </dl>
        </div>
        <form onSubmit={submit} className="flex min-w-0 flex-col justify-between gap-3">
          <div>
            <label htmlFor="sx-msg" className="text-[11px] tracking-wide text-subtle uppercase">
              Sign your own
            </label>
            <div className="mt-1.5 flex gap-2">
              <input
                id="sx-msg"
                value={draft}
                onChange={(e) => setDraft(e.target.value.slice(0, 120))}
                placeholder="Type a message"
                autoComplete="off"
                disabled={busy}
                className="h-10 min-w-0 flex-1 rounded-lg bg-ink-850 px-3 text-[15px] text-fg ring-1 ring-ink-600 ring-inset placeholder:text-subtle focus:ring-accent focus:outline-none disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={busy || !draft.trim()}
                className="inline-flex h-10 shrink-0 cursor-pointer items-center rounded-lg bg-accent px-4 text-sm font-semibold text-ink-950 shadow-[0_0_0_1px_rgb(255_255_255/0.12)_inset,0_8px_24px_-8px_var(--color-accent)] transition-colors hover:bg-accent-hi disabled:cursor-not-allowed disabled:bg-ink-700 disabled:text-muted disabled:shadow-none"
              >
                Sign
              </button>
            </div>
          </div>
          <div aria-live="polite" className="min-h-[2.5rem] text-[13px] leading-snug text-muted">
            {busy ? (
              <div>
                <div className="flex justify-between">
                  <span>Signing in your browser, about half a million hashes</span>
                  <span className="mono tabular-nums">{Math.round(progress * 100)}%</span>
                </div>
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-ink-600" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} aria-label="Signing progress">
                  <div className="h-full rounded-full bg-gradient-to-r from-accent to-cyan" style={{ width: `${progress * 100}%` }} />
                </div>
              </div>
            ) : error ? (
              <span className="text-bad">Signing failed. {error}</span>
            ) : ms ? (
              <span>
                Signed in this browser in {(ms / 1000).toFixed(1)} s and checked. Every scene below now shows this signature.
              </span>
            ) : (
              <span>Signed ahead of time with the same code, using a demo key whose secret is public.</span>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
