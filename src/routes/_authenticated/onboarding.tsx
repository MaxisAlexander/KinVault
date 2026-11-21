import { useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Loader2, Plus, Trash2, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldError } from "@/components/ui/field-error";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/vault/logo";
import { setDemoPreference, vaultQueryKey } from "@/components/vault/vault-session";
import { toastError } from "@/lib/errors";
import { createFamily, joinFamily, previewInvite } from "@/lib/family.functions";
import { ageError, inviteCodeError, normalizeInviteCode, textError } from "@/lib/input-validation";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/onboarding")({
  head: () => ({
    meta: [
      { title: "Set up your family — KinVault" },
      {
        name: "description",
        content: "Create your family's KinVault or join one with an invite code.",
      },
      { property: "og:title", content: "Set up your family — KinVault" },
      {
        property: "og:description",
        content: "Create a family vault for up to six members, or join with an invite code.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Onboarding,
});

type Role = "admin" | "spouse" | "teen" | "kid";
type Draft = { name: string; role: Role; age: string };

const ROLES: { value: Role; label: string }[] = [
  { value: "admin", label: "Admin" },
  { value: "spouse", label: "Spouse" },
  { value: "teen", label: "Teen" },
  { value: "kid", label: "Kid" },
];

function Onboarding() {
  const [tab, setTab] = useState<"create" | "join">("create");
  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex h-16 max-w-3xl items-center px-4 sm:px-6">
        <Link to="/">
          <Logo />
        </Link>
      </header>
      <main className="mx-auto max-w-3xl px-4 pb-24 pt-8 sm:px-6">
        <h1 className="text-4xl font-extrabold tracking-tight">Set up your family vault</h1>
        <p className="mt-2 text-muted-foreground">
          Start a new vault for up to six family members, or join one you were invited to.
        </p>
        <div className="mt-8 inline-flex rounded-xl border border-border bg-card p-1">
          {(["create", "join"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`rounded-lg px-4 py-2 text-sm font-semibold ${tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
            >
              {t === "create" ? "Create a family" : "Join with a code"}
            </button>
          ))}
        </div>
        <div className="mt-6 rounded-2xl border border-border bg-card p-6 shadow-soft">
          {tab === "create" ? <CreateForm /> : <JoinForm />}
        </div>
      </main>
    </div>
  );
}

function useFinish() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  return async () => {
    setDemoPreference(false);
    await qc.invalidateQueries({ queryKey: vaultQueryKey });
    void navigate({ to: "/dashboard", replace: true });
  };
}

function CreateForm() {
  const create = useServerFn(createFamily);
  const finish = useFinish();
  const [familyName, setFamilyName] = useState("");
  const [me, setMe] = useState({ name: "", age: "" });
  const [members, setMembers] = useState<Draft[]>([{ name: "", role: "spouse", age: "" }]);
  const [busy, setBusy] = useState(false);

  const familyIssue = familyName.trim()
    ? textError(familyName, { label: "a family name", max: 60 })
    : null;
  const meNameIssue = me.name.trim() ? textError(me.name, { label: "your name", max: 40 }) : null;
  const meAgeIssue = me.age ? ageError(me.age, { min: 18, max: 120 }) : null;
  const rowIssues = members.map((m) => ({
    name: m.name.trim() ? textError(m.name, { label: "a name", max: 40 }) : null,
    age: m.age ? ageError(m.age, { min: 0, max: 120 }) : null,
    // A row is either skipped entirely or needs both a name and an age.
    incomplete: !!m.name.trim() !== !!m.age,
  }));
  const rowsValid = rowIssues.every((r) => !r.name && !r.age && !r.incomplete);
  const canSubmit =
    !!familyName.trim() &&
    !!me.name.trim() &&
    !!me.age &&
    !familyIssue &&
    !meNameIssue &&
    !meAgeIssue &&
    rowsValid;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) {
      const badRow = rowIssues.find((r) => r.name || r.age || r.incomplete);
      toast.error(
        familyIssue ??
          meNameIssue ??
          meAgeIssue ??
          badRow?.name ??
          badRow?.age ??
          (badRow
            ? "Each member row needs both a name and an age"
            : "Finish the family details first"),
      );
      return;
    }
    setBusy(true);
    try {
      await create({
        data: {
          familyName: familyName.trim(),
          me: { name: me.name.trim(), age: Number(me.age) },
          members: members
            .filter((m) => m.name.trim())
            .map((m) => ({ name: m.name.trim(), role: m.role, age: Number(m.age) })),
        },
      });
      toast.success("Your family vault is ready");
      await finish();
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="fam">Family name</Label>
        <Input
          id="fam"
          maxLength={60}
          aria-invalid={!!familyIssue}
          aria-describedby={familyIssue ? "fam-error" : undefined}
          value={familyName}
          onChange={(e) => setFamilyName(e.target.value)}
          placeholder="The Rivera Family"
          className={cn(
            "h-11 rounded-xl",
            familyIssue && "border-destructive focus-visible:ring-destructive",
          )}
        />
        <FieldError id="fam-error">{familyIssue}</FieldError>
        <p className="text-xs text-muted-foreground">
          What the household is called on the dashboard, receipts and invite codes — for example
          &ldquo;The Rivera Family&rdquo;. Up to 60 characters.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
        <div className="space-y-2">
          <Label htmlFor="me">Your name (Admin)</Label>
          <Input
            id="me"
            maxLength={40}
            aria-invalid={!!meNameIssue}
            aria-describedby={meNameIssue ? "me-error" : undefined}
            value={me.name}
            onChange={(e) => setMe({ ...me, name: e.target.value })}
            placeholder="e.g. Ana Rivera"
            className={cn(
              "h-11 rounded-xl",
              meNameIssue && "border-destructive focus-visible:ring-destructive",
            )}
          />
          <FieldError id="me-error">{meNameIssue}</FieldError>
          <p className="text-xs text-muted-foreground">
            The seat you claim. As Admin you manage members, roles and invites.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="meage">Age</Label>
          <Input
            id="meage"
            inputMode="numeric"
            maxLength={3}
            aria-invalid={!!meAgeIssue}
            aria-describedby={meAgeIssue ? "meage-error" : undefined}
            value={me.age}
            onChange={(e) => setMe({ ...me, age: e.target.value.replace(/\D/g, "").slice(0, 3) })}
            placeholder="41"
            className={cn(
              "h-11 rounded-xl tabular",
              meAgeIssue && "border-destructive focus-visible:ring-destructive",
            )}
          />
          <FieldError id="meage-error">{meAgeIssue}</FieldError>
          <p className="text-xs text-muted-foreground">18 or over.</p>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-2 text-sm font-bold">
            <Users className="h-4 w-4" /> Family members ({members.length + 1}/6)
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={members.length >= 5}
            onClick={() => setMembers([...members, { name: "", role: "kid", age: "" }])}
          >
            <Plus /> Add member
          </Button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          You plus up to five others. Each one gets a private invite code to claim their seat —
          leave a row blank to skip that seat for now.
        </p>
        <dl className="mt-3 grid gap-x-6 gap-y-1.5 rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground sm:grid-cols-2">
          <div className="flex gap-1.5">
            <dt className="font-semibold text-foreground">Admin</dt>
            <dd>approves spends, manages seats and invites</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="font-semibold text-foreground">Spouse</dt>
            <dd>approves spends and loan requests</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="font-semibold text-foreground">Teen</dt>
            <dd>$50/day, and a guardian they pick must approve</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="font-semibold text-foreground">Kid</dt>
            <dd>$15/day, School and Groceries only</dd>
          </div>
        </dl>
        <div className="mt-4 space-y-3">
          {members.map((m, i) => {
            const row = rowIssues[i] ?? { name: null, age: null, incomplete: false };
            const rowMessage =
              row.name ??
              row.age ??
              (row.incomplete ? (m.name.trim() ? "Add an age" : "Add a name") : null);
            return (
              <div key={i} className="grid grid-cols-[1fr_110px_80px_40px] items-start gap-2">
                <div className="space-y-1">
                  <Input
                    aria-label="Name"
                    placeholder="e.g. Luis Rivera"
                    maxLength={40}
                    aria-invalid={!!(row.name || (row.incomplete && !m.name.trim()))}
                    value={m.name}
                    onChange={(e) =>
                      setMembers(
                        members.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)),
                      )
                    }
                    className={cn(
                      "rounded-xl",
                      (row.name || (row.incomplete && !m.name.trim())) &&
                        "border-destructive focus-visible:ring-destructive",
                    )}
                  />
                </div>
                <select
                  aria-label="Role"
                  value={m.role}
                  onChange={(e) =>
                    setMembers(
                      members.map((x, j) => (j === i ? { ...x, role: e.target.value as Role } : x)),
                    )
                  }
                  className="h-9 rounded-xl border border-input bg-background px-2 text-sm"
                >
                  {ROLES.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
                <div className="space-y-1">
                  <Input
                    aria-label="Age"
                    placeholder="12"
                    inputMode="numeric"
                    maxLength={3}
                    aria-invalid={!!(row.age || (row.incomplete && !!m.name.trim()))}
                    value={m.age}
                    onChange={(e) =>
                      setMembers(
                        members.map((x, j) =>
                          j === i
                            ? { ...x, age: e.target.value.replace(/\D/g, "").slice(0, 3) }
                            : x,
                        ),
                      )
                    }
                    className={cn(
                      "rounded-xl tabular",
                      (row.age || (row.incomplete && !!m.name.trim())) &&
                        "border-destructive focus-visible:ring-destructive",
                    )}
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Remove member"
                  onClick={() => setMembers(members.filter((_, j) => j !== i))}
                >
                  <Trash2 />
                </Button>
                <FieldError className="col-span-4">{rowMessage}</FieldError>
              </div>
            );
          })}
        </div>
      </div>

      <p className="rounded-xl border border-border bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
        <span className="font-semibold text-foreground">What happens next:</span> you land on your
        family dashboard with an empty ledger. Fund it with test BTC or MUSD there, and share each
        invite code from the Family page when someone is ready to claim their seat.
      </p>

      <Button type="submit" size="lg" className="w-full" disabled={busy || !canSubmit}>
        {busy && <Loader2 className="animate-spin" />} Create family vault
      </Button>
    </form>
  );
}

function JoinForm() {
  const preview = useServerFn(previewInvite);
  const join = useServerFn(joinFamily);
  const finish = useFinish();
  const [code, setCode] = useState("");
  const [info, setInfo] = useState<{ familyName: string; seatName: string; role: string } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const codeIssue = code ? inviteCodeError(code) : null;

  async function check(e: React.FormEvent) {
    e.preventDefault();
    if (codeIssue) {
      toast.error(codeIssue);
      return;
    }
    setBusy(true);
    try {
      const res = await preview({ data: { code } });
      if (!res) toast.error("That invite code isn't valid or was already used");
      setInfo(res);
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  }

  async function claim() {
    setBusy(true);
    try {
      await join({ data: { code } });
      toast.success(`Welcome to ${info?.familyName}`);
      await finish();
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  }

  return info ? (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">You were invited to</p>
      <p className="text-2xl font-extrabold">{info.familyName}</p>
      <p>
        Claim the seat for <b>{info.seatName}</b> ({info.role}).
      </p>
      <div className="flex gap-2">
        <Button onClick={claim} disabled={busy}>
          {busy && <Loader2 className="animate-spin" />}
          <UserPlus /> Join family
        </Button>
        <Button variant="ghost" onClick={() => setInfo(null)}>
          Use another code
        </Button>
      </div>
    </div>
  ) : (
    <form onSubmit={check} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="code">Invite code</Label>
        <Input
          id="code"
          maxLength={40}
          aria-invalid={!!codeIssue}
          aria-describedby={codeIssue ? "code-error" : undefined}
          value={code}
          onChange={(e) => setCode(normalizeInviteCode(e.target.value))}
          placeholder="KV-XXXXX-XXXXX"
          className={cn(
            "h-11 rounded-xl font-mono uppercase",
            codeIssue && "border-destructive focus-visible:ring-destructive",
          )}
        />
        <FieldError id="code-error">{codeIssue}</FieldError>
      </div>
      <Button type="submit" disabled={busy || !code || !!codeIssue}>
        {busy && <Loader2 className="animate-spin" />} Check code
      </Button>
    </form>
  );
}
