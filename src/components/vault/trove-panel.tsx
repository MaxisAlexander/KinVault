import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, ExternalLink, Loader2, Landmark, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Panel } from "@/components/vault/app-shell";
import { FundVaultDialog } from "@/components/vault/onchain-dialogs";
import {
  readBtcPrice,
  readProtocolParams,
  readTrove,
  type ProtocolParams,
  type TroveState,
} from "@/lib/chain/client";
import { MUSD, explorerAddressUrl, shortAddress } from "@/lib/chain/config";
import { summarizeTrove, type TroveSummary } from "@/lib/chain/protocol";
import { getInjectedProvider, openTrove, repayTrove } from "@/lib/chain/transactions";
import { confirmTroveOpen, confirmTroveRepay } from "@/lib/family.functions";
import { actions, useVault } from "@/lib/vault-store";
import { connectWallet, useWallet } from "@/lib/wallet";

type Snapshot = {
  priceUsd: number;
  priceRaw: bigint;
  params: ProtocolParams;
  trove: TroveState;
};

function formatNum(n: number, digits = 2) {
  return n.toLocaleString("en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

/**
 * Protocol-native borrowing panel. Reads the live Mezo PriceFeed and the
 * treasury's trove, then routes borrowing/repayment through BorrowerOperations.
 */
export function TrovePanel() {
  const state = useVault((s) => s);
  const wallet = useWallet((s) => s);
  const queryClient = useQueryClient();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collateral, setCollateral] = useState("0.01");
  const [borrow, setBorrow] = useState("2000");
  const [repayAmount, setRepayAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const confirmOpen = useServerFn(confirmTroveOpen);
  const confirmRepay = useServerFn(confirmTroveRepay);

  const treasury = state.treasuryAddress;
  const activeLoan = state.loans.find(
    (l) => l.status === "active" && l.troveOwner?.toLowerCase() === treasury?.toLowerCase(),
  );

  const load = useCallback(async () => {
    if (!treasury || state.mode !== "live") return;
    setLoading(true);
    setError(null);
    try {
      const [price, params, trove] = await Promise.all([
        readBtcPrice(),
        readProtocolParams(),
        readTrove(treasury as `0x${string}`),
      ]);
      const withPrice = trove.active
        ? await readTrove(treasury as `0x${string}`, price.raw)
        : trove;
      setSnapshot({ priceUsd: price.usd, priceRaw: price.raw, params, trove: withPrice });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read the Mezo protocol");
    } finally {
      setLoading(false);
    }
  }, [treasury, state.mode]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 20_000);
    return () => clearInterval(timer);
  }, [load]);

  if (state.mode !== "live") {
    return (
      <Panel
        title="Mezo Testnet trove"
        description="Sign in to a live family and fund a testnet treasury to borrow against BTC through BorrowerOperations."
      >
        <p className="rounded-xl bg-surface p-4 text-sm text-muted-foreground">
          Demo mode uses the local loan calculator below. Real borrowing is enabled in a live Mezo
          Testnet family.
        </p>
      </Panel>
    );
  }

  if (!treasury) {
    return (
      <Panel
        title="Set up the family treasury"
        description="Open a Mezo Testnet trove only after the family has a treasury wallet and test assets."
      >
        <div className="flex flex-wrap items-center gap-3">
          <FundVaultDialog asset="BTC" trigger={<Button variant="outline">Fund test BTC</Button>} />
          <FundVaultDialog asset="MUSD" trigger={<Button>Fund test MUSD</Button>} />
        </div>
      </Panel>
    );
  }

  const summary: TroveSummary | null = snapshot
    ? summarizeTrove(snapshot.trove, snapshot.priceUsd)
    : null;
  const connected = wallet.address?.toLowerCase() === treasury.toLowerCase();

  async function open() {
    if (!treasury) return;
    if (!wallet.address) {
      await connectWallet();
      return;
    }
    setBusy(true);
    try {
      const provider = getInjectedProvider();
      if (!provider) throw new Error("Connect the treasury wallet first");
      const result = await openTrove({ provider, collateralBtc: collateral, borrowMusd: borrow });
      const payload = await confirmOpen({
        data: {
          txHash: result.hash,
          purpose: "Mezo trove borrowing",
        },
      });
      if (payload) actions.hydrateLive(payload);
      await queryClient.invalidateQueries();
      toast.success("Mezo trove opened through BorrowerOperations", {
        description: (
          <a
            href={`https://explorer.test.mezo.org/tx/${result.hash}`}
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            View transaction
          </a>
        ),
      });
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not open the trove");
    } finally {
      setBusy(false);
    }
  }

  async function repay(full = false) {
    if (!activeLoan) {
      toast.error("No active ledger loan is linked to this trove");
      return;
    }
    const amount = full ? String(summary?.debtMusd ?? "") : repayAmount;
    if (!(Number(amount) > 0)) {
      toast.error("Enter an amount above zero");
      return;
    }
    setBusy(true);
    try {
      const provider = getInjectedProvider();
      if (!provider) throw new Error("Connect the treasury wallet first");
      const result = await repayTrove({ provider, amountMusd: amount });
      const payload = await confirmRepay({
        data: { txHash: result.hash, loanId: activeLoan.id },
      });
      if (payload) actions.hydrateLive(payload);
      await queryClient.invalidateQueries();
      toast.success("Trove repayment recorded on Mezo Testnet");
      setRepayAmount("");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not repay the trove");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel
      title="Mezo protocol position"
      description={
        <span className="flex flex-wrap items-center gap-2">
          Treasury {shortAddress(treasury)}
          <a
            href={explorerAddressUrl(treasury)}
            target="_blank"
            rel="noreferrer"
            className="text-primary hover:underline"
          >
            <ExternalLink className="inline h-3 w-3" />
          </a>
          <span className="text-muted-foreground">· MUSD {MUSD.symbol}</span>
        </span>
      }
      right={
        <Button variant="ghost" size="sm" onClick={() => void load()} disabled={loading}>
          {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
        </Button>
      }
    >
      {error && (
        <p className="mb-4 rounded-xl bg-destructive-soft px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      {!snapshot ? (
        <p className="rounded-xl bg-surface p-4 text-sm text-muted-foreground">
          Reading the Mezo PriceFeed and trove…
        </p>
      ) : (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-4">
            <Metric label="BTC price (PriceFeed)" value={`$${formatNum(snapshot.priceUsd)}`} />
            <Metric label="Collateral" value={`${formatNum(summary?.collateralBtc ?? 0, 6)} BTC`} />
            <Metric label="Debt" value={`${formatNum(summary?.debtMusd ?? 0)} MUSD`} />
            <Metric label="Health" value={summary?.active ? formatNum(summary.health) : "—"} />
          </div>

          {summary?.active ? (
            <>
              <div className="grid gap-3 rounded-xl bg-surface p-4 text-sm sm:grid-cols-3">
                <div>
                  <p className="text-xs text-muted-foreground">Collateral ratio</p>
                  <p className="font-extrabold tabular">{formatNum(summary.icr * 100)}%</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Liquidation price</p>
                  <p className="font-extrabold tabular">
                    ${formatNum(summary.liquidationPriceUsd)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  <p className="font-extrabold capitalize">{summary.status}</p>
                </div>
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-40 flex-1 space-y-2">
                  <Label htmlFor="repay-musd">Repay MUSD</Label>
                  <Input
                    id="repay-musd"
                    inputMode="decimal"
                    value={repayAmount}
                    onChange={(e) => setRepayAmount(e.target.value)}
                  />
                </div>
                <Button onClick={() => void repay()} disabled={busy || !repayAmount || !connected}>
                  {busy ? <Loader2 className="animate-spin" /> : <Landmark />} Repay trove
                </Button>
                <Button
                  variant="outline"
                  onClick={() => void repay(true)}
                  disabled={busy || !connected}
                >
                  Close trove
                </Button>
              </div>
              {!connected && (
                <p className="text-xs text-warning">
                  Connect {shortAddress(treasury)} to sign this repayment.
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Repaying the full debt calls <span className="font-mono">closeTrove()</span> and
                unlocks the collateral. Partial repayments must leave at least{" "}
                {formatNum(Number(snapshot.params.minNetDebt) / 1e18, 0)} MUSD of net debt.
              </p>
            </>
          ) : (
            <>
              <p className="flex items-center gap-2 rounded-xl bg-warning-soft px-3 py-2 text-sm text-warning">
                <AlertTriangle className="h-4 w-4" /> No active Mezo trove for this treasury. Open
                one through BorrowerOperations.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="trove-coll">BTC collateral</Label>
                  <Input
                    id="trove-coll"
                    inputMode="decimal"
                    value={collateral}
                    onChange={(e) => setCollateral(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="trove-borrow">MUSD to borrow</Label>
                  <Input
                    id="trove-borrow"
                    inputMode="decimal"
                    value={borrow}
                    onChange={(e) => setBorrow(e.target.value)}
                  />
                </div>
              </div>
              <Button onClick={() => void open()} disabled={busy || !connected}>
                {busy ? <Loader2 className="animate-spin" /> : <Landmark />} Open trove on Mezo
                Testnet
              </Button>
              <p className="text-xs text-muted-foreground">
                Mezo requires at least {formatNum(Number(snapshot.params.minNetDebt) / 1e18, 0)}{" "}
                MUSD of net debt, plus{" "}
                {formatNum(Number(snapshot.params.gasCompensation) / 1e18, 0)} MUSD of gas
                compensation added to the trove's debt.
              </p>
              {!connected && (
                <p className="text-xs text-warning">
                  Connect the treasury wallet {shortAddress(treasury)} to sign.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </Panel>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-background p-3">
      <p className="text-[11px] font-semibold text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-extrabold tabular">{value}</p>
    </div>
  );
}
