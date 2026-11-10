import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Check, Clock, ExternalLink, Plus, ShieldCheck, X, Zap } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { AppShell, PageHeader, Panel } from "@/components/vault/app-shell";
import { MemberAvatar } from "@/components/vault/member-avatar";
import { ExpenseDialog } from "@/components/vault/money-dialogs";
import { PayExpenseButton } from "@/components/vault/onchain-dialogs";
import { explorerTxUrl } from "@/lib/chain/config";
import { shortDateTime, usd } from "@/lib/format";
import { AUTO_APPROVE_LIMIT, REQUIRED_APPROVALS, checkApproval } from "@/lib/vault-logic";
import { CATEGORIES, actions, memberById, useVault, type Category } from "@/lib/vault-store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/spending")({
  head: () => ({
    meta: [
      { title: "Household Spending — KinVault" },
      {
        name: "description",
        content:
          "Track groceries, bills, school fees and more paid from the family vault, with 2-member approvals.",
      },
      { property: "og:title", content: "Household Spending — KinVault" },
      {
        property: "og:description",
        content: "Who spent what, by category, with smart family approval rules.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Spending,
});

const CAT_COLOR: Record<Category, string> = {
  Groceries: "var(--chart-1)",
  Utilities: "var(--chart-3)",
  School: "var(--chart-2)",
  Dining: "var(--chart-5)",
  Healthcare: "var(--chart-4)",
  Home: "var(--chart-6)",
};

const MEMBER_FILL: Record<string, string> = {
  "chart-1": "var(--chart-1)",
  "chart-2": "var(--chart-2)",
  "chart-3": "var(--chart-3)",
  "chart-4": "var(--chart-4)",
  "chart-5": "var(--chart-5)",
  "chart-6": "var(--chart-6)",
};

function Spending() {
  const state = useVault((s) => s);
  const { expenses, members, actingId } = state;
  const isLive = state.mode === "live";
  const acting = memberById(state, actingId);
  const [filter, setFilter] = useState<Category | "All">("All");

  const pending = expenses.filter((e) => e.status === "pending");
  const paid = expenses.filter((e) => e.status === "approved");
  const filtered = useMemo(
    () => expenses.filter((e) => filter === "All" || e.category === filter),
    [expenses, filter],
  );
  const paidFiltered = paid.filter((e) => filter === "All" || e.category === filter);

  const byCategory = CATEGORIES.map((c) => ({
    name: c,
    value: paid.filter((e) => e.category === c).reduce((n, e) => n + e.amount, 0),
  })).filter((c) => c.value > 0);
  const totalPaid = byCategory.reduce((n, c) => n + c.value, 0);

  const byMember = members.map((m) => ({
    name: m.name,
    tone: m.tone,
    value: Number(
      paidFiltered
        .filter((e) => e.memberId === m.id)
        .reduce((n, e) => n + e.amount, 0)
        .toFixed(2),
    ),
  }));

  function act(r: { ok: boolean; message: string }) {
    if (r.ok) toast.success(r.message);
    else toast.error(r.message);
  }

  return (
    <AppShell>
      <PageHeader
        eyebrow="Household spending"
        title="Who spent what"
        subtitle={
          isLive
            ? "Daily life paid from the shared treasury in MUSD — approved here, settled on Mezo Testnet."
            : "Daily life paid from the shared vault in MUSD — with rules everyone agreed on."
        }
        actions={
          <ExpenseDialog
            trigger={
              <Button size="lg">
                <Plus /> Log expense
              </Button>
            }
          />
        }
      />

      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex items-start gap-4 rounded-2xl border border-border bg-card p-5 shadow-soft">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-mint text-mint-foreground">
            <Zap className="h-5 w-5" />
          </span>
          <div>
            <p className="font-bold">Instant under {usd(AUTO_APPROVE_LIMIT, { round: true })}</p>
            <p className="text-sm text-muted-foreground">
              {isLive
                ? "Groceries, a quick lunch, a prescription — approved the moment it's logged, then paid from the treasury on chain."
                : "Groceries, a quick lunch, a prescription — paid the moment it's logged, by anyone in the family."}
            </p>
          </div>
        </div>
        <div className="flex items-start gap-4 rounded-2xl border border-border bg-card p-5 shadow-soft">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-warning-soft text-warning">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div>
            <p className="font-bold">
              {usd(AUTO_APPROVE_LIMIT, { round: true })}+ needs {REQUIRED_APPROVALS} approvals
            </p>
            <p className="text-sm text-muted-foreground">
              Two admins or spouses (not the person asking) sign off before the{" "}
              {isLive ? "treasury sends MUSD on chain" : "vault pays"}.
            </p>
          </div>
        </div>
      </div>

      <Panel
        className="mt-6"
        title={`Waiting for approval (${pending.length})`}
        description={`You're acting as ${acting.name}. Switch member in the top-right to approve as someone else.`}
      >
        {pending.length === 0 ? (
          <p className="rounded-xl bg-surface p-6 text-center text-sm text-muted-foreground">
            Nothing waiting — all caught up.
          </p>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {pending.map((e) => {
              const m = memberById(state, e.memberId);
              const check = checkApproval({
                requesterId: e.memberId,
                approverId: acting.id,
                approverRole: acting.role,
                existingApprovals: e.approvals,
              });
              return (
                <div key={e.id} className="rounded-xl border border-border bg-background p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <MemberAvatar member={m} size="sm" />
                      <div>
                        <p className="font-bold">{e.merchant}</p>
                        <p className="text-xs text-muted-foreground">
                          {m.name} · {e.category} · {shortDateTime(e.date)}
                        </p>
                      </div>
                    </div>
                    <p className="text-lg font-extrabold tabular">{usd(e.amount)}</p>
                  </div>
                  {e.note && (
                    <p className="mt-3 rounded-lg bg-surface px-3 py-2 text-sm">“{e.note}”</p>
                  )}
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <div className="flex -space-x-1.5">
                        {e.approvals.map((id) => (
                          <MemberAvatar key={id} member={memberById(state, id)} size="xs" />
                        ))}
                        {Array.from({
                          length: Math.max(0, REQUIRED_APPROVALS - e.approvals.length),
                        }).map((_, i) => (
                          <span
                            key={i}
                            className="h-6 w-6 rounded-full border-2 border-dashed border-border bg-card"
                          />
                        ))}
                      </div>
                      <span className="flex items-center gap-1 text-xs font-semibold text-muted-foreground">
                        <Clock className="h-3.5 w-3.5" /> {e.approvals.length} of{" "}
                        {REQUIRED_APPROVALS}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => act(actions.rejectExpense(e.id))}
                        disabled={acting.role !== "admin" && acting.role !== "spouse"}
                      >
                        <X /> Decline
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => act(actions.approveExpense(e.id))}
                        disabled={!check.ok}
                        title={check.reason}
                      >
                        <Check /> Approve
                      </Button>
                    </div>
                  </div>
                  {!check.ok && (
                    <p className="mt-2 text-right text-[11px] text-muted-foreground">
                      {check.reason}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel
          title="Where the money goes"
          description={
            isLive
              ? `${usd(totalPaid)} approved for on-chain payment`
              : `${usd(totalPaid)} paid from the vault`
          }
        >
          <div className="flex flex-col items-center gap-6 sm:flex-row">
            <div className="h-52 w-52 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={byCategory}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={60}
                    outerRadius={95}
                    paddingAngle={2}
                    stroke="none"
                  >
                    {byCategory.map((c) => (
                      <Cell
                        key={c.name}
                        fill={CAT_COLOR[c.name]}
                        opacity={filter === "All" || filter === c.name ? 1 : 0.25}
                      />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => usd(v)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="w-full space-y-2">
              {byCategory.map((c) => (
                <li key={c.name}>
                  <button
                    type="button"
                    onClick={() => setFilter(filter === c.name ? "All" : c.name)}
                    className={cn(
                      "flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-surface",
                      filter === c.name && "bg-mint",
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ background: CAT_COLOR[c.name] }}
                      />
                      <span className="font-semibold">{c.name}</span>
                    </span>
                    <span className="tabular text-muted-foreground">
                      {usd(c.value)} · {Math.round((c.value / totalPaid) * 100)}%
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </Panel>

        <Panel
          title="Spending by member"
          description={filter === "All" ? "All categories" : `${filter} only`}
        >
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byMember} margin={{ left: -10, right: 8 }}>
                <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  fontSize={11}
                  tickFormatter={(v) => `$${v}`}
                />
                <Tooltip formatter={(v: number) => usd(v)} cursor={{ fill: "var(--surface)" }} />
                <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                  {byMember.map((m) => (
                    <Cell key={m.name} fill={MEMBER_FILL[m.tone]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <Panel className="mt-6" title="All expenses">
        <div className="-mt-2 mb-4 flex flex-wrap gap-2">
          {(["All", ...CATEGORIES] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setFilter(c)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                filter === c
                  ? "border-transparent bg-primary text-primary-foreground"
                  : "border-border bg-background text-muted-foreground hover:text-foreground",
              )}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-3 font-semibold">Who</th>
                <th className="py-2 pr-3 font-semibold">Where</th>
                <th className="py-2 pr-3 font-semibold">Receipt note</th>
                <th className="py-2 pr-3 font-semibold">Status</th>
                <th className="py-2 text-right font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((e) => {
                const m = memberById(state, e.memberId);
                return (
                  <tr key={e.id}>
                    <td className="py-3 pr-3">
                      <span className="flex items-center gap-2">
                        <MemberAvatar member={m} size="xs" />
                        <span className="font-semibold">{m.name}</span>
                      </span>
                    </td>
                    <td className="py-3 pr-3">
                      <p className="font-semibold">{e.merchant}</p>
                      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ background: CAT_COLOR[e.category] }}
                        />
                        {e.category} · {shortDateTime(e.date)}
                      </p>
                    </td>
                    <td className="max-w-[240px] truncate py-3 pr-3 text-muted-foreground">
                      {e.note || "—"}
                    </td>
                    <td className="py-3 pr-3">
                      <StatusPill status={e.status} auto={e.auto} />
                      {e.onchain ? (
                        <a
                          href={explorerTxUrl(e.onchain.txHash)}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
                        >
                          On-chain <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        <div className="mt-1">
                          <PayExpenseButton expense={e} />
                        </div>
                      )}
                    </td>
                    <td className="py-3 text-right font-bold tabular">{usd(e.amount)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </AppShell>
  );
}

function StatusPill({ status, auto }: { status: string; auto: boolean }) {
  if (status === "pending")
    return (
      <span className="rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-semibold text-warning">
        Pending
      </span>
    );
  if (status === "rejected")
    return (
      <span className="rounded-full bg-destructive-soft px-2 py-0.5 text-[11px] font-semibold text-destructive">
        Declined
      </span>
    );
  return (
    <span className="rounded-full bg-mint px-2 py-0.5 text-[11px] font-semibold text-mint-foreground">
      {auto ? "Auto-approved" : "Approved ×2"}
    </span>
  );
}
