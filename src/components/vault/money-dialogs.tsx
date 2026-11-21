import { useState, type ReactNode } from "react";
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
import { cn } from "@/lib/utils";
import { btc, usd } from "@/lib/format";
import {
  MAX_BTC,
  MAX_MUSD,
  amountError,
  parseDecimal,
  sanitizeDecimal,
  textError,
} from "@/lib/input-validation";
import { NO_ALLOWANCE, canApprove, routeExpense, spentToday } from "@/lib/vault-logic";
import {
  CATEGORIES,
  actions,
  memberById,
  useVault,
  type Asset,
  type Category,
} from "@/lib/vault-store";

function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="grid grid-flow-col gap-1 rounded-xl bg-surface p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-lg px-3 py-2 text-sm font-semibold transition-colors",
            value === o.value
              ? "bg-card text-foreground shadow-soft"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function MemberSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const members = useVault((s) => s.members);
  return (
    <Select value={value} onValueChange={onChange}>
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
  );
}

export function MoneyDialog({
  mode,
  trigger,
  defaultMemberId,
}: {
  mode: "deposit" | "withdraw";
  trigger: ReactNode;
  defaultMemberId?: string;
}) {
  const actingId = useVault((s) => s.actingId);
  const [open, setOpen] = useState(false);
  const [memberId, setMemberId] = useState(defaultMemberId ?? actingId);
  const [asset, setAsset] = useState<Asset>("MUSD");
  const [target, setTarget] = useState<"vault" | "sub">("vault");
  const [amount, setAmount] = useState("");
  const price = useVault((s) => s.btcPrice);
  const member = useVault((s) => memberById(s, memberId));
  const vault = useVault((s) => s.vault);

  const n = parseDecimal(amount) ?? 0;
  const decimals = asset === "BTC" ? 8 : 2;
  const available =
    mode === "withdraw"
      ? target === "vault"
        ? asset === "BTC"
          ? vault.btc - vault.btcLocked
          : vault.musd
        : asset === "BTC"
          ? member.btc
          : member.musd
      : null;
  const amountIssue =
    amountError(amount, {
      label: "an amount",
      decimals,
      max: asset === "BTC" ? MAX_BTC : MAX_MUSD,
    }) ??
    (mode === "withdraw" && available !== null
      ? available <= 0
        ? "Nothing is available to withdraw"
        : n > available
          ? `You only have ${asset === "BTC" ? btc(available) : usd(available)}`
          : null
      : null);
  const showIssue = amount.trim().length > 0 && !!amountIssue;

  function submit() {
    if (amountIssue) return;
    const r =
      mode === "deposit"
        ? actions.deposit({ memberId, asset, amount: n, to: target })
        : actions.withdraw({ memberId, asset, amount: n, from: target });
    if (r.ok) {
      toast.success(r.message, {
        description: `${member.name} · ${asset === "BTC" ? btc(n) : usd(n)}`,
      });
      setOpen(false);
      setAmount("");
    } else toast.error(r.message);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setMemberId(defaultMemberId ?? actingId);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">
            {mode === "deposit" ? "Deposit funds" : "Withdraw funds"}
          </DialogTitle>
          <DialogDescription>
            {mode === "deposit"
              ? "Add BTC or MUSD to the shared Family Vault or a personal sub-account."
              : "Move BTC or MUSD out to a family member's wallet."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Family member</Label>
            <MemberSelect value={memberId} onChange={setMemberId} />
          </div>
          <div className="space-y-2">
            <Label>Asset</Label>
            <Segmented
              value={asset}
              onChange={setAsset}
              options={[
                { value: "MUSD", label: "MUSD" },
                { value: "BTC", label: "Bitcoin" },
              ]}
            />
          </div>
          <div className="space-y-2">
            <Label>{mode === "deposit" ? "Deposit into" : "Withdraw from"}</Label>
            <Segmented
              value={target}
              onChange={setTarget}
              options={[
                { value: "vault", label: "Family Vault" },
                { value: "sub", label: `${member.name}'s account` },
              ]}
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="amt">Amount</Label>
              {available !== null && (
                <button
                  type="button"
                  className="text-xs font-semibold text-primary"
                  onClick={() =>
                    setAmount(String(Number(available.toFixed(asset === "BTC" ? 4 : 2))))
                  }
                >
                  Available: {asset === "BTC" ? btc(available) : usd(available)}
                </button>
              )}
            </div>
            <div className="relative">
              <Input
                id="amt"
                inputMode="decimal"
                placeholder="0.00"
                maxLength={16}
                aria-invalid={showIssue}
                aria-describedby={showIssue ? "amt-error" : undefined}
                value={amount}
                onChange={(e) => setAmount(sanitizeDecimal(e.target.value, decimals))}
                className={cn(
                  "h-12 rounded-xl pr-16 text-lg font-semibold tabular",
                  showIssue && "border-destructive focus-visible:ring-destructive",
                )}
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">
                {asset}
              </span>
            </div>
            <FieldError id="amt-error">{showIssue ? amountIssue : null}</FieldError>
            {asset === "BTC" && n > 0 && !showIssue && (
              <p className="text-xs text-muted-foreground">≈ {usd(n * price)} at today's price</p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button
            size="lg"
            className="w-full"
            onClick={submit}
            disabled={!!amountIssue || !(n > 0)}
          >
            {mode === "deposit" ? "Confirm deposit" : "Confirm withdrawal"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ExpenseDialog({ trigger }: { trigger: ReactNode }) {
  const actingId = useVault((s) => s.actingId);
  const isLive = useVault((s) => s.mode === "live");
  const members = useVault((s) => s.members);
  const expenses = useVault((s) => s.expenses);
  const freeze = useVault((s) => s.freeze);
  const allowances = useVault((s) => s.allowances);
  const autoLimit = useVault((s) => s.autoApproveLimit ?? 0);
  const [open, setOpen] = useState(false);
  const me = useVault((s) => memberById(s, actingId));
  const [category, setCategory] = useState<Category>("Groceries");
  const [merchant, setMerchant] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  // Guardians who could sign this request. The requester can't approve their
  // own expense, so they never appear here.
  const candidates = members.filter((m) => canApprove(m.role) && m.id !== actingId);
  const [approverIds, setApproverIds] = useState<string[]>([]);
  const n = parseDecimal(amount) ?? 0;
  const merchantIssue = merchant.trim()
    ? textError(merchant, { label: "where the money was spent", max: 80 })
    : null;
  const amountIssue = amount.trim()
    ? amountError(amount, { label: "an amount", decimals: 2, max: MAX_MUSD })
    : null;
  // Preview the same rule the engine will apply, so the dialog only asks for
  // approvers when the expense actually needs them.
  const preview =
    n > 0
      ? routeExpense({
          amount: n,
          category,
          frozen: freeze.frozen,
          spentToday: spentToday(expenses, actingId, new Date()),
          allowance: allowances[actingId] ?? NO_ALLOWANCE,
          autoApproveLimit: autoLimit,
        })
      : null;
  const instant = preview?.route === "instant";
  const blocked = preview?.route === "blocked";
  const showApprovers = !instant;

  function reset() {
    setMerchant("");
    setAmount("");
    setNote("");
    setApproverIds([]);
  }

  function toggleApprover(id: string) {
    setApproverIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  function submit() {
    if (merchantIssue || amountIssue) return;
    const r = actions.addExpense({
      category,
      merchant,
      amount: n,
      note,
      approverIds,
    });
    if (r.ok) {
      toast.success(r.message);
      setOpen(false);
      reset();
    } else toast.error(r.message);
  }

  const canSubmit =
    n > 0 &&
    !merchantIssue &&
    !amountIssue &&
    !!merchant.trim() &&
    !blocked &&
    (!showApprovers || approverIds.length > 0);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setApproverIds([]);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">Log an expense</DialogTitle>
          <DialogDescription>
            {instant
              ? isLive
                ? "Under the admin's auto-approval limit — approved without a signature, then the treasury settles it with a verified Mezo Testnet transfer."
                : "Under the admin's auto-approval limit — the shared vault pays it without a signature."
              : isLive
                ? "Your chosen family members approve it here, then the treasury settles it with a verified Mezo Testnet transfer."
                : "Your chosen family members approve it before the shared vault pays."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Spent by</Label>
              <div className="flex h-11 items-center rounded-xl border border-input bg-muted px-3 text-sm font-semibold">
                {me?.name ?? "You"}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as Category)}>
                <SelectTrigger className="h-11 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="merchant">Where</Label>
            <Input
              id="merchant"
              placeholder="e.g. Whole Foods Market"
              maxLength={80}
              aria-invalid={!!merchantIssue}
              aria-describedby={merchantIssue ? "merchant-error" : undefined}
              value={merchant}
              onChange={(e) => setMerchant(e.target.value)}
              className={cn(
                "h-11 rounded-xl",
                merchantIssue && "border-destructive focus-visible:ring-destructive",
              )}
            />
            <FieldError id="merchant-error">{merchantIssue}</FieldError>
          </div>
          <div className="space-y-2">
            <Label htmlFor="exp-amt">Amount (MUSD)</Label>
            <Input
              id="exp-amt"
              inputMode="decimal"
              placeholder="0.00"
              maxLength={14}
              aria-invalid={!!amountIssue}
              aria-describedby={amountIssue ? "exp-amt-error" : undefined}
              value={amount}
              onChange={(e) => setAmount(sanitizeDecimal(e.target.value, 2))}
              className={cn(
                "h-12 rounded-xl text-lg font-semibold tabular",
                amountIssue && "border-destructive focus-visible:ring-destructive",
              )}
            />
            <FieldError id="exp-amt-error">{amountIssue}</FieldError>
            {n > 0 &&
              !amountIssue &&
              (blocked ? (
                <p className="rounded-lg bg-destructive-soft px-3 py-2 text-xs font-semibold text-destructive">
                  {preview?.route === "blocked" ? preview.reason : "Spending is paused"}
                </p>
              ) : instant ? (
                <p className="rounded-lg bg-mint px-3 py-2 text-xs font-semibold text-mint-foreground">
                  Under the admin&apos;s {usd(autoLimit)} auto-approval limit — no signature needed.
                </p>
              ) : (
                <p className="rounded-lg bg-warning-soft px-3 py-2 text-xs font-semibold text-warning">
                  {preview?.flags?.length
                    ? `${preview.flags[0]} — your chosen approvers must sign.`
                    : autoLimit > 0
                      ? `At or above the ${usd(autoLimit)} limit — your chosen approvers must sign.`
                      : "Every expense needs approval — no instant payouts."}
                </p>
              ))}
          </div>
          {showApprovers && (
            <div className="space-y-2">
              <Label>Who approves?</Label>
              {candidates.length === 0 ? (
                <p className="rounded-lg bg-warning-soft px-3 py-2 text-xs font-semibold text-warning">
                  You&apos;re the only guardian in this family. Add another admin or spouse so
                  someone can approve what you log.
                </p>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2">
                    {candidates.map((m) => {
                      const on = approverIds.includes(m.id);
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => toggleApprover(m.id)}
                          className={cn(
                            "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                            on
                              ? "border-transparent bg-primary text-primary-foreground"
                              : "border-border bg-background text-muted-foreground hover:text-foreground",
                          )}
                        >
                          {m.name}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {approverIds.length === 0
                      ? "Pick at least one family member to approve this expense."
                      : `${approverIds.length === 1 ? "This member approves" : "All of these members must approve"} before anything is paid.`}
                  </p>
                </>
              )}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="note">Receipt note</Label>
            <Textarea
              id="note"
              placeholder="What was it for?"
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="rounded-xl"
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button size="lg" className="w-full" onClick={submit} disabled={!canSubmit}>
            {instant ? (isLive ? "Approve expense" : "Pay from vault") : "Request approval"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AutoApproveDialog({ trigger }: { trigger: ReactNode }) {
  const acting = useVault((s) => memberById(s, s.actingId));
  const limit = useVault((s) => s.autoApproveLimit ?? 0);
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(String(limit));
  const n = parseDecimal(value) ?? 0;
  const limitIssue = amountError(value, {
    label: "a limit",
    decimals: 2,
    max: MAX_MUSD,
    allowZero: true,
  });

  function submit() {
    if (limitIssue) return;
    const r = actions.setAutoApproveLimit(n);
    if (r.ok) {
      toast.success(r.message);
      setOpen(false);
    } else toast.error(r.message);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setValue(String(limit));
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="rounded-2xl sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">Auto-approval limit</DialogTitle>
          <DialogDescription>
            An admin sets the amount below which an expense is paid without a signature. Set it to
            $0 so every expense needs an approver.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="auto-limit">Limit (MUSD)</Label>
          <Input
            id="auto-limit"
            inputMode="decimal"
            placeholder="0.00"
            maxLength={14}
            aria-invalid={!!limitIssue}
            aria-describedby={limitIssue ? "auto-limit-error" : undefined}
            value={value}
            onChange={(e) => setValue(sanitizeDecimal(e.target.value, 2))}
            className={cn(
              "h-12 rounded-xl text-lg font-semibold tabular",
              limitIssue && "border-destructive focus-visible:ring-destructive",
            )}
          />
          <FieldError id="auto-limit-error">{limitIssue}</FieldError>
          <p className="text-xs text-muted-foreground">
            {limitIssue
              ? "Set a limit between $0 and $1,000,000,000."
              : n > 0
                ? `Expenses under ${usd(n)} auto-approve. At ${usd(n)} or above, the approvers you choose must sign.`
                : "Every expense needs at least one approver — nothing is auto-approved."}
          </p>
        </div>
        <DialogFooter>
          <Button
            size="lg"
            className="w-full"
            onClick={submit}
            disabled={!acting || acting.role !== "admin" || !!limitIssue}
          >
            Save limit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
