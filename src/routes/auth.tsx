import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, MailCheck } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SocialButtons } from "@/components/vault/auth-buttons";
import { Logo } from "@/components/vault/logo";
import { supabase } from "@/integrations/supabase/client";
import { safeRedirect } from "@/lib/safe-redirect";
import familyImage from "@/assets/kinvault-family-login.jpg";

const FAMILY_IMAGE_ALT =
  "A grandmother, mother and two kids dropping Bitcoin and MUSD coins into a green KinVault jar at the kitchen table";

const AFTER_AUTH_KEY = "kinvault:after-auth";

export const Route = createFileRoute("/auth")({
  validateSearch: (
    s: Record<string, unknown>,
  ): { mode?: "signup" | "forgot" | undefined; redirect?: string | undefined } => ({
    mode: s["mode"] === "signup" ? "signup" : s["mode"] === "forgot" ? "forgot" : undefined,
    redirect: typeof s["redirect"] === "string" ? s["redirect"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Sign in — KinVault" },
      {
        name: "description",
        content:
          "Sign in or create your KinVault account to set up your family's Bitcoin and MUSD vault.",
      },
      { property: "og:title", content: "Sign in — KinVault" },
      {
        property: "og:description",
        content: "Create your family vault or join one with an invite code.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

const emailSchema = z.string().trim().email("Enter a valid email").max(255);
const passwordSchema = z.string().min(8, "Use at least 8 characters").max(72);

function AuthPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">(search.mode ?? "signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<null | "confirm" | "reset">(null);

  const target = safeRedirect(search.redirect);

  function finish() {
    const stored = sessionStorage.getItem(AFTER_AUTH_KEY);
    sessionStorage.removeItem(AFTER_AUTH_KEY);
    void navigate({ href: safeRedirect(stored ?? target), replace: true });
  }

  // Already signed in (or just returned from Google) — continue.
  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) finish();
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") finish();
    });
    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const em = emailSchema.safeParse(email);
    if (!em.success) {
      toast.error(em.error.issues[0]!.message);
      return;
    }
    if (mode !== "forgot") {
      const pw = passwordSchema.safeParse(password);
      if (!pw.success) {
        toast.error(pw.error.issues[0]!.message);
        return;
      }
    }
    setBusy(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email: em.data, password });
        if (error) throw error;
      } else if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: em.data,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}${target}`,
            data: { display_name: name.trim() || undefined },
          },
        });
        if (error) throw error;
        if (!data.session) setSent("confirm");
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(em.data, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        setSent("reset");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-2">
      <div className="flex min-w-0 flex-col px-4 py-6 sm:px-12 sm:py-8">
        <Link to="/" className="self-start">
          <Logo />
        </Link>
        <div className="relative mx-auto mt-6 w-full max-w-sm overflow-hidden rounded-2xl border border-border shadow-soft sm:max-w-md lg:hidden">
          <img
            src={familyImage}
            alt={FAMILY_IMAGE_ALT}
            width={1152}
            height={1440}
            className="aspect-[16/9] w-full object-cover object-[center_45%]"
          />
          <span className="absolute inset-x-0 bottom-0 h-1 bg-primary" aria-hidden="true" />
        </div>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-8 lg:py-12">
          {sent ? (
            <div className="text-center">
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-mint text-mint-foreground">
                <MailCheck className="h-7 w-7" />
              </span>
              <h1 className="mt-6 text-3xl font-extrabold tracking-tight">Check your email</h1>
              <p className="mt-3 text-muted-foreground">
                {sent === "confirm"
                  ? `We sent a confirmation link to ${email}. Open it to finish creating your account, then set up your family.`
                  : `If an account exists for ${email}, a password reset link is on its way.`}
              </p>
              <Button
                variant="ghost"
                className="mt-6"
                onClick={() => {
                  setSent(null);
                  setMode("signin");
                }}
              >
                Back to sign in
              </Button>
            </div>
          ) : (
            <>
              <h1 className="text-3xl font-extrabold tracking-tight">
                {mode === "signup"
                  ? "Create your account"
                  : mode === "forgot"
                    ? "Reset your password"
                    : "Welcome back"}
              </h1>
              <p className="mt-2 text-muted-foreground">
                {mode === "signup"
                  ? "Then set up your family vault or join one with an invite code."
                  : mode === "forgot"
                    ? "We'll email you a link to choose a new password."
                    : "Sign in to your family's vault."}
              </p>

              {mode !== "forgot" && (
                <>
                  <div className="mt-8">
                    <SocialButtons
                      onSignedIn={() => {
                        sessionStorage.setItem(AFTER_AUTH_KEY, target);
                        finish();
                      }}
                    />
                  </div>
                  <div className="my-6 flex items-center gap-3 text-xs font-semibold text-muted-foreground">
                    <span className="h-px flex-1 bg-border" /> or with email{" "}
                    <span className="h-px flex-1 bg-border" />
                  </div>
                </>
              )}

              <form
                onSubmit={submit}
                className={mode === "forgot" ? "mt-8 space-y-4" : "space-y-4"}
              >
                {mode === "signup" && (
                  <div className="space-y-2">
                    <Label htmlFor="name">Your name</Label>
                    <Input
                      id="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="h-11 rounded-xl"
                      placeholder="e.g. Elena Rivera"
                      maxLength={40}
                    />
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-11 rounded-xl"
                  />
                </div>
                {mode !== "forgot" && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="password">Password</Label>
                      {mode === "signin" && (
                        <button
                          type="button"
                          className="text-xs font-semibold text-primary"
                          onClick={() => setMode("forgot")}
                        >
                          Forgot password?
                        </button>
                      )}
                    </div>
                    <Input
                      id="password"
                      type="password"
                      autoComplete={mode === "signup" ? "new-password" : "current-password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="h-11 rounded-xl"
                    />
                  </div>
                )}
                <Button type="submit" size="lg" className="w-full" disabled={busy}>
                  {busy && <Loader2 className="animate-spin" />}
                  {mode === "signup"
                    ? "Create account"
                    : mode === "forgot"
                      ? "Send reset link"
                      : "Sign in"}
                </Button>
              </form>

              <p className="mt-6 text-center text-sm text-muted-foreground">
                {mode === "signup"
                  ? "Already have an account?"
                  : mode === "forgot"
                    ? "Remembered it?"
                    : "New to KinVault?"}{" "}
                <button
                  type="button"
                  className="font-semibold text-primary"
                  onClick={() =>
                    setMode(mode === "signup" || mode === "forgot" ? "signin" : "signup")
                  }
                >
                  {mode === "signup" || mode === "forgot" ? "Sign in" : "Create an account"}
                </button>
              </p>
              <p className="mt-3 text-center text-xs text-muted-foreground">
                Just looking?{" "}
                <Link to="/dashboard" className="font-semibold text-primary">
                  Try the demo family
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
      <div className="relative hidden overflow-hidden border-l-4 border-primary lg:block">
        <img
          src={familyImage}
          alt={FAMILY_IMAGE_ALT}
          className="absolute inset-0 h-full w-full object-cover object-[center_35%]"
          width={1152}
          height={1440}
        />
        <div className="absolute inset-x-8 bottom-8 rounded-2xl border border-border bg-card/90 p-6 shadow-soft backdrop-blur">
          <p className="text-lg font-bold">
            "Grandma's Sunday Bitcoin now goes straight into Maya's college lockbox."
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            One vault for the whole household — with rules everyone agreed on.
          </p>
        </div>
      </div>
    </div>
  );
}
