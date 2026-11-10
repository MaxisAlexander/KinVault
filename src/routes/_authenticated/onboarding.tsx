import { useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Loader2, Plus, Trash2, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/vault/logo";
import { setDemoPreference, vaultQueryKey } from "@/components/vault/vault-session";
import { createFamily, joinFamily, previewInvite } from "@/lib/family.functions";

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

function errMsg(e: unknown) {
  if (e instanceof Error) {
    try {
      const parsed = JSON.parse(e.message);
      if (Array.isArray(parsed) && parsed[0]?.message) return String(parsed[0].message);
    } catch {
      /* plain message */
    }
    return e.message;
  }
  return "Something went wrong";
}

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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await create({
        data: {
          familyName,
          me: { name: me.name, age: Number(me.age) },
          members: members
            .filter((m) => m.name.trim())
            .map((m) => ({ name: m.name, role: m.role, age: Number(m.age) })),
        },
      });
      toast.success("Your family vault is ready");
      await finish();
    } catch (err) {
      toast.error(errMsg(err));
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
          required
          maxLength={60}
          value={familyName}
          onChange={(e) => setFamilyName(e.target.value)}
          placeholder="The Rivera Family"
          className="h-11 rounded-xl"
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
        <div className="space-y-2">
          <Label htmlFor="me">Your name (Admin)</Label>
          <Input
            id="me"
            required
            maxLength={40}
            value={me.name}
            onChange={(e) => setMe({ ...me, name: e.target.value })}
            className="h-11 rounded-xl"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="meage">Age</Label>
          <Input
            id="meage"
            required
            type="number"
            min={18}
            max={120}
            value={me.age}
            onChange={(e) => setMe({ ...me, age: e.target.value })}
            className="h-11 rounded-xl"
          />
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
          Each member gets a private invite code to claim their seat.
        </p>
        <div className="mt-4 space-y-3">
          {members.map((m, i) => (
            <div key={i} className="grid grid-cols-[1fr_110px_80px_40px] gap-2">
              <Input
                aria-label="Name"
                placeholder="Name"
                maxLength={40}
                value={m.name}
                onChange={(e) =>
                  setMembers(members.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))
                }
                className="rounded-xl"
              />
              <select
                aria-label="Role"
                value={m.role}
                onChange={(e) =>
                  setMembers(
                    members.map((x, j) => (j === i ? { ...x, role: e.target.value as Role } : x)),
                  )
                }
                className="rounded-xl border border-input bg-background px-2 text-sm"
              >
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
              <Input
                aria-label="Age"
                placeholder="Age"
                type="number"
                min={0}
                max={120}
                value={m.age}
                onChange={(e) =>
                  setMembers(members.map((x, j) => (j === i ? { ...x, age: e.target.value } : x)))
                }
                className="rounded-xl"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Remove member"
                onClick={() => setMembers(members.filter((_, j) => j !== i))}
              >
                <Trash2 />
              </Button>
            </div>
          ))}
        </div>
      </div>

      <Button type="submit" size="lg" className="w-full" disabled={busy}>
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

  async function check(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await preview({ data: { code } });
      if (!res) toast.error("That invite code isn't valid or was already used");
      setInfo(res);
    } catch (err) {
      toast.error(errMsg(err));
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
      toast.error(errMsg(err));
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
          required
          minLength={4}
          maxLength={40}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="KV-XXXXX-XXXXX"
          className="h-11 rounded-xl font-mono uppercase"
        />
      </div>
      <Button type="submit" disabled={busy}>
        {busy && <Loader2 className="animate-spin" />} Check code
      </Button>
    </form>
  );
}
