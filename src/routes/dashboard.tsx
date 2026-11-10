import { Link, createFileRoute } from "@tanstack/react-router";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Bitcoin,
  Coins,
  Landmark,
  Sparkles,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { ActivityFeed } from "@/components/vault/activity-feed";
import { AppShell, PageHeader, Panel } from "@/components/vault/app-shell";
import { MemberAvatar, RoleBadge, toneBg } from "@/components/vault/member-avatar";
import { MoneyDialog } from "@/components/vault/money-dialogs";
import { FundVaultDialog, WithdrawDialog } from "@/components/vault/onchain-dialogs";
import { btc, usd } from "@/lib/format";
import { MUSD_SAVINGS_APY } from "@/lib/vault-logic";
import { useVault } from "@/lib/vault-store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Family Dashboard — KinVault" },
      {
        name: "description",
        content: "Pooled family treasury, BTC reserve and all six family members at a glance.",
      },
      { property: "og:title", content: "Family Dashboard — KinVault" },
      {
        property: "og:description",
        content: "See the shared Bitcoin and MUSD vault for the whole household.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

function Stat({
  label,
  value,
  sub,
  icon: Icon,
  tone = "mint",
  live,
}: {
  label: string;
  value: string;
  sub: string;
  icon: typeof Coins;
  tone?: "mint" | "btc";
  live?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-muted-foreground">{label}</span>
        <span
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-xl",
            tone === "btc" ? "bg-bitcoin-soft text-bitcoin" : "bg-mint text-mint-foreground",
          )}
        >
          <Icon className="h-4.5 w-4.5" />
        </span>
      </div>
      <p className="mt-4 text-2xl font-extrabold tracking-tight tabular sm:text-[28px]">{value}</p>
      <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
        {live && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />}
        {sub}
      </p>
    </div>
  );
}

function Dashboard() {
  const vault = useVault((s) => s.vault);
  const price = useVault((s) => s.btcPrice);
  const members = useVault((s) => s.members);
  const loans = useVault((s) => s.loans);
  const mode = useVault((s) => s.mode);
  const familyName = useVault((s) => s.familyName);
  const pendingCount = useVault((s) =>
    s.expenses.reduce((n, e) => n + (e.status === "pending" ? 1 : 0), 0),
  );

  const btcValue = vault.btc * price;
  const debt = loans.filter((l) => l.status === "active").reduce((n, l) => n + l.debt, 0);
  const grossTreasury = btcValue + vault.musd;
  // Pool assets must be net of outstanding debt. Counting gross assets would
  // overstate every member's share when the family has an active loan.
  const treasury = grossTreasury - debt;
  const totalContrib = members.reduce(
    (n, m) => n + m.contributedBtc * price + m.contributedMusd,
    0,
  );

  return (
    <AppShell>
      <PageHeader
        eyebrow={mode === "live" ? `${familyName} Family Vault` : "Rivera Family Vault"}
        title="Good morning, family"
        subtitle="Everything the household owns together — Bitcoin reserve, MUSD for daily life, and what each of you has put in."
        actions={
          mode === "live" ? (
            <>
              <FundVaultDialog
                asset="BTC"
                trigger={
                  <Button variant="outline" size="lg">
                    <ArrowDownLeft /> Fund test BTC
                  </Button>
                }
              />
              <FundVaultDialog
                asset="MUSD"
                trigger={
                  <Button size="lg">
                    <ArrowDownLeft /> Fund MUSD
                  </Button>
                }
              />
              <WithdrawDialog
                trigger={
                  <Button variant="outline" size="lg">
                    <ArrowUpRight /> Withdraw
                  </Button>
                }
              />
            </>
          ) : (
            <>
              <MoneyDialog
                mode="withdraw"
                trigger={
                  <Button variant="outline" size="lg">
                    <ArrowUpRight /> Withdraw
                  </Button>
                }
              />
              <MoneyDialog
                mode="deposit"
                trigger={
                  <Button size="lg">
                    <ArrowDownLeft /> Deposit
                  </Button>
                }
              />
            </>
          )
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Family treasury"
          value={usd(treasury, { round: true })}
          sub={`${usd(grossTreasury, { round: true })} gross · ${usd(debt, { round: true })} debt`}
          icon={Coins}
          live
        />
        <Stat
          label="BTC reserve"
          value={btc(vault.btc)}
          sub={`${usd(btcValue, { round: true })} · ${btc(vault.btcLocked)} backing loans`}
          icon={Bitcoin}
          tone="btc"
        />
        {mode === "live" ? (
          <Stat
            label="MUSD in treasury"
            value={usd(vault.musd, { round: true })}
            sub="Verified on Mezo Testnet · no simulated yield"
            icon={Coins}
            live
          />
        ) : (
          <Stat
            label="Yield earned"
            value={usd(vault.yieldEarned)}
            sub={`${(MUSD_SAVINGS_APY * 100).toFixed(1)}% APY on ${usd(vault.musd, { round: true })} idle MUSD`}
            icon={Sparkles}
            live
          />
        )}
        <Stat
          label="Family loans"
          value={usd(debt, { round: true })}
          sub={`${loans.filter((l) => l.status === "active").length} active · BTC never sold`}
          icon={Landmark}
        />
      </div>

      {pendingCount > 0 && (
        <Link
          to="/spending"
          className="mt-6 flex items-center justify-between rounded-2xl border border-border bg-warning-soft px-5 py-4 text-sm transition-colors hover:border-warning/40"
        >
          <span>
            <span className="font-bold">
              {pendingCount} expense{pendingCount > 1 ? "s" : ""} waiting
            </span>{" "}
            <span className="text-muted-foreground">for 2-member approval</span>
          </span>
          <span className="flex items-center gap-1 font-semibold text-warning">
            Review <ArrowRight className="h-4 w-4" />
          </span>
        </Link>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_380px]">
        <Panel
          title="Family members"
          description="Each member's own sub-account and what they've added to the shared vault."
        >
          <div className="mb-6">
            <div className="flex h-3 overflow-hidden rounded-full bg-surface">
              {members.map((m) => {
                const contribution = m.contributedBtc * price + m.contributedMusd;
                const share = totalContrib > 0 ? contribution / totalContrib : 0;
                return (
                  <div
                    key={m.id}
                    className={toneBg(m.tone)}
                    style={{ width: `${share * 100}%` }}
                    title={m.name}
                  />
                );
              })}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Share of contributions · family debt is allocated pro rata to net positions
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {members.map((m) => {
              const contrib = m.contributedBtc * price + m.contributedMusd;
              const share = totalContrib > 0 ? contrib / totalContrib : 0;
              const netPosition = contrib - debt * share;
              return (
                <div key={m.id} className="rounded-xl border border-border bg-background p-4">
                  <div className="flex items-center gap-3">
                    <MemberAvatar member={m} />
                    <div className="min-w-0">
                      <p className="font-bold leading-tight">{m.name}</p>
                      <div className="mt-1 flex items-center gap-1.5">
                        <RoleBadge role={m.role} />
                        <span className="text-[11px] text-muted-foreground">{m.age} yrs</span>
                      </div>
                    </div>
                  </div>
                  <dl className="mt-4 space-y-1.5 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Sub-account</dt>
                      <dd className="font-semibold tabular">{usd(m.musd)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Own BTC</dt>
                      <dd className="font-semibold tabular">{btc(m.btc)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Put into vault</dt>
                      <dd className="font-semibold tabular text-primary">
                        {usd(contrib, { round: true })}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Net of debt</dt>
                      <dd className="font-semibold tabular">{usd(netPosition, { round: true })}</dd>
                    </div>
                  </dl>
                  {mode === "demo" ? (
                    <MoneyDialog
                      mode="deposit"
                      defaultMemberId={m.id}
                      trigger={
                        <Button variant="mint" size="sm" className="mt-4 w-full">
                          Deposit for {m.name}
                        </Button>
                      }
                    />
                  ) : (
                    <p className="mt-4 rounded-lg bg-surface px-2 py-2 text-center text-[11px] text-muted-foreground">
                      Open a wallet to fund test assets
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel
          title="Live activity"
          description="Every deposit, purchase and approval"
          right={
            <span className="h-2 w-2 animate-pulse rounded-full bg-primary" aria-label="live" />
          }
        >
          <ActivityFeed limit={9} />
        </Panel>
      </div>
    </AppShell>
  );
}
