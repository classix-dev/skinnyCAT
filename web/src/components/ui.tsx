import * as RTooltip from "@radix-ui/react-tooltip";
import { Check, Copy, ExternalLink, LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { short } from "../lib/format";
import { OopsCat } from "./Cats";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "md" | "sm" | "icon";

const variants: Record<Variant, string> = {
  primary:
    "bg-accent text-ink-950 font-semibold shadow-[0_0_0_1px_rgb(255_255_255/0.12)_inset,0_8px_24px_-8px_var(--color-accent)] hover:bg-accent-hi disabled:bg-ink-700 disabled:text-muted disabled:shadow-none",
  secondary: "bg-ink-800 text-fg ring-1 ring-inset ring-ink-600 hover:bg-ink-700 hover:ring-ink-500",
  ghost: "text-muted hover:text-fg hover:bg-white/5",
  danger: "text-bad ring-1 ring-inset ring-bad/40 bg-bad/10 hover:bg-bad/15",
};
const sizes: Record<Size, string> = {
  md: "h-10 px-4 text-sm gap-2 rounded-lg",
  sm: "h-8 px-3 text-[13px] gap-1.5 rounded-md",
  icon: "size-8 rounded-md",
};

export function Button({
  variant = "secondary",
  size = "md",
  className,
  ...p
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return (
    <button
      type="button"
      className={cx(
        "inline-flex shrink-0 cursor-pointer items-center justify-center whitespace-nowrap font-medium transition-colors disabled:cursor-not-allowed",
        variants[variant],
        sizes[size],
        className,
      )}
      {...p}
    />
  );
}

export function Tip({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <RTooltip.Root>
      <RTooltip.Trigger asChild>{children}</RTooltip.Trigger>
      <RTooltip.Portal>
        <RTooltip.Content
          sideOffset={6}
          className="z-50 max-w-64 rounded-md bg-ink-700 px-2 py-1 text-xs text-fg shadow-lg ring-1 ring-ink-500"
        >
          {label}
        </RTooltip.Content>
      </RTooltip.Portal>
    </RTooltip.Root>
  );
}

export function CopyButton({ value, label, className, testId }: { value: string; label: string; className?: string; testId?: string }) {
  const [done, setDone] = useState(false);
  const t = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(t.current), []);
  return (
    <Tip label={done ? "Copied" : label}>
      <button
        type="button"
        aria-label={label}
        data-testid={testId}
        className={cx(
          "inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-subtle transition-colors hover:bg-white/5 hover:text-fg",
          className,
        )}
        onClick={async () => {
          await navigator.clipboard.writeText(value);
          setDone(true);
          clearTimeout(t.current);
          t.current = setTimeout(() => setDone(false), 1500);
        }}
      >
        {done ? <Check className="size-3.5 text-cyan" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
        <span className="sr-only" aria-live="polite">
          {done ? "Copied" : ""}
        </span>
      </button>
    </Tip>
  );
}

export function LinkButton({ href, label }: { href: string; label: string }) {
  return (
    <Tip label={label}>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={label}
        className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-subtle transition-colors hover:bg-white/5 hover:text-fg"
      >
        <ExternalLink className="size-3.5" aria-hidden />
      </a>
    </Tip>
  );
}

/** A hash or address in mono, shortened, with copy and an optional explorer link. */
export function HexValue({
  value,
  label,
  href,
  head = 8,
  tail = 6,
  testId,
  className,
}: {
  value: string;
  label: string;
  href?: string;
  head?: number;
  tail?: number;
  testId?: string;
  className?: string;
}) {
  return (
    <span className={cx("inline-flex min-w-0 items-center gap-0.5", className)}>
      <span className="mono truncate text-[13px] text-fg" title={value} data-testid={testId} data-value={value}>
        {short(value, head, tail)}
      </span>
      <CopyButton value={value} label={`Copy ${label}`} />
      {href && <LinkButton href={href} label="Open in explorer" />}
    </span>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <LoaderCircle className={cx("animate-spin", className)} aria-hidden />;
}

export function Progress({ value, label }: { value: number; label: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      className="h-1 w-full overflow-hidden rounded-full bg-ink-700"
    >
      <div
        className="h-full rounded-full bg-gradient-to-r from-accent to-cyan transition-[width] duration-200"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function Field({ label, children, suffix }: { label: string; children: ReactNode; suffix?: ReactNode }) {
  return (
    <label className="block min-w-0 flex-1">
      <span className="mb-1.5 block text-xs font-medium text-muted">{label}</span>
      <span className="relative block">
        {children}
        {suffix && (
          <span className="mono pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-subtle">
            {suffix}
          </span>
        )}
      </span>
    </label>
  );
}

export const inputClass =
  "h-10 w-full rounded-lg bg-ink-950/70 px-3 text-sm text-fg ring-1 ring-inset ring-ink-600 transition-shadow placeholder:text-subtle hover:ring-ink-500 focus:outline-none focus:ring-2 focus:ring-accent aria-invalid:ring-bad/70 disabled:opacity-60";

export function Chip({ tone = "neutral", children, testId }: { tone?: "neutral" | "ok" | "warn"; children: ReactNode; testId?: string }) {
  return (
    <span
      data-testid={testId}
      className={cx(
        "inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium ring-1 ring-inset",
        tone === "ok" && "bg-cyan/10 text-cyan ring-cyan/25",
        tone === "warn" && "bg-warn/10 text-warn ring-warn/25",
        tone === "neutral" && "bg-white/[0.03] text-muted ring-ink-600",
      )}
    >
      {children}
    </span>
  );
}

export function StatusLine({
  tone,
  children,
  testId,
}: {
  tone: "info" | "ok" | "error";
  children: ReactNode;
  testId?: string;
}) {
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      data-testid={testId}
      className={cx(
        "text-[13px] leading-relaxed break-words whitespace-pre-line",
        tone === "error" && "flex items-start gap-2",
        tone === "error" ? "text-bad" : tone === "ok" ? "text-cyan" : "text-muted",
      )}
    >
      {tone === "error" ? (
        <>
          <OopsCat className="mt-px size-[18px] shrink-0" />
          <span className="min-w-0">{children}</span>
        </>
      ) : (
        children
      )}
    </p>
  );
}
