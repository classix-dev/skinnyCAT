import { Info, Wallet } from "lucide-react";
import { fmt } from "../lib/format";
import { connectProvider, useApp } from "../store";
import { Row, StepCard } from "./StepCard";
import { Button, HexValue, StatusLine } from "./ui";
import { addressUrl } from "../config";

export function RelayerStep() {
  const s = useApp();
  return (
    <StepCard id="step-relayer" n={2} title="Browser Wallet" done={!!s.conn}>
      <p className="text-[13px] leading-relaxed text-muted">
        An ordinary account pays the gas. It deposits Alice's ETC and relays what Bob signs, for the fee Bob signs for.
        It can't change a signed message, and it only risks its own gas money.
      </p>
      <div className="mt-4">{s.conn ? <Connected /> : <Pick />}</div>
    </StepCard>
  );
}

function Pick() {
  const { providers, connError, live } = useApp();
  return (
    <div className="space-y-2" data-testid="web3-pick">
      {providers.length ? (
        <div className="flex flex-wrap gap-2" data-testid="web3-providers">
          {providers.map((d) => (
            <Button key={d.info.uuid} size="sm" onClick={() => void connectProvider(d)} data-rdns={d.info.rdns}>
              {d.info.icon ? <img src={d.info.icon} alt="" className="size-4 rounded-sm" /> : <Wallet className="size-3.5" aria-hidden />}
              {d.info.name}
            </Button>
          ))}
        </div>
      ) : (
        <p className="flex items-start gap-1.5 text-xs text-subtle" data-testid="web3-none">
          <Info className="mt-px size-3.5 shrink-0" aria-hidden />
          {live
            ? "No browser wallet found. Install one that supports Ethereum Classic, or use Sign Only below."
            : "Looking for browser wallets."}
        </p>
      )}
      {connError && <StatusLine tone="error">{connError}</StatusLine>}
    </div>
  );
}

function Connected() {
  const s = useApp();
  if (!s.conn) return null;
  return (
    <div data-testid="web3-have">
      <Row label={s.conn.info.name}>
        <HexValue value={s.conn.account} label="browser wallet address" href={addressUrl(s.net, s.conn.account)} testId="web3-account" />
      </Row>
      <Row label="Balance">
        <span className="mono text-[13px] text-fg" data-testid="web3-balance">
          {s.gasBalance === null ? "…" : fmt(s.gasBalance, "ETC")}
        </span>
      </Row>
      {s.connStatus && <StatusLine tone="error">{s.connStatus}</StatusLine>}
    </div>
  );
}
