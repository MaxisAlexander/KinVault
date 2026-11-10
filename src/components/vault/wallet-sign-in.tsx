import { useEffect, useState, type ComponentType } from "react";
import { ExternalLink, Loader2, ShieldCheck, Wallet } from "lucide-react";
import { toast } from "sonner";
import { generateSiweNonce } from "viem/siwe";
import {
  WalletCoinbase,
  WalletMetamask,
  WalletOkx,
  WalletRabby,
  WalletTrust,
} from "@web3icons/react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useIsMobile } from "@/hooks/use-mobile";
import { buildWalletSignInMessage } from "@/lib/wallet-auth";
import { walletSignIn } from "@/lib/wallet-auth.functions";
import {
  connectWallet,
  getWalletState,
  hasLegacyInjectedWallet,
  signMessage,
  startWalletDiscovery,
  useDiscoveredWallets,
  type DiscoveredWallet,
  type Eip1193,
} from "@/lib/wallet";
import { cn } from "@/lib/utils";

type IconProps = { size?: number; variant?: "branded" | "mono" | "background"; className?: string };

type KnownWallet = {
  rdns: string;
  name: string;
  Icon: ComponentType<IconProps>;
  install: string;
  /** Opens this site inside the wallet's own browser on phones. */
  deepLink: (url: string) => string;
};

const KNOWN_WALLETS: KnownWallet[] = [
  {
    rdns: "io.metamask",
    name: "MetaMask",
    Icon: WalletMetamask,
    install: "https://metamask.io/download/",
    deepLink: (url) => `https://metamask.app.link/dapp/${url.replace(/^https?:\/\//, "")}`,
  },
  {
    rdns: "com.coinbase.wallet",
    name: "Coinbase Wallet",
    Icon: WalletCoinbase,
    install: "https://www.coinbase.com/wallet/downloads",
    deepLink: (url) => `https://go.cb-w.com/dapp?cb_url=${encodeURIComponent(url)}`,
  },
  {
    rdns: "io.rabby",
    name: "Rabby Wallet",
    Icon: WalletRabby,
    install: "https://rabby.io/",
    deepLink: () => "https://rabby.io/",
  },
  {
    rdns: "com.okex.wallet",
    name: "OKX Wallet",
    Icon: WalletOkx,
    install: "https://www.okx.com/web3",
    deepLink: (url) => `okx://wallet/dapp/url?dappUrl=${encodeURIComponent(url)}`,
  },
  {
    rdns: "com.trustwallet.app",
    name: "Trust Wallet",
    Icon: WalletTrust,
    install: "https://trustwallet.com/download",
    deepLink: (url) =>
      `https://link.trustwallet.com/open_url?coin_id=60&url=${encodeURIComponent(url)}`,
  },
];

/** Small row of official wallet logos shown on the "Continue with Wallet" button. */
export function WalletLogoStack() {
  return (
    <span className="flex -space-x-1.5" aria-hidden="true">
      {KNOWN_WALLETS.slice(0, 3).map(({ rdns, Icon }) => (
        <span
          key={rdns}
          className="flex h-6 w-6 items-center justify-center rounded-full border border-border bg-card"
        >
          <Icon size={16} variant="branded" />
        </span>
      ))}
    </span>
  );
}

async function signInWith(provider: Eip1193 | undefined) {
  await connectWallet(provider);
  const w = getWalletState();
  if (w.status !== "connected" || !w.address)
    throw new Error(w.error ?? "Wallet connection was cancelled");

  const message = buildWalletSignInMessage({
    address: w.address,
    chainId: w.chainId ?? 1,
    origin: window.location.origin,
    nonce: generateSiweNonce(),
    issuedAt: new Date(),
  });
  const signature = await signMessage(message);
  const { tokenHash } = await walletSignIn({ data: { message, signature } });
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" });
  if (error) throw error;
}

export function WalletSignInDialog({
  open,
  onOpenChange,
  onSignedIn,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSignedIn: () => void;
}) {
  const discovered = useDiscoveredWallets();
  const isMobile = useIsMobile();
  const [busy, setBusy] = useState<string | null>(null);
  const [legacy, setLegacy] = useState(false);

  useEffect(() => {
    if (!open) return;
    startWalletDiscovery();
    setLegacy(hasLegacyInjectedWallet());
  }, [open]);

  async function run(id: string, provider: Eip1193 | undefined) {
    setBusy(id);
    try {
      await signInWith(provider);
      onOpenChange(false);
      onSignedIn();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Wallet sign-in failed";
      toast.error("Wallet sign-in didn't complete", {
        description: /reject|denied|cancel/i.test(msg)
          ? "The request was cancelled in your wallet."
          : msg,
      });
    } finally {
      setBusy(null);
    }
  }

  const detectedRdns = new Set(discovered.map((d) => d.rdns));
  const notInstalled = KNOWN_WALLETS.filter((k) => !detectedRdns.has(k.rdns));
  const here = typeof window === "undefined" ? "" : window.location.href;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-extrabold">Continue with Wallet</DialogTitle>
          <DialogDescription>
            Pick your wallet, then sign a short message to prove it's yours. Signing is free and
            never moves funds.
          </DialogDescription>
        </DialogHeader>

        {(discovered.length > 0 || legacy) && (
          <div className="grid gap-2">
            <p className="text-xs font-semibold text-muted-foreground">Detected on this device</p>
            {discovered.map((d: DiscoveredWallet) => (
              <WalletRow
                key={d.uuid}
                name={d.name}
                icon={
                  <img src={d.icon} alt="" className="h-7 w-7 rounded-lg" width={28} height={28} />
                }
                badge="Installed"
                busy={busy === d.uuid}
                disabled={busy !== null}
                onClick={() => void run(d.uuid, d.provider)}
              />
            ))}
            {discovered.length === 0 && legacy && (
              <WalletRow
                name="Browser wallet"
                icon={
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-mint text-mint-foreground">
                    <Wallet className="h-4 w-4" />
                  </span>
                }
                badge="Installed"
                busy={busy === "legacy"}
                disabled={busy !== null}
                onClick={() => void run("legacy", undefined)}
              />
            )}
          </div>
        )}

        {notInstalled.length > 0 && (
          <div className="grid gap-2">
            <p className="text-xs font-semibold text-muted-foreground">
              {isMobile ? "Open KinVault in your wallet app" : "Get a wallet"}
            </p>
            {notInstalled.map((k) => (
              <a
                key={k.rdns}
                href={isMobile ? k.deepLink(here) : k.install}
                target={isMobile ? undefined : "_blank"}
                rel="noreferrer"
                className="flex min-h-14 items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5 text-sm font-semibold transition-colors hover:bg-surface"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface">
                  <k.Icon size={24} variant="branded" />
                </span>
                <span className="min-w-0 flex-1 truncate">{k.name}</span>
                <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                  {isMobile ? "Open app" : "Install"} <ExternalLink className="h-3.5 w-3.5" />
                </span>
              </a>
            ))}
          </div>
        )}

        <p className="flex items-start gap-2 rounded-xl bg-mint px-3 py-2.5 text-xs font-medium text-mint-foreground">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          KinVault only asks for a signature. It never sees your recovery phrase and can't move
          funds without your approval.
        </p>
      </DialogContent>
    </Dialog>
  );
}

function WalletRow({
  name,
  icon,
  badge,
  busy,
  disabled,
  onClick,
}: {
  name: string;
  icon: React.ReactNode;
  badge: string;
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex min-h-14 w-full items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5 text-left text-sm font-semibold transition-colors hover:border-primary hover:bg-mint/60 disabled:opacity-60",
      )}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{name}</span>
      {busy ? (
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
      ) : (
        <span className="shrink-0 rounded-full bg-mint px-2 py-0.5 text-[11px] font-bold text-mint-foreground">
          {badge}
        </span>
      )}
    </button>
  );
}
