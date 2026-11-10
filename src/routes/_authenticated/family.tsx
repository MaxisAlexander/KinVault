import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Copy, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AppShell } from "@/components/vault/app-shell";
import { vaultQueryKey } from "@/components/vault/vault-session";
import { addMember, regenerateInvite, removeMember } from "@/lib/family.functions";
import { useVault } from "@/lib/vault-store";

export const Route = createFileRoute("/_authenticated/family")({
  head: () => ({
    meta: [
      { title: "Family members — KinVault" },
      {
        name: "description",
        content: "Manage your family vault's six seats, roles and invite codes.",
      },
      { property: "og:title", content: "Family members — KinVault" },
      {
        property: "og:description",
        content: "Invite family members and manage roles in your KinVault.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FamilyPage,
});

type Role = "admin" | "spouse" | "teen" | "kid";

function FamilyPage() {
  const seats = useVault((s) => s.seats);
  const familyName = useVault((s) => s.familyName);
  const mode = useVault((s) => s.mode);
  const qc = useQueryClient();
  const add = useServerFn(addMember);
  const remove = useServerFn(removeMember);
  const regen = useServerFn(regenerateInvite);
  const [draft, setDraft] = useState({ name: "", role: "kid" as Role, age: "" });
  const [busy, setBusy] = useState(false);

  const me = seats.find((s) => s.isMe);
  const isAdmin = me?.role === "admin";
  const refresh = () => qc.invalidateQueries({ queryKey: vaultQueryKey });

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try {
      await fn();
      await refresh();
      toast.success(ok);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell>
      <h1 className="text-3xl font-extrabold tracking-tight">{familyName || "Your family"}</h1>
      <p className="mt-1 text-muted-foreground">
        {seats.length}/6 seats · share each invite code privately with that person.
      </p>
      {mode !== "live" && (
        <p className="mt-4 rounded-xl bg-mint p-3 text-sm text-mint-foreground">
          You're viewing the demo family. Sign in and create your own vault to invite real members.
        </p>
      )}

      <div className="mt-6 divide-y divide-border rounded-2xl border border-border bg-card shadow-soft">
        {seats.map((s) => (
          <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <p className="font-bold">
                {s.name} {s.isMe && <span className="text-xs text-muted-foreground">(you)</span>}
              </p>
              <p className="text-xs capitalize text-muted-foreground">
                {s.role} · age {s.age} · {s.claimed ? "Joined" : "Invite pending"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {!s.claimed && s.inviteCode && (
                <>
                  <code className="rounded-lg bg-muted px-2 py-1 text-sm">{s.inviteCode}</code>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Copy invite code"
                    onClick={() => {
                      void navigator.clipboard.writeText(s.inviteCode!);
                      toast.success("Invite code copied");
                    }}
                  >
                    <Copy />
                  </Button>
                  {isAdmin && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="New invite code"
                      disabled={busy}
                      onClick={() =>
                        run(() => regen({ data: { memberId: s.id } }), "New invite code created")
                      }
                    >
                      <RefreshCw />
                    </Button>
                  )}
                </>
              )}
              {isAdmin && !s.isMe && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove ${s.name}`}
                  disabled={busy}
                  onClick={() =>
                    run(() => remove({ data: { memberId: s.id } }), `${s.name} removed`)
                  }
                >
                  <Trash2 />
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>

      {isAdmin && seats.length < 6 && (
        <form
          className="mt-6 grid gap-2 rounded-2xl border border-border bg-card p-4 sm:grid-cols-[1fr_120px_90px_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            void run(
              () => add({ data: { name: draft.name, role: draft.role, age: Number(draft.age) } }),
              `${draft.name} added`,
            ).then(() => setDraft({ name: "", role: "kid", age: "" }));
          }}
        >
          <Input
            required
            placeholder="Name"
            maxLength={40}
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            className="rounded-xl"
          />
          <select
            aria-label="Role"
            value={draft.role}
            onChange={(e) => setDraft({ ...draft, role: e.target.value as Role })}
            className="rounded-xl border border-input bg-background px-2 text-sm"
          >
            <option value="spouse">Spouse</option>
            <option value="teen">Teen</option>
            <option value="kid">Kid</option>
            <option value="admin">Admin</option>
          </select>
          <Input
            required
            type="number"
            min={0}
            max={120}
            placeholder="Age"
            value={draft.age}
            onChange={(e) => setDraft({ ...draft, age: e.target.value })}
            className="rounded-xl"
          />
          <Button type="submit" disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Plus />} Add member
          </Button>
        </form>
      )}
    </AppShell>
  );
}
