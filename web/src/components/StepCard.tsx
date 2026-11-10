import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "./ui";

export function StepCard({
  id,
  n,
  title,
  done,
  locked,
  aside,
  children,
}: {
  id: string;
  n: number;
  title: string;
  done?: boolean;
  locked?: boolean;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className={cx(
        "relative rounded-2xl bg-ink-900/80 ring-1 ring-inset ring-white/[0.07] shadow-[0_1px_0_0_rgb(255_255_255/0.04)_inset] transition-opacity",
        locked && "opacity-60",
      )}
    >
      <div className="flex items-center gap-3 px-4 pt-4 sm:px-5 sm:pt-5">
        <span
          className={cx(
            "mono flex size-6 shrink-0 items-center justify-center rounded-md text-xs font-medium ring-1 ring-inset",
            done ? "bg-cyan/12 text-cyan ring-cyan/30" : "bg-ink-800 text-muted ring-ink-600",
          )}
          aria-hidden
        >
          {done ? <Check className="size-3.5" /> : n}
        </span>
        <h2 id={`${id}-title`} className="text-[15px] font-semibold tracking-[-0.01em] text-fg">
          {title}
          {done && <span className="sr-only"> (done)</span>}
        </h2>
        {aside && <div className="ml-auto flex min-w-0 items-center gap-1.5">{aside}</div>}
      </div>
      <div className="px-4 pt-4 pb-4 sm:px-5 sm:pb-5">{children}</div>
    </section>
  );
}

export function Row({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-8 items-center justify-between gap-3">
      <span className="shrink-0 text-xs text-muted">{label}</span>
      <span className="flex min-w-0 items-center justify-end">{children}</span>
    </div>
  );
}
