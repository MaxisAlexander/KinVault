import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, type ReactNode } from "react";
import {
  ArrowRight,
  Check,
  CloudUpload,
  FileCheck2,
  LogOut,
  ShieldAlert,
  Snowflake,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { buildWalletLinkMessage } from "@/lib/chain/wallet-link";
import { linkWallet as linkWalletServer } from "@/lib/family.functions";
import { usd } from "@/lib/format";
import { getWalletState, signMessage } from "@/lib/wallet";
import { REQUIRED_UNFREEZE_SIGNATURES, canFreeze } from "@/lib/vault-logic";
import { actions, memberById, useVault } from "@/lib/vault-store";
import { cn } from "@/lib/utils";
import { LedgerExplorer } from "./ledger-explorer";
import { MemberAvatar, RoleBadge } from "./member-avatar";
import { Logo } from "./logo";
import { NetworkPill, WalletButton } from "./network-status";
import { setDemoPreference, useVaultSession } from "./vault-session";

const NAV = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/spending", label: "Spending" },
  { to: "/loans", label: "Loans" },
  { to: "/trust", label: "Trust" },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const session = useVaultSession();
  const mode = useVault((s) => s.mode);
  const members = useVault((s) => s.members);
  const actingId = useVault((s) => s.actingId);
  const price = useVault((s) => s.btcPrice);
  const prev = useVault((s) => s.prevBtcPrice);
  const acting = useVault((s) => memberById(s, s.actingId));
  const familyName = useVault((s) => s.familyName);
  const syncing = useVault((s) => s.syncing);
  const up = price >= prev;
  const live = session.status === "live";
  const queryClient = useQueryClient();
  const linkWalletFn = useServerFn(linkWalletServer);

  async function linkMyWallet() {
    const wallet = getWalletState();
    if (!wallet.address) {
      toast.error("Connect a wallet first");
      return;
    }
    try {
      const message = buildWalletLinkMessage({
        memberId: actingId,
        address: wallet.address,
        issuedAt: new Date(),
      });
      const signature = await signMessage(message);
      await linkWalletFn({ data: { address: wallet.address, message, signature } });
      await queryClient.invalidateQueries();
      toast.success("Wallet linked to your family seat");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Wallet linking failed");
    }
  }

  useEffect(() => {
    if (mode !== "demo") return;
    const t = setInterval(() => actions.tick(), 3500);
    return () => clearInterval(t);
  }, [mode]);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-5 px-4 sm:px-6">
          <Link to="/" className="shrink-0">
            <Logo />
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {NAV.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                className="rounded-lg px-3 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
                activeProps={{ className: "bg-mint !text-mint-foreground" }}
              >
                {n.label}
              </Link>
            ))}
            {live && (
              <Link
                to="/family"
                className="rounded-lg px-3 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
                activeProps={{ className: "bg-mint !text-mint-foreground" }}
              >
                Family
              </Link>
            )}
          </nav>
          <div className="ml-auto flex items-center gap-2.5">
            <NetworkPill />
            <div className="hidden items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold xl:flex">
              <span className="h-2 w-2 rounded-full bg-bitcoin" />
              BTC
              <span className="tabular">{usd(price, { round: true })}</span>
              {up ? (
                <TrendingUp className="h-3.5 w-3.5 text-primary" />
              ) : (
                <TrendingDown className="h-3.5 w-3.5 text-destructive" />
              )}
            </div>
            <WalletButton onLink={live ? () => void linkMyWallet() : undefined} />
            {live ? (
              <AccountMenu email={session.email} />
            ) : (
              <Select value={actingId} onValueChange={(v) => actions.setActing(v)}>
                <SelectTrigger
                  className="h-11 w-auto gap-2 rounded-full border-border bg-card pl-1.5 pr-3"
                  aria-label="Acting as"
                >
                  <div className="flex items-center gap-2">
                    <MemberAvatar member={acting} size="sm" />
                    <div className="hidden min-w-16 text-left sm:block">
                      <div className="text-[10px] font-medium leading-none text-muted-foreground">
                        Acting as
                      </div>
                      <div className="mt-0.5 text-sm font-bold leading-none">{acting.name}</div>
                    </div>
                  </div>
                  <span className="sr-only">
                    <SelectValue />
                  </span>
                </SelectTrigger>
                <SelectContent align="end">
                  {members.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      <span className="font-semibold">{m.name}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto border-t border-border/60 px-4 py-2 md:hidden">
          {NAV.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className="rounded-lg px-3 py-1.5 text-sm font-semibold text-muted-foreground"
              activeProps={{ className: "bg-mint !text-mint-foreground" }}
            >
              {n.label}
            </Link>
          ))}
          {live && (
            <Link
              to="/family"
              className="rounded-lg px-3 py-1.5 text-sm font-semibold text-muted-foreground"
              activeProps={{ className: "bg-mint !text-mint-foreground" }}
            >
              Family
            </Link>
          )}
        </nav>
      </header>

      <div className="border-b border-border/60 bg-surface">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-xs text-muted-foreground sm:px-6">
          {session.status === "resolving" ? (
            <Skeleton className="h-4 w-64" />
          ) : (
            <>
              <span className="font-semibold text-foreground">{acting.name}</span>
              <RoleBadge role={acting.role} />
              <span className="hidden sm:inline">
                {acting.role === "admin" || acting.role === "spouse"
                  ? "can approve expenses, borrow and sign lockbox unlocks"
                  : "can spend under $100 within their allowance — bigger buys need 2 approvals"}
              </span>
              <span className="ml-auto flex items-center gap-3">
                {live ? (
                  <span className="flex items-center gap-1.5 font-semibold text-foreground">
                    {syncing > 0 ? (
                      <>
                        <CloudUpload className="h-3.5 w-3.5 animate-pulse text-primary" /> Saving…
                      </>
                    ) : (
                      <>
                        <Check className="h-3.5 w-3.5 text-primary" /> {familyName} family · saved
                      </>
                    )}
                  </span>
                ) : (
                  <DemoNotice signedIn={session.signedIn} />
                )}
                <LedgerExplorer
                  trigger={
                    <button
                      type="button"
                      className="flex items-center gap-1 font-semibold text-primary hover:underline"
                    >
                      <FileCheck2 className="h-3.5 w-3.5" /> Receipts
                    </button>
                  }
                />
              </span>
            </>
          )}
        </div>
      </div>

      {session.status !== "resolving" && <FreezeBanner />}

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
        {session.status === "resolving" ? <ShellSkeleton /> : children}
      </main>
    </div>
  );
}

function DemoNotice({ signedIn }: { signedIn: boolean }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  if (signedIn)
    return (
      <button
        type="button"
        className="flex items-center gap-1 font-semibold text-primary hover:underline"
        onClick={() => {
          setDemoPreference(false);
          void queryClient.invalidateQueries();
          window.location.assign("/dashboard");
        }}
      >
        Demo family · back to my family <ArrowRight className="h-3.5 w-3.5" />
      </button>
    );
  return (
    <button
      type="button"
      onClick={() => navigate({ to: "/auth", search: { mode: "signup" } })}
      className="flex items-center gap-1 font-semibold text-primary hover:underline"
    >
      Sample data · create your own family vault <ArrowRight className="h-3.5 w-3.5" />
    </button>
  );
}

function AccountMenu({ email }: { email: string | null }) {
  const acting = useVault((s) => memberById(s, s.actingId));
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    actions.enterDemo();
    void navigate({ to: "/auth", replace: true });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex h-11 items-center gap-2 rounded-full border border-border bg-card pl-1.5 pr-3"
          aria-label="Account"
        >
          <MemberAvatar member={acting} size="sm" />
          <div className="hidden min-w-16 text-left sm:block">
            <div className="text-[10px] font-medium leading-none text-muted-foreground">
              Signed in
            </div>
            <div className="mt-0.5 text-sm font-bold leading-none">{acting.name}</div>
          </div>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60 rounded-xl">
        <DropdownMenuLabel className="truncate text-xs font-medium text-muted-foreground">
          {email}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate({ to: "/family" })}>
          <Users /> Family & invites
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            setDemoPreference(true);
            window.location.assign("/dashboard");
          }}
        >
          <ArrowRight /> View the demo family
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void signOut()}>
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function FreezeBanner() {
  const freeze = useVault((s) => s.freeze);
  const acting = useVault((s) => memberById(s, s.actingId));
  const frozenBy = useVault((s) => memberById(s, s.freeze.frozenBy ?? ""));
  if (!freeze.frozen) return null;
  const signed = freeze.unfreezeSignatures.includes(acting.id);
  return (
    <div className="border-b border-destructive/30 bg-destructive-soft">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3 text-sm sm:px-6">
        <Snowflake className="h-5 w-5 text-destructive" />
        <p className="flex-1">
          <span className="font-bold text-destructive">Vault frozen</span>{" "}
          <span className="text-muted-foreground">
            by {frozenBy.name} · {freeze.reason}. Withdrawals, loans, payouts and approvals are
            paused until {REQUIRED_UNFREEZE_SIGNATURES} guardians sign (
            {freeze.unfreezeSignatures.length} of {REQUIRED_UNFREEZE_SIGNATURES}).
          </span>
        </p>
        {canFreeze(acting.role) && (
          <Button
            size="sm"
            variant="outline"
            disabled={signed}
            onClick={() => {
              const r = actions.signUnfreeze();
              if (r.ok) toast.success(r.message);
              else toast.error(r.message);
            }}
          >
            <ShieldAlert /> {signed ? "You've signed" : "Sign to unfreeze"}
          </Button>
        )}
      </div>
    </div>
  );
}

function ShellSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading your family vault">
      <Skeleton className="h-10 w-72" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-32 rounded-2xl" />
        ))}
      </div>
      <Skeleton className={cn("h-80 rounded-2xl")} />
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions: right,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <span className="inline-flex rounded-full bg-mint px-3 py-1 text-xs font-semibold text-mint-foreground">
          {eyebrow}
        </span>
        <h1 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">{title}</h1>
        {subtitle && <p className="mt-2 max-w-2xl text-muted-foreground">{subtitle}</p>}
      </div>
      {right && <div className="flex flex-wrap gap-2">{right}</div>}
    </div>
  );
}

export function Panel({
  title,
  description,
  right,
  children,
  className,
}: {
  title?: string;
  description?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn("rounded-2xl border border-border bg-card p-5 shadow-soft sm:p-6", className)}
    >
      {(title || right) && (
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            {title && <h2 className="text-lg font-bold">{title}</h2>}
            {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
          </div>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}
