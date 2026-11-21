import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, ExternalLink, Loader2, Landmark, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldError } from "@/components/ui/field-error";
import { Label } from "@/components/ui/label";
import { Panel } from "@/components/vault/app-shell";
import { FundVaultDialog } from "@/components/vault/onchain-dialogs";
import {
  readBtcPrice,
  readProtocolParams,
  readTokenBalance,
  readTrove,
  type ProtocolParams,
  type TroveState,
} from "@/lib/chain/client";
import { MUSD, TOKENS, explorerAddressUrl, shortAddress } from "@/lib/chain/config";
import { meetsMezoParticipation } from "@/lib/chain/participation";
import { toastError } from "@/lib/errors";
import { summarizeTrove, type TroveSummary } from "@/lib/chain/protocol";
import { getInjectedProvider, openTrove, repayTrove } from "@/lib/chain/transactions";
import { confirmTroveOpen, confirmTroveRepay } from "@/lib/family.functions";
import {
  MAX_BTC,
  MAX_MUSD,
  amountError,
  parseDecimal,
  sanitizeDecimal,
} from "@/lib/input-validation";
import { cn } from "@/lib/utils";
import { actions, useVault } from "@/lib/vault-store";
import { connectWallet, useWallet } from "@/lib/wallet";

type Snapshot = {
  priceUsd: number;
  priceRaw: bigint;
  params: ProtocolParams;
  trove: TroveState;
  /** Treasury MEZO balance, for KinVault's participation policy. */
  mezoWei: bigint;
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
      const [price, params, trove, mezoWei] = await Promise.all([
        readBtcPrice(),
        readProtocolParams(),
        readTrove(treasury as `0x${string}`),
        readTokenBalance(TOKENS.MEZO.address, treasury as `0x${string}`),
      ]);
      const withPrice = trove.active
        ? await readTrove(treasury as `0x${string}`, price.raw)
        : trove;
      setSnapshot({ priceUsd: price.usd, priceRaw: price.raw, params, trove: withPrice, mezoWei });
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
  const mezoOk = snapshot ? meetsMezoParticipation(snapshot.mezoWei) : false;
  const minNetDebt = snapshot ? Number(snapshot.params.minNetDebt) / 1e18 : 0;
  const debt = summary?.debtMusd ?? 0;
  const repayValue = parseDecimal(repayAmount) ?? 0;

  const repayIssue =
    amountError(repayAmount, {
      label: "an amount",
      decimals: 2,
      max: debt,
      maxLabel: `The trove owes ${formatNum(debt)} MUSD`,
    }) ??
    (repayValue > 0 && repayValue < debt && debt - repayValue < minNetDebt
      ? `A partial repayment must leave at least ${formatNum(minNetDebt, 0)} MUSD of debt — use Close trove instead`
      : null);

  const collateralIssue = amountError(collateral, {
    label: "the BTC collateral",
    decimals: 8,
    max: MAX_BTC,
  });

  const borrowValue = parseDecimal(borrow) ?? 0;
  const borrowIssue =
    amountError(borrow, {
      label: "the MUSD amount",
      decimals: 2,
      max: MAX_MUSD,
    }) ??
    (borrowValue > 0 && minNetDebt > 0 && borrowValue < minNetDebt
      ? `Mezo needs at least ${formatNum(minNetDebt, 0)} MUSD of net debt`
      : null);

  async function open() {
    if (!treasury) return;
    if (collateralIssue || borrowIssue) {
      toast.error(collateralIssue ?? borrowIssue ?? "Check the trove inputs");
      return;
    }
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
      toastError(e, "Could not open the trove");
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
    if (!full && repayIssue) {
      toast.error(repayIssue);
      return;
    }
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
      toastError(e, "Could not repay the trove");
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
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Metric label="BTC price (PriceFeed)" value={`$${formatNum(snapshot.priceUsd)}`} />
            <Metric label="Collateral" value={`${formatNum(summary?.collateralBtc ?? 0, 6)} BTC`} />
            <Metric label="Debt" value={`${formatNum(summary?.debtMusd ?? 0)} MUSD`} />
            <Metric label="Health" value={summary?.active ? formatNum(summary.health) : "—"} />
            <Metric
              label="MEZO held by treasury"
              value={`${formatNum(Number(snapshot.mezoWei) / 1e18, 2)} MEZO`}
            />
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
                    placeholder="0.00"
                    maxLength={14}
                    aria-invalid={!!repayIssue}
                    aria-describedby={repayIssue ? "repay-musd-error" : undefined}
                    value={repayAmount}
                    onChange={(e) => setRepayAmount(sanitizeDecimal(e.target.value, 2))}
                    className={cn(
                      "tabular",
                      repayIssue && "border-destructive focus-visible:ring-destructive",
                    )}
                  />
                  <FieldError id="repay-musd-error">{repayIssue}</FieldError>
                </div>
                <Button
                  onClick={() => void repay()}
                  disabled={busy || !repayAmount || !!repayIssue || !connected}
                >
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
                Repayments are recorded after 3 confirmations.
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
                    placeholder="0.00000000"
                    maxLength={20}
                    aria-invalid={!!collateralIssue}
                    aria-describedby={collateralIssue ? "trove-coll-error" : undefined}
                    value={collateral}
                    onChange={(e) => setCollateral(sanitizeDecimal(e.target.value, 8))}
                    className={cn(
                      "tabular",
                      collateralIssue && "border-destructive focus-visible:ring-destructive",
                    )}
                  />
                  <FieldError id="trove-coll-error">{collateralIssue}</FieldError>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="trove-borrow">MUSD to borrow</Label>
                  <Input
                    id="trove-borrow"
                    inputMode="decimal"
                    placeholder="0.00"
                    maxLength={14}
                    aria-invalid={!!borrowIssue}
                    aria-describedby={borrowIssue ? "trove-borrow-error" : undefined}
                    value={borrow}
                    onChange={(e) => setBorrow(sanitizeDecimal(e.target.value, 2))}
                    className={cn(
                      "tabular",
                      borrowIssue && "border-destructive focus-visible:ring-destructive",
                    )}
                  />
                  <FieldError id="trove-borrow-error">{borrowIssue}</FieldError>
                </div>
              </div>
              <Button
                onClick={() => void open()}
                disabled={busy || !connected || !mezoOk || !!collateralIssue || !!borrowIssue}
              >
                {busy ? <Loader2 className="animate-spin" /> : <Landmark />} Open trove on Mezo
                Testnet
              </Button>
              {!mezoOk && (
                <p className="text-xs text-warning">
                  KinVault policy (not a Mezo protocol rule): the treasury must hold at least 1 MEZO
                  to borrow through KinVault. Get test MEZO from the Mezo faucet, then refresh.
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Mezo requires at least {formatNum(Number(snapshot.params.minNetDebt) / 1e18, 0)}{" "}
                MUSD of net debt, plus{" "}
                {formatNum(Number(snapshot.params.gasCompensation) / 1e18, 0)} MUSD of gas
                compensation added to the trove's debt. Trove opens are recorded after 3
                confirmations.
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
