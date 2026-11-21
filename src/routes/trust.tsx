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
import { FieldError } from "@/components/ui/field-error";
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
import {
  MAX_MUSD,
  amountError,
  dateError,
  parseDecimal,
  sanitizeDecimal,
  textError,
} from "@/lib/input-validation";
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
  const isLive = state.mode === "live";
  const available = isLive ? state.vault.musd : acting.musd;
  const amountIssue = amount.trim()
    ? (amountError(amount, {
        label: "an amount",
        decimals: 2,
        max: available,
        maxLabel: `Only ${usd(available)} is available to add`,
      }) ?? (available <= 0 ? "There is nothing available to add" : null))
    : null;

  function contribute() {
    if (amountIssue) {
      toast.error(amountIssue);
      return;
    }
    const r = actions.contributeLockbox(lb.id, parseDecimal(amount) ?? 0);
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
            <div className="flex items-start gap-2">
              <div className="flex-1 space-y-2">
                <Input
                  inputMode="decimal"
                  placeholder={
                    isLive ? "Add from the treasury" : `Add from ${acting.name}'s account`
                  }
                  maxLength={14}
                  aria-invalid={!!amountIssue}
                  aria-describedby={amountIssue ? `lb-${lb.id}-amount-error` : undefined}
                  value={amount}
                  onChange={(e) => setAmount(sanitizeDecimal(e.target.value, 2))}
                  className={cn(
                    "h-10 rounded-xl tabular",
                    amountIssue && "border-destructive focus-visible:ring-destructive",
                  )}
                />
                <FieldError id={`lb-${lb.id}-amount-error`}>{amountIssue}</FieldError>
              </div>
              <Button variant="mint" onClick={contribute} disabled={!!amountIssue || !amount}>
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
  const todayIso = useVault((s) => s.today).slice(0, 10);
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

  const nameIssue = form.name.trim() ? textError(form.name, { label: "a name", max: 80 }) : null;
  const goalIssue = form.goal.trim()
    ? amountError(form.goal, { label: "a goal", decimals: 2, max: MAX_MUSD })
    : null;
  const dateIssue = form.unlockDate ? dateError(form.unlockDate, { min: todayIso }) : null;
  const milestoneIssue = form.milestone.trim()
    ? textError(form.milestone, { label: "a milestone", max: 80 })
    : null;
  const titleIssue = form.letterTitle.trim()
    ? textError(form.letterTitle, { label: "a letter title", max: 120 })
    : null;
  const bodyIssue = textError(form.letterBody, { label: "a letter", max: 4000, required: false });
  const missing =
    !form.name.trim() ||
    !form.goal.trim() ||
    !form.unlockDate ||
    !form.milestone.trim() ||
    !form.letterTitle.trim() ||
    !form.beneficiaryId;
  const invalid =
    missing ||
    !!nameIssue ||
    !!goalIssue ||
    !!dateIssue ||
    !!milestoneIssue ||
    !!titleIssue ||
    !!bodyIssue;

  function submit() {
    if (invalid) {
      toast.error(
        nameIssue ??
          goalIssue ??
          dateIssue ??
          milestoneIssue ??
          titleIssue ??
          bodyIssue ??
          "Fill in the lockbox details",
      );
      return;
    }
    const r = actions.createLockbox({ ...form, goal: parseDecimal(form.goal) ?? 0 });
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
              maxLength={80}
              aria-invalid={!!nameIssue}
              aria-describedby={nameIssue ? "lb-name-error" : undefined}
              value={form.name}
              onChange={up("name")}
              className={cn(
                "h-11 rounded-xl",
                nameIssue && "border-destructive focus-visible:ring-destructive",
              )}
            />
            <FieldError id="lb-name-error">{nameIssue}</FieldError>
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
                maxLength={14}
                aria-invalid={!!goalIssue}
                aria-describedby={goalIssue ? "lb-goal-error" : undefined}
                value={form.goal}
                onChange={(e) => setForm({ ...form, goal: sanitizeDecimal(e.target.value, 2) })}
                className={cn(
                  "h-11 rounded-xl tabular",
                  goalIssue && "border-destructive focus-visible:ring-destructive",
                )}
              />
              <FieldError id="lb-goal-error">{goalIssue}</FieldError>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="lb-date">Unlock date</Label>
              <Input
                id="lb-date"
                type="date"
                min={todayIso}
                aria-invalid={!!dateIssue}
                aria-describedby={dateIssue ? "lb-date-error" : undefined}
                value={form.unlockDate}
                onChange={up("unlockDate")}
                className={cn(
                  "h-11 rounded-xl",
                  dateIssue && "border-destructive focus-visible:ring-destructive",
                )}
              />
              <FieldError id="lb-date-error">{dateIssue}</FieldError>
            </div>
            <div className="space-y-2">
              <Label htmlFor="lb-ms">Milestone</Label>
              <Input
                id="lb-ms"
                placeholder="21st birthday"
                maxLength={80}
                aria-invalid={!!milestoneIssue}
                aria-describedby={milestoneIssue ? "lb-ms-error" : undefined}
                value={form.milestone}
                onChange={up("milestone")}
                className={cn(
                  "h-11 rounded-xl",
                  milestoneIssue && "border-destructive focus-visible:ring-destructive",
                )}
              />
              <FieldError id="lb-ms-error">{milestoneIssue}</FieldError>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="lb-lt">Letter title</Label>
            <Input
              id="lb-lt"
              placeholder="Open this when…"
              maxLength={120}
              aria-invalid={!!titleIssue}
              aria-describedby={titleIssue ? "lb-lt-error" : undefined}
              value={form.letterTitle}
              onChange={up("letterTitle")}
              className={cn(
                "h-11 rounded-xl",
                titleIssue && "border-destructive focus-visible:ring-destructive",
              )}
            />
            <FieldError id="lb-lt-error">{titleIssue}</FieldError>
          </div>
          <div className="space-y-2">
            <Label htmlFor="lb-lb">Your letter</Label>
            <Textarea
              id="lb-lb"
              rows={4}
              placeholder="Write something they'll read on the big day…"
              maxLength={4000}
              aria-invalid={!!bodyIssue}
              aria-describedby={bodyIssue ? "lb-lb-error" : undefined}
              value={form.letterBody}
              onChange={up("letterBody")}
              className={cn(
                "rounded-xl",
                bodyIssue && "border-destructive focus-visible:ring-destructive",
              )}
            />
            <FieldError id="lb-lb-error">{bodyIssue}</FieldError>
          </div>
        </div>
        <DialogFooter>
          <Button size="lg" className="w-full" onClick={submit} disabled={invalid}>
            <Lock /> Seal lockbox
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
