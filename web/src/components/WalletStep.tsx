import { ArrowDownToLine, Info, RefreshCw, Wallet } from "lucide-react";
import { fmt, short } from "../lib/format";
import { connectProvider, fund, reloadWallet, setFundAmount, useApp, walletExplorer } from "../store";
import { Row, StepCard } from "./StepCard";
import { Button, Chip, Field, HexValue, Spinner, StatusLine, Tip, inputClass } from "./ui";

export function WalletStep() {
  const s = useApp();
  const funded = !!s.wallet && (s.wallet.balance > 0n || s.wallet.deployed);
  return (
    <StepCard
      id="step-wallet"
      n={2}
      title="Wallet"
      done={funded && !!s.conn}
      locked={!s.walletAddr}
      aside={s.walletAddr && <WalletChips />}
    >
      {!s.walletAddr ? (
        <p className="text-[13px] text-muted" data-testid="wallet-none">
          Your wallet address appears once you have a key.
        </p>
      ) : (
        <div className="space-y-5">
          <PqWallet />
          <GasWallet />
        </div>
      )}
    </StepCard>
  );
}

function WalletChips() {
  const { wallet } = useApp();
  if (!wallet) return <Spinner className="size-3.5 text-subtle" />;
  return (
    <>
      <Tip label={wallet.deployed ? "The wallet contract is on chain." : "Your first send deploys the contract, in the same transaction."}>
        <span tabIndex={0} className="rounded-full">
          <Chip tone={wallet.deployed ? "ok" : "warn"} testId="wallet-deployed">
            {wallet.deployed ? "Deployed" : "Not deployed"}
          </Chip>
        </span>
      </Tip>
      <Chip>
        Nonce <span className="mono" data-testid="wallet-nonce">{wallet.nonce.toString()}</span>
      </Chip>
    </>
  );
}

function PqWallet() {
  const s = useApp();
  if (!s.walletAddr) return null;
  return (
    <div>
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted">Balance</p>
          <p className="mt-0.5 flex items-baseline gap-1.5" aria-live="polite">
            <span className="text-3xl font-semibold tracking-[-0.03em] tabular-nums text-fg" data-testid="wallet-balance">
              {s.wallet ? fmt(s.net, s.wallet.balance, false) : "…"}
            </span>
            <span className="text-sm text-muted">{s.net.currency.symbol}</span>
          </p>
        </div>
        <Tip label="Refresh">
          <Button size="icon" variant="ghost" aria-label="Refresh wallet" onClick={reloadWallet} data-testid="wallet-refresh">
            <RefreshCw className="size-3.5" aria-hidden />
          </Button>
        </Tip>
      </div>
      <div className="mt-2">
        <Row label="Address">
          <HexValue value={s.walletAddr} label="wallet address" href={walletExplorer(s)} testId="wallet-address" head={8} tail={6} />
        </Row>
      </div>
      {s.walletError && (
        <div className="mt-2" data-testid="wallet-error">
          <StatusLine tone="error">{s.walletError}</StatusLine>
        </div>
      )}
    </div>
  );
}

function GasWallet() {
  const s = useApp();
  return (
    <div className="border-t border-white/[0.06] pt-4">
      <div className="mb-3 flex items-center gap-1.5">
        <h3 className="text-[13px] font-medium text-fg">Gas Wallet</h3>
        <Tip label="Any browser wallet. It pays gas and submits, with no power over your funds.">
          <button type="button" className="rounded text-subtle hover:text-fg" aria-label="About the gas wallet">
            <Info className="size-3.5" aria-hidden />
          </button>
        </Tip>
      </div>

      {!s.conn ? (
        <div className="space-y-2" data-testid="web3-none">
          {s.providers.length ? (
            <div className="flex flex-wrap gap-2" data-testid="web3-providers">
              {s.providers.map((d) => (
                <Button key={d.info.uuid} data-rdns={d.info.rdns} onClick={() => void connectProvider(d)}>
                  {d.info.icon ? <img src={d.info.icon} alt="" className="size-4 rounded-sm" /> : <Wallet className="size-4" aria-hidden />}
                  Connect {d.info.name}
                </Button>
              ))}
            </div>
          ) : (
            <p className="text-[13px] text-muted" data-testid="web3-empty">
              No browser wallet found. Install one such as MetaMask, then reload.
            </p>
          )}
          {s.connError && <StatusLine tone="error">{s.connError}</StatusLine>}
        </div>
      ) : (
        <div className="space-y-3" data-testid="web3-have">
          <div className="flex items-center gap-2.5 rounded-xl bg-ink-950/50 px-3 py-2 ring-1 ring-inset ring-ink-700">
            {s.conn.info.icon ? (
              <img src={s.conn.info.icon} alt="" className="size-5 rounded" />
            ) : (
              <Wallet className="size-5 text-muted" aria-hidden />
            )}
            <div className="min-w-0">
              <p className="truncate text-[13px] text-fg" data-testid="web3-name">
                {s.conn.info.name}
              </p>
              <p className="mono text-xs text-subtle" title={s.conn.account} data-testid="web3-account" data-value={s.conn.account}>
                {short(s.conn.account, 6, 4)}
              </p>
            </div>
            <p className="ml-auto text-right text-xs text-muted tabular-nums" data-testid="web3-balance">
              {s.gasBalance === null ? "…" : fmt(s.net, s.gasBalance)}
            </p>
          </div>

          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void fund();
            }}
          >
            <Field label="Fund amount" suffix={s.net.currency.symbol}>
              <input
                data-testid="fund-amount"
                inputMode="decimal"
                autoComplete="off"
                className={`${inputClass} mono pr-14`}
                value={s.fundAmount}
                onChange={(e) => setFundAmount(e.target.value)}
              />
            </Field>
            <Button type="submit" disabled={s.funding} data-testid="fund-go">
              {s.funding ? <Spinner className="size-4" /> : <ArrowDownToLine className="size-4" aria-hidden />}
              Fund
            </Button>
          </form>
          {s.fundStatus && (
            <StatusLine tone={s.fundStatus.tone} testId="fund-status">
              {s.fundStatus.text}
              {s.fundStatus.href && (
                <>
                  {" "}
                  <a href={s.fundStatus.href} target="_blank" rel="noopener noreferrer" className="underline decoration-current/40 underline-offset-2 hover:decoration-current">
                    {s.fundStatus.linkLabel}
                  </a>
                </>
              )}
            </StatusLine>
          )}
        </div>
      )}
    </div>
  );
}
