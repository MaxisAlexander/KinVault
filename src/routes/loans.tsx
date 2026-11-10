import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AlertTriangle, Car, HeartPulse, Home, GraduationCap, Landmark } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { AppShell, PageHeader, Panel } from "@/components/vault/app-shell";
import { MemberAvatar } from "@/components/vault/member-avatar";
import { TrovePanel } from "@/components/vault/trove-panel";
import { btc, shortDate, usd } from "@/lib/format";
import {
  ISSUANCE_FEE,
  LOAN_APR,
  MAX_LTV,
  borrowFromLtv,
  debtWithFee,
  healthFactor,
  liquidationPrice,
  riskLevel,
  type RiskLevel,
} from "@/lib/vault-logic";
import { actions, memberById, useVault, type Loan } from "@/lib/vault-store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/loans")({
  head: () => ({
    meta: [
      { title: "Family Loans — KinVault" },
      {
        name: "description",
        content:
          "Borrow MUSD against the family's pooled Bitcoin without selling it. Health factor and liquidation risk at a glance.",
      },
      { property: "og:title", content: "Family Loans — KinVault" },
      {
        property: "og:description",
        content: "Bitcoin-backed MUSD loans for emergencies, repairs and big purchases.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Loans,
});

const PURPOSES = [
  { label: "Emergency medical", icon: HeartPulse },
  { label: "Home repairs", icon: Home },
  { label: "Car purchase", icon: Car },
  { label: "Tuition", icon: GraduationCap },
];

const RISK_STYLE: Record<RiskLevel, { label: string; cls: string }> = {
  safe: { label: "Safe", cls: "bg-mint text-mint-foreground" },
  moderate: { label: "Moderate", cls: "bg-warning-soft text-warning" },
  high: { label: "High risk", cls: "bg-destructive-soft text-destructive" },
  liquidatable: { label: "Liquidation", cls: "bg-destructive text-destructive-foreground" },
};

function hfText(hf: number) {
  return Number.isFinite(hf) ? hf.toFixed(2) : "∞";
}

export function RiskMeter({ hf }: { hf: number }) {
  // Map HF 0.8 → 0%, 3.0 → 100%
  const pos = Number.isFinite(hf) ? Math.max(0, Math.min(1, (hf - 0.8) / 2.2)) : 1;
  return (
    <div>
      <div className="relative h-3 rounded-full bg-gradient-to-r from-destructive via-warning to-primary">
        <span
          className="absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-card bg-foreground shadow-soft transition-all duration-500"
          style={{ left: `${pos * 100}%` }}
        />
      </div>
      <div className="mt-2 flex justify-between text-[11px] font-semibold text-muted-foreground">
        <span>Liquidation</span>
        <span>Moderate</span>
        <span>Safe</span>
      </div>
    </div>
  );
}

function Loans() {
  const state = useVault((s) => s);
  const { vault, btcPrice: price, loans, actingId } = state;
  const acting = memberById(state, actingId);
  const free = Math.max(0, vault.btc - vault.btcLocked);
  const canBorrow = acting.role === "admin" || acting.role === "spouse";
  const isLive = state.mode === "live";

  const [collateral, setCollateral] = useState(0.5);
  const [ltv, setLtv] = useState(0.35);
  const [shock, setShock] = useState(0);
  const [purpose, setPurpose] = useState("Home repairs");

  const col = Math.min(collateral, free);
  const collateralUsd = col * price;
  const borrow = Math.floor(borrowFromLtv(collateralUsd, ltv));
  const debt = debtWithFee(borrow);
  const shockedPrice = price * (1 - shock / 100);
  const hf = healthFactor(col * shockedPrice, debt);
  const risk = riskLevel(hf);
  const liq = liquidationPrice(col, debt);

  function borrowNow() {
    if (isLive) {
      toast.info(
        "Use the Mezo protocol position above to open a real trove through BorrowerOperations",
      );
      return;
    }
    const r = actions.openLoan({ collateralBtc: col, principal: borrow, purpose });
    if (r.ok) toast.success(r.message, { description: `${usd(borrow)} for ${purpose}` });
    else toast.error(r.message);
  }

  const active = loans.filter((l) => l.status === "active");
  const closed = loans.filter((l) => l.status === "repaid");

  return (
    <AppShell>
      <PageHeader
        eyebrow="Bitcoin-backed loans"
        title="Borrow without selling Bitcoin"
        subtitle="Lock part of the family's BTC as collateral and mint MUSD for life's big moments. Repay any time to unlock it."
      />

      <div className="mb-6">
        <TrovePanel />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.25fr_1fr]">
        <Panel
          title="Loan calculator"
          description={`${btc(free)} unlocked BTC available as collateral`}
        >
          <div className="space-y-7">
            <div>
              <p className="mb-2 text-sm font-semibold">What's it for?</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {PURPOSES.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => setPurpose(p.label)}
                    className={cn(
                      "flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-xs font-semibold transition-colors",
                      purpose === p.label
                        ? "border-primary bg-mint text-mint-foreground"
                        : "border-border bg-background text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <p.icon className="h-5 w-5" />
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-3 flex justify-between text-sm">
                <span className="font-semibold">BTC collateral</span>
                <span className="font-bold tabular">
                  {btc(col)}{" "}
                  <span className="font-normal text-muted-foreground">
                    · {usd(collateralUsd, { round: true })}
                  </span>
                </span>
              </div>
              <Slider
                value={[col]}
                min={0}
                max={Math.max(free, 0.0001)}
                step={0.005}
                onValueChange={([v]) => setCollateral(v ?? 0)}
                aria-label="BTC collateral"
              />
            </div>

            <div>
              <div className="mb-3 flex justify-between text-sm">
                <span className="font-semibold">Loan-to-value</span>
                <span className="font-bold tabular">{Math.round(ltv * 100)}%</span>
              </div>
              <Slider
                value={[ltv]}
                min={0.05}
                max={MAX_LTV}
                step={0.01}
                onValueChange={([v]) => setLtv(v ?? 0)}
                aria-label="Loan-to-value"
              />
              <p className="mt-2 text-xs text-muted-foreground">
                Liquidation happens below a 110% collateral ratio. We recommend staying under 50%
                LTV.
              </p>
            </div>

            <div>
              <div className="mb-3 flex justify-between text-sm">
                <span className="font-semibold">Stress test: if BTC drops</span>
                <span className="font-bold tabular">
                  −{shock}%{" "}
                  <span className="font-normal text-muted-foreground">
                    · {usd(shockedPrice, { round: true })}
                  </span>
                </span>
              </div>
              <Slider
                value={[shock]}
                min={0}
                max={70}
                step={1}
                onValueChange={([v]) => setShock(v ?? 0)}
                aria-label="BTC price drop"
              />
            </div>
          </div>
        </Panel>

        <Panel className="flex flex-col">
          <p className="text-sm font-semibold text-muted-foreground">You'll receive</p>
          <p className="mt-1 text-4xl font-extrabold tracking-tight tabular">
            {usd(borrow, { round: true })}
          </p>
          <p className="text-sm text-muted-foreground">
            MUSD, minted straight into the Family Vault
          </p>

          <div className="mt-6 rounded-xl bg-surface p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-semibold">Health factor</span>
              <span className="flex items-center gap-2">
                <span className="text-2xl font-extrabold tabular">{hfText(hf)}</span>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[11px] font-bold",
                    RISK_STYLE[risk].cls,
                  )}
                >
                  {RISK_STYLE[risk].label}
                </span>
              </span>
            </div>
            <RiskMeter hf={hf} />
          </div>

          <dl className="mt-5 space-y-2.5 text-sm">
            <Row label="Liquidation price" value={usd(liq, { round: true })} />
            <Row
              label="Price buffer"
              value={`${Math.max(0, Math.round((1 - liq / price) * 100))}% below today`}
            />
            <Row
              label="Interest"
              value={`${(LOAN_APR * 100).toFixed(0)}% fixed APR · ${usd((debt * LOAN_APR) / 12)}/mo`}
            />
            <Row
              label="Issuance fee"
              value={`${(ISSUANCE_FEE * 100).toFixed(1)}% · ${usd(borrow * ISSUANCE_FEE)}`}
            />
          </dl>

          {risk !== "safe" && borrow > 0 && (
            <p className="mt-4 flex gap-2 rounded-lg bg-warning-soft px-3 py-2 text-xs font-medium text-warning">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Consider more collateral or a lower LTV so a BTC dip doesn't put family Bitcoin at
              risk.
            </p>
          )}

          <div className="mt-auto pt-6">
            <Button
              size="xl"
              className="w-full"
              onClick={borrowNow}
              disabled={!canBorrow || borrow <= 0 || isLive}
            >
              <Landmark />{" "}
              {isLive ? "Use protocol trove above" : `Borrow ${usd(borrow, { round: true })}`}
            </Button>
            {isLive ? (
              <p className="mt-2 text-center text-xs text-muted-foreground">
                Live families borrow through Mezo BorrowerOperations in the protocol panel above.
                This calculator is a preview.
              </p>
            ) : (
              !canBorrow && (
                <p className="mt-2 text-center text-xs text-muted-foreground">
                  Only admins and spouses can open loans. You're acting as {acting.name}.
                </p>
              )
            )}
          </div>
        </Panel>
      </div>

      <h2 className="mb-4 mt-10 text-xl font-bold">Active loans</h2>
      {active.length === 0 ? (
        <p className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          No active loans — all family Bitcoin is unlocked.
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {active.map((l) => (
            <LoanCard key={l.id} loan={l} />
          ))}
        </div>
      )}

      {closed.length > 0 && (
        <>
          <h2 className="mb-4 mt-10 text-xl font-bold">Repaid</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {closed.map((l) => (
              <div
                key={l.id}
                className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3 text-sm"
              >
                <span className="font-semibold">{l.purpose}</span>
                <span className="rounded-full bg-mint px-2 py-0.5 text-[11px] font-semibold text-mint-foreground">
                  Closed
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </AppShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-semibold tabular">{value}</dd>
    </div>
  );
}

function LoanCard({ loan }: { loan: Loan }) {
  const state = useVault((s) => s);
  const price = state.btcPrice;
  const isLive = state.mode === "live";
  const opener = memberById(state, loan.openedBy);
  const [amount, setAmount] = useState("");
  const hf = healthFactor(loan.collateralBtc * price, loan.debt);
  const risk = riskLevel(hf);
  const repaidPct = Math.min(100, Math.max(0, (1 - loan.debt / debtWithFee(loan.principal)) * 100));

  function repay(n: number) {
    if (isLive) {
      toast.info("Repay through Mezo BorrowerOperations in the protocol panel above");
      return;
    }
    const r = actions.repayLoan(loan.id, n);
    if (r.ok) {
      toast.success(r.message);
      setAmount("");
    } else toast.error(r.message);
  }

  return (
    <Panel>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-lg font-bold">{loan.purpose}</p>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <MemberAvatar member={opener} size="xs" /> Opened by {opener.name} ·{" "}
            {shortDate(loan.openedAt)}
          </p>
        </div>
        <span
          className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold", RISK_STYLE[risk].cls)}
        >
          HF {hfText(hf)} · {RISK_STYLE[risk].label}
        </span>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-3 text-sm">
        <div>
          <p className="text-xs text-muted-foreground">Owed</p>
          <p className="font-extrabold tabular">{usd(loan.debt)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Collateral</p>
          <p className="font-extrabold tabular">{btc(loan.collateralBtc)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Liquidates at</p>
          <p className="font-extrabold tabular">
            {usd(liquidationPrice(loan.collateralBtc, loan.debt), { round: true })}
          </p>
        </div>
      </div>

      <div className="mt-4">
        <div className="h-2 overflow-hidden rounded-full bg-surface">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${repaidPct}%` }}
          />
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">{Math.round(repaidPct)}% repaid</p>
      </div>

      <div className="mt-5 flex gap-2">
        {isLive ? (
          <p className="w-full rounded-xl bg-surface px-3 py-2 text-xs text-muted-foreground">
            Repay this trove through Mezo BorrowerOperations in the protocol panel above. Live
            repayments burn MUSD on chain, so the ledger cannot settle them.
          </p>
        ) : (
          <>
            <Input
              inputMode="decimal"
              placeholder="Amount in MUSD"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="h-10 rounded-xl"
            />
            <Button variant="outline" onClick={() => repay(parseFloat(amount) || 0)}>
              Repay
            </Button>
            <Button onClick={() => repay(loan.debt)}>Repay in full</Button>
          </>
        )}
      </div>
    </Panel>
  );
}
