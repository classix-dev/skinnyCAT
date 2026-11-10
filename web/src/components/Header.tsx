import * as Popover from "@radix-ui/react-popover";
import { Check, ChevronDown, ShieldCheck, ShieldX, Wallet, X } from "lucide-react";
import { quickConnect, setNetwork, useApp } from "../store";
import { short } from "../lib/format";
import { Wordmark } from "./Brand";
import { Button, Spinner, cx } from "./ui";

export function Header() {
  return (
    <header>
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:px-6">
        <a href="/" className="rounded-md" aria-label="Hypertree home">
          <Wordmark />
        </a>
        <div className="ml-auto flex items-center gap-2">
          <NetworkBadge />
          <SelfTestPill />
          <ConnectTop />
        </div>
      </div>
    </header>
  );
}

function NetworkBadge() {
  const { networks, net } = useApp();
  const label = net.testnet ? `${net.name} Testnet` : net.name;
  const dot = <span className={cx("size-1.5 rounded-full", net.testnet ? "bg-warn" : "bg-cyan")} aria-hidden />;
  const pill = "h-7 items-center gap-1.5 rounded-full bg-white/[0.04] px-2.5 text-xs font-medium text-muted ring-1 ring-inset ring-ink-600";
  if (networks.length < 2)
    return (
      <span className={cx(pill, "hidden sm:inline-flex")} data-testid="network">
        {dot}
        {label}
      </span>
    );
  return (
    <label className={cx(pill, "relative inline-flex pr-7 focus-within:ring-accent")}>
      {dot}
      <span className="sr-only">Network</span>
      <select
        data-testid="network"
        className="cursor-pointer appearance-none bg-transparent text-xs text-muted outline-none"
        value={net.key}
        onChange={(e) => setNetwork(e.target.value)}
      >
        {networks.map((n) => (
          <option key={n.key} value={n.key} className="bg-ink-850">
            {n.testnet ? `${n.name} Testnet` : n.name}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 size-3.5" aria-hidden />
    </label>
  );
}

function SelfTestPill() {
  const { selftest, net } = useApp();
  const n = selftest.checks.length;
  const failed = selftest.checks.filter((c) => !c.ok);
  const label =
    selftest.state === "run" ? "Checking" : selftest.state === "ok" ? `Verified ${n}/${n}` : `${failed.length} failed`;
  return (
    <Popover.Root>
      <Popover.Trigger
        data-testid="selftest"
        data-state-result={selftest.state === "run" ? undefined : selftest.state}
        aria-label={`Self-tests, ${label}`}
        className={cx(
          "inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-full px-2.5 text-xs font-medium ring-1 ring-inset transition-colors",
          selftest.state === "fail"
            ? "bg-bad/10 text-bad ring-bad/30 hover:bg-bad/15"
            : "bg-white/[0.04] text-muted ring-ink-600 hover:text-fg",
        )}
      >
        {selftest.state === "run" ? (
          <Spinner className="size-3" />
        ) : (
          selftest.state === "ok" ? (
          <ShieldCheck className="size-3.5 text-cyan" aria-hidden />
        ) : (
          <ShieldX className="size-3.5" aria-hidden />
        )
        )}
        <span data-testid="selftest-label">
          <span className="sm:hidden">{selftest.state === "ok" ? `${n}/${n}` : label}</span>
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
          <p className="mt-0.5 text-xs text-muted">Run on load against {net.name}, chain {net.chainId}.</p>
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
                  <span className="mono block break-all text-xs text-subtle">{c.detail}</span>
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
        className="inline-flex h-7 items-center gap-1.5 rounded-full bg-white/[0.04] px-2.5 text-xs text-muted ring-1 ring-inset ring-ink-600"
        title={conn.account}
      >
        {conn.info.icon ? <img src={conn.info.icon} alt="" className="size-3.5 rounded-sm" /> : <Wallet className="size-3.5" aria-hidden />}
        <span className="sr-only sm:not-sr-only mono">{short(conn.account, 6, 4)}</span>
      </span>
    );
  return (
    <Button
      variant="primary"
      size="sm"
      disabled={providers.length === 0}
      data-testid="connect-top"
      onClick={() => {
        if (!quickConnect()) document.getElementById("step-wallet")?.scrollIntoView({ behavior: "smooth", block: "center" });
      }}
    >
      <Wallet className="size-3.5" aria-hidden />
      Connect
    </Button>
  );
}
