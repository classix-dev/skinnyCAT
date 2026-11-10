import * as Popover from "@radix-ui/react-popover";
import { Check, ShieldCheck, ShieldX, Wallet, X } from "lucide-react";
import { short } from "../lib/format";
import { quickConnect, useApp } from "../store";
import { APP_NAME, Wordmark } from "./Brand";
import { ByClassix } from "./ClassixWordmark";
import { Button, Spinner, cx } from "./ui";

export function Header() {
  return (
    <header className="sticky top-0 z-40 h-14 border-b border-white/[0.06] bg-ink-950/75 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4 sm:gap-3 sm:px-6">
        <a href="/" className="rounded-md" aria-label={`${APP_NAME} home`}>
          <Wordmark />
        </a>
        <ByClassix />
        <div className="ml-auto flex items-center gap-2">
          <span
            className="hidden h-7 items-center gap-1.5 rounded-full bg-white/[0.04] px-2.5 text-xs font-medium text-muted ring-1 ring-ink-600 ring-inset md:inline-flex"
            data-testid="network"
          >
            <span className="size-1.5 rounded-full bg-cyan" aria-hidden />
            Ethereum Classic
          </span>
          <SelfTestPill />
          <ConnectTop />
        </div>
      </div>
    </header>
  );
}

function SelfTestPill() {
  const { selftest, net } = useApp();
  const n = selftest.checks.length;
  const failed = selftest.checks.filter((c) => !c.ok);
  const label = selftest.state === "run" ? "Checking" : selftest.state === "ok" ? `Verified ${n}/${n}` : `${failed.length} failed`;
  return (
    <Popover.Root>
      <Popover.Trigger
        data-testid="selftest"
        data-state-result={selftest.state === "run" ? undefined : selftest.state}
        aria-label={`Self-tests, ${label}`}
        className={cx(
          "inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-full px-2.5 text-xs font-medium ring-1 ring-inset transition-colors",
          selftest.state === "fail" ? "bg-bad/10 text-bad ring-bad/30 hover:bg-bad/15" : "bg-white/[0.04] text-muted ring-ink-600 hover:text-fg",
        )}
      >
        {selftest.state === "run" ? (
          <Spinner className="size-3" />
        ) : selftest.state === "ok" ? (
          <ShieldCheck className="size-3.5 text-cyan" aria-hidden />
        ) : (
          <ShieldX className="size-3.5" aria-hidden />
        )}
        <span data-testid="selftest-label">
          <span className="sm:hidden">{selftest.state === "ok" ? `${n}/${n}` : selftest.state === "fail" ? `${failed.length}` : ""}</span>
          <span className="hidden sm:inline">{label}</span>
        </span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          className="z-50 w-[min(22rem,calc(100vw-2rem))] rounded-xl bg-ink-850 p-4 text-sm shadow-2xl ring-1 ring-ink-600"
        >
          <p className="font-medium text-fg">Self-Tests</p>
          <p className="mt-0.5 text-xs text-muted">
            Run on load against {net.name}, chain {net.chainId}.
          </p>
          <ul className="mt-3 space-y-2" data-testid="selftest-list">
            {selftest.checks.map((c) => (
              <li key={c.name} className="flex items-start gap-2">
                {c.ok ? (
                  <Check className="mt-0.5 size-3.5 shrink-0 text-cyan" aria-label="passed" />
                ) : (
                  <X className="mt-0.5 size-3.5 shrink-0 text-bad" aria-label="failed" />
                )}
                <span className="min-w-0">
                  <span className="block text-[13px] text-fg">{c.name}</span>
                  <span className="mono block text-xs break-all text-subtle">{c.detail}</span>
                </span>
              </li>
            ))}
            {selftest.state === "run" && <li className="text-xs text-muted">Running</li>}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function ConnectTop() {
  const { conn, providers } = useApp();
  if (conn)
    return (
      <span
        className="inline-flex h-7 items-center gap-1.5 rounded-full bg-white/[0.04] px-2.5 text-xs text-muted ring-1 ring-ink-600 ring-inset"
        title={conn.account}
        data-testid="connected-top"
      >
        {conn.info.icon ? <img src={conn.info.icon} alt="" className="size-3.5 rounded-sm" /> : <Wallet className="size-3.5" aria-hidden />}
        <span className="mono sr-only sm:not-sr-only">{short(conn.account, 6, 4)}</span>
      </span>
    );
  return (
    <Button
      variant="primary"
      size="sm"
      disabled={providers.length === 0}
      data-testid="connect-top"
      onClick={() => {
        if (!quickConnect()) document.getElementById("step-relayer")?.scrollIntoView({ behavior: "smooth", block: "center" });
      }}
    >
      <Wallet className="size-3.5" aria-hidden />
      <span className="max-[399px]:sr-only">Connect</span>
    </Button>
  );
}
