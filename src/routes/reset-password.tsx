import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldError } from "@/components/ui/field-error";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/vault/logo";
import { toastError } from "@/lib/errors";
import { passwordError } from "@/lib/input-validation";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Choose a new password — KinVault" },
      { name: "description", content: "Set a new password for your KinVault family account." },
      { property: "og:title", content: "Choose a new password — KinVault" },
      {
        property: "og:description",
        content: "Set a new password for your KinVault family account.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPassword,
});

function ResetPassword() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const passwordIssue = password ? passwordError(password) : null;

  useEffect(() => {
    const isRecovery = window.location.hash.includes("type=recovery");
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setReady(true);
    });
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session && isRecovery) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (passwordIssue) {
      toast.error(passwordIssue);
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      toastError(error, "Could not save your password");
      return;
    }
    toast.success("Password updated");
    void navigate({ to: "/dashboard", replace: true });
  }

  return (
    <div className="flex min-h-screen flex-col bg-background px-6 py-8">
      <Link to="/">
        <Logo />
      </Link>
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center">
        <h1 className="text-3xl font-extrabold tracking-tight">Choose a new password</h1>
        {ready ? (
          <form onSubmit={save} className="mt-8 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="pw">New password</Label>
              <Input
                id="pw"
                type="password"
                autoComplete="new-password"
                maxLength={72}
                aria-invalid={!!passwordIssue}
                aria-describedby={passwordIssue ? "pw-error" : undefined}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={cn(
                  "h-11 rounded-xl",
                  passwordIssue && "border-destructive focus-visible:ring-destructive",
                )}
              />
              <FieldError id="pw-error">{passwordIssue}</FieldError>
              {!passwordIssue && (
                <p className="text-xs text-muted-foreground">At least 8 characters.</p>
              )}
            </div>
            <Button
              type="submit"
              size="lg"
              className="w-full"
              disabled={busy || !password || !!passwordIssue}
            >
              {busy && <Loader2 className="animate-spin" />} Save password
            </Button>
          </form>
        ) : (
          <p className="mt-3 text-muted-foreground">
            Open this page from the reset link in your email. Need a new link?{" "}
            <Link to="/auth" search={{ mode: "forgot" }} className="font-semibold text-primary">
              Send another
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
