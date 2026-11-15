import { useState } from "react";
import { toast } from "sonner";

import { WalletLogoStack, WalletSignInDialog } from "@/components/vault/wallet-sign-in";
import { supabase } from "@/integrations/supabase/client";
import { toastError } from "@/lib/errors";

const GOOGLE_G = (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    width="18"
    height="18"
    aria-hidden="true"
  >
    <path
      fill="#4285F4"
      d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"
    />
    <path
      fill="#34A853"
      d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"
    />
    <path
      fill="#FBBC05"
      d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"
    />
    <path
      fill="#EA4335"
      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"
    />
  </svg>
);

/**
 * Not every deployment has the Google provider configured. Asking the project
 * first turns a dead-end redirect into a clear message.
 */
let googleProvider: boolean | undefined;

async function googleAvailable(): Promise<boolean> {
  if (googleProvider !== undefined) return googleProvider;
  try {
    const url = import.meta.env["VITE_SUPABASE_URL"] || process.env["SUPABASE_URL"];
    const key =
      import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] || process.env["SUPABASE_PUBLISHABLE_KEY"];
    const res = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } });
    const body = (await res.json()) as { external?: { google?: boolean } };
    googleProvider = Boolean(body.external?.google);
  } catch {
    googleProvider = false;
  }
  return googleProvider;
}

async function googleSignIn(onDone: () => void) {
  if (!(await googleAvailable())) {
    toast.info("Google sign-in isn't enabled on this deployment", {
      description: "Use your email and password, or a wallet — both work on Mezo Testnet.",
    });
    return;
  }
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.origin + "/auth" },
  });
  if (error) {
    toastError(error, "Sign-in didn't complete");
    return;
  }
  onDone();
}

export function SocialButtons({ onSignedIn }: { onSignedIn: () => void }) {
  const [walletOpen, setWalletOpen] = useState(false);
  return (
    <div className="grid gap-2.5">
      <button
        type="button"
        onClick={() => void googleSignIn(onSignedIn)}
        className="flex h-12 w-full items-center justify-center gap-2.5 rounded-xl border border-google-border bg-google px-3 text-sm font-medium text-google-foreground transition-opacity hover:opacity-90"
      >
        {GOOGLE_G}
        Continue with Google
      </button>
      <button
        type="button"
        onClick={() => setWalletOpen(true)}
        className="flex h-12 w-full items-center justify-center gap-2.5 rounded-xl border border-google-border bg-card px-3 text-sm font-medium text-foreground transition-colors hover:bg-surface"
      >
        <WalletLogoStack />
        Continue with Wallet
      </button>
      <WalletSignInDialog open={walletOpen} onOpenChange={setWalletOpen} onSignedIn={onSignedIn} />
    </div>
  );
}
