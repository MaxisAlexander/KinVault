import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { CalendarClock, Check, Gift, Lock, Mail, Plus, Unlock } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { AppShell, PageHeader, Panel } from "@/components/vault/app-shell";
import { MemberAvatar } from "@/components/vault/member-avatar";
import { shortDate, usd } from "@/lib/format";
import { REQUIRED_GUARDIAN_SIGNATURES, daysUntil, isMatured } from "@/lib/vault-logic";
import { actions, memberById, useVault, type Lockbox } from "@/lib/vault-store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/trust")({
  head: () => ({
    meta: [
      { title: "Generational Trust — KinVault" },
      {
        name: "description",
        content:
          "Time-locked savings lockboxes for the kids, sealed with letters and released by family guardians.",
      },
      { property: "og:title", content: "Generational Trust — KinVault" },
      {
        property: "og:description",
        content: "Milestone savings like a college fund, with a time-capsule letter inside.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Trust,
});

function Trust() {
  const lockboxes = useVault((s) => s.lockboxes);
  const today = useVault((s) => s.today);
  const isLive = useVault((s) => s.mode === "live");
  const total = lockboxes.filter((l) => l.status === "locked").reduce((n, l) => n + l.balance, 0);

  return (
    <AppShell>
      <PageHeader
        eyebrow="Generational trust"
        title="Savings for the moments that matter"
        subtitle="Lockboxes stay sealed until the milestone date. Then two guardians sign, the funds move to the child, and their letter opens."
        actions={<CreateLockboxDialog />}
      />

      {isLive && (
        <div className="mb-6 rounded-2xl border border-border bg-surface px-5 py-4 text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">Live treasury note:</span> lockboxes are
          earmarks inside the family ledger — the MUSD stays in the treasury wallet. Releasing one
          returns it to the spendable treasury balance; use{" "}
          <span className="font-semibold text-foreground">Withdraw</span> on the dashboard to send
          it to the child's linked wallet on Mezo Testnet.
        </div>
      )}

      <div className="mb-6 flex flex-wrap items-center gap-x-8 gap-y-2 rounded-2xl border border-border bg-card px-6 py-4 shadow-soft">
        <div>
          <p className="text-xs font-semibold text-muted-foreground">Locked for the kids</p>
          <p className="text-2xl font-extrabold tabular">{usd(total, { round: true })}</p>
        </div>
        <div>
          <p className="text-xs font-semibold text-muted-foreground">Lockboxes</p>
          <p className="text-2xl font-extrabold">{lockboxes.length}</p>
        </div>
        <p className="text-sm text-muted-foreground">
          Today: <span className="font-semibold text-foreground">{shortDate(today)}</span>
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {lockboxes.map((lb) => (
          <LockboxCard key={lb.id} lb={lb} />
        ))}
      </div>
    </AppShell>
  );
}

function LockboxCard({ lb }: { lb: Lockbox }) {
  const state = useVault((s) => s);
  const acting = memberById(state, state.actingId);
  const child = memberById(state, lb.beneficiaryId);
  const author = memberById(state, lb.letter.fromId);
  const [amount, setAmount] = useState("");
  const today = new Date(state.today);
  const matured = isMatured(lb.unlockDate, today);
  const days = daysUntil(lb.unlockDate, today);
  const pct = Math.min(100, (lb.balance / lb.goal) * 100);
  const released = lb.status === "released";
  const isGuardian = lb.guardians.includes(acting.id);
  const canRead = released || isGuardian;

  function contribute() {
    const r = actions.contributeLockbox(lb.id, parseFloat(amount) || 0);
    if (r.ok) {
      toast.success(r.message);
      setAmount("");
    } else toast.error(r.message);
  }

  function sign() {
    const r = actions.signLockbox(lb.id);
    if (r.ok) toast.success(r.message);
    else toast.error(r.message);
  }

  return (
    <Panel className="flex flex-col">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <MemberAvatar member={child} size="lg" />
          <div>
            <p className="text-lg font-bold leading-tight">{lb.name}</p>
            <p className="text-xs text-muted-foreground">
              For {child.name} · {lb.milestone}
            </p>
          </div>
        </div>
        <span
          className={cn(
            "flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold",
            released
              ? "bg-mint text-mint-foreground"
              : matured
                ? "bg-warning-soft text-warning"
                : "bg-surface-2 text-muted-foreground",
          )}
        >
          {released ? <Unlock className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
          {released ? "Released" : matured ? "Ready" : "Locked"}
        </span>
      </div>

      <div className="mt-6">
        <div className="flex items-end justify-between">
          <p className="text-3xl font-extrabold tracking-tight tabular">
            {usd(lb.balance, { round: true })}
          </p>
          <p className="text-sm text-muted-foreground">of {usd(lb.goal, { round: true })}</p>
        </div>
        <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-surface">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2 rounded-xl bg-surface px-3 py-2.5 text-sm">
        <CalendarClock className="h-4 w-4 text-primary" />
        {matured ? (
          <span>
            Unlocked on <span className="font-semibold">{shortDate(lb.unlockDate)}</span>
          </span>
        ) : (
          <span>
            <span className="font-bold tabular">{days.toLocaleString()} days</span> until{" "}
            {shortDate(lb.unlockDate)}
          </span>
        )}
      </div>

      <Dialog>
        <DialogTrigger asChild>
          <button
            type="button"
            className="mt-3 flex items-center gap-3 rounded-xl border border-dashed border-border bg-background px-3 py-3 text-left transition-colors hover:border-primary/50"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-bitcoin-soft text-bitcoin">
              <Mail className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">“{lb.letter.title}”</span>
              <span className="block text-xs text-muted-foreground">
                Time-capsule letter from {author.name} ·{" "}
                {canRead ? "tap to read" : "sealed until release"}
              </span>
            </span>
          </button>
        </DialogTrigger>
        <DialogContent className="rounded-2xl sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">{lb.letter.title}</DialogTitle>
            <DialogDescription>
              From {author.name} to {child.name}
            </DialogDescription>
          </DialogHeader>
          {canRead ? (
            <div className="rounded-xl bg-surface p-5">
              <p className="whitespace-pre-line text-[15px] leading-relaxed">
                {lb.letter.body || "(No message written yet.)"}
              </p>
              <p className="mt-4 text-sm font-semibold">— {author.name}</p>
              {!released && (
                <p className="mt-4 text-xs text-muted-foreground">
                  You can read this because you're a guardian. {child.name} will see it on release.
                </p>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 rounded-xl bg-surface p-8 text-center">
              <Lock className="h-8 w-8 text-muted-foreground" />
              <p className="font-semibold">This letter is sealed</p>
              <p className="text-sm text-muted-foreground">
                It opens when the lockbox is released to {child.name}.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <div className="mt-5">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Guardian unlock · {lb.signatures.length}/{REQUIRED_GUARDIAN_SIGNATURES} signed
        </p>
        <div className="flex flex-wrap gap-2">
          {lb.guardians.map((g) => {
            const gm = memberById(state, g);
            const signed = lb.signatures.includes(g);
            return (
              <span
                key={g}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border py-0.5 pl-0.5 pr-2.5 text-xs font-semibold",
                  signed
                    ? "border-transparent bg-mint text-mint-foreground"
                    : "border-border bg-background text-muted-foreground",
                )}
              >
                <MemberAvatar member={gm} size="xs" className="ring-0" />
                {gm.name}
                {signed && <Check className="h-3 w-3" />}
              </span>
            );
          })}
        </div>
      </div>

      <div className="mt-auto space-y-2 pt-6">
        {!released && (
          <>
            <div className="flex gap-2">
              <Input
                inputMode="decimal"
                placeholder={
                  state.mode === "live"
                    ? "Add from the treasury"
                    : `Add from ${acting.name}'s account`
                }
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="h-10 rounded-xl"
              />
              <Button variant="mint" onClick={contribute}>
                <Gift /> Add
              </Button>
            </div>
            <Button
              className="w-full"
              size="lg"
              onClick={sign}
              disabled={!matured || !isGuardian || lb.signatures.includes(acting.id)}
            >
              <Unlock />
              {!matured
                ? `Locked until ${shortDate(lb.unlockDate)}`
                : !isGuardian
                  ? "Guardians only"
                  : lb.signatures.includes(acting.id)
                    ? "You've signed"
                    : `Sign unlock as ${acting.name}`}
            </Button>
          </>
        )}
        {released && (
          <p className="rounded-xl bg-mint px-3 py-3 text-center text-sm font-semibold text-mint-foreground">
            Sent to {child.name}'s account 🎉
          </p>
        )}
      </div>
    </Panel>
  );
}

function CreateLockboxDialog() {
  const members = useVault((s) => s.members);
  const kids = members.filter((m) => m.role === "teen" || m.role === "kid");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    beneficiaryId: kids[0]?.id ?? members[0]?.id ?? "",
    goal: "",
    unlockDate: "",
    milestone: "",
    letterTitle: "",
    letterBody: "",
  });
  const up = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm({ ...form, [k]: e.target.value });

  function submit() {
    const r = actions.createLockbox({ ...form, goal: parseFloat(form.goal) || 0 });
    if (r.ok) {
      toast.success(r.message);
      setOpen(false);
      setForm({
        ...form,
        name: "",
        goal: "",
        unlockDate: "",
        milestone: "",
        letterTitle: "",
        letterBody: "",
      });
    } else toast.error(r.message);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="lg">
          <Plus /> New lockbox
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">Seal a new lockbox</DialogTitle>
          <DialogDescription>
            Funds stay locked until the date, then need two guardian signatures.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="lb-name">Name</Label>
            <Input
              id="lb-name"
              placeholder="e.g. Sam's Gap Year"
              value={form.name}
              onChange={up("name")}
              className="h-11 rounded-xl"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>For</Label>
              <Select
                value={form.beneficiaryId}
                onValueChange={(v) => setForm({ ...form, beneficiaryId: v })}
              >
                <SelectTrigger className="h-11 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {members.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="lb-goal">Goal (MUSD)</Label>
              <Input
                id="lb-goal"
                inputMode="decimal"
                placeholder="10000"
                value={form.goal}
                onChange={up("goal")}
                className="h-11 rounded-xl"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="lb-date">Unlock date</Label>
              <Input
                id="lb-date"
                type="date"
                value={form.unlockDate}
                onChange={up("unlockDate")}
                className="h-11 rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lb-ms">Milestone</Label>
              <Input
                id="lb-ms"
                placeholder="21st birthday"
                value={form.milestone}
                onChange={up("milestone")}
                className="h-11 rounded-xl"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="lb-lt">Letter title</Label>
            <Input
              id="lb-lt"
              placeholder="Open this when…"
              value={form.letterTitle}
              onChange={up("letterTitle")}
              className="h-11 rounded-xl"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lb-lb">Your letter</Label>
            <Textarea
              id="lb-lb"
              rows={4}
              placeholder="Write something they'll read on the big day…"
              value={form.letterBody}
              onChange={up("letterBody")}
              className="rounded-xl"
            />
          </div>
        </div>
        <DialogFooter>
          <Button size="lg" className="w-full" onClick={submit}>
            <Lock /> Seal lockbox
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
