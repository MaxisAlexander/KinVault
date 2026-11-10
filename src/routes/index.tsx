import { Link, createFileRoute } from "@tanstack/react-router";
import {
  ArrowRight,
  Bitcoin,
  HeartHandshake,
  Landmark,
  LockKeyhole,
  ShieldCheck,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Logo } from "@/components/vault/logo";
import { MemberAvatar, Pill } from "@/components/vault/member-avatar";
import { useVault } from "@/lib/vault-store";
import { usd } from "@/lib/format";
// Served from public/media so the picture ships with the site wherever it is hosted.
const HERO_IMAGE_PATH = "/media/kinvault-family-hero.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "KinVault — The family vault for Bitcoin & MUSD" },
      {
        name: "description",
        content:
          "Pool Bitcoin and MUSD as a family on Mezo: shared spending with approvals, BTC-backed loans and time-locked savings for the kids.",
      },
      { property: "og:title", content: "KinVault — The family vault for Bitcoin & MUSD" },
      {
        property: "og:description",
        content:
          "Shared household treasury, family loans without selling Bitcoin, and generational lockboxes.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const FEATURES = [
  {
    icon: Users,
    title: "One vault, six people",
    body: "Mom, Dad, Grandma and the kids each get a sub-account — and everyone can top up the shared treasury.",
  },
  {
    icon: ShieldCheck,
    title: "Spending with guardrails",
    body: "Groceries under $100 clear instantly. Anything bigger waits for two family members to approve.",
  },
  {
    icon: Landmark,
    title: "Borrow, don't sell",
    body: "Need a new roof or an emergency fund? Mint MUSD against the family's Bitcoin and keep the stack.",
  },
  {
    icon: LockKeyhole,
    title: "Generational lockboxes",
    body: "Time-locked funds for milestones like Maya's 18th, sealed with a letter and released by guardians.",
  },
];

/** Curved emerald lines that separate the hero photo from the text (vertical on desktop, horizontal on phones). */
function HeroDivider() {
  return (
    <>
      <svg
        className="pointer-events-none absolute inset-y-0 -left-px hidden h-full w-20 lg:block xl:w-24"
        viewBox="0 0 100 1000"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path className="fill-background" d="M0 0H62C20 220 4 400 28 560S86 850 46 1000H0Z" />
        <path
          className="fill-none stroke-primary"
          strokeWidth="4"
          vectorEffect="non-scaling-stroke"
          d="M62 0C20 220 4 400 28 560S86 850 46 1000"
        />
        <path
          className="fill-none stroke-primary/45"
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
          d="M78 0C36 220 20 400 44 560S102 850 62 1000"
        />
      </svg>
      <svg
        className="pointer-events-none absolute inset-x-0 -top-px h-8 w-full sm:h-10 lg:hidden"
        viewBox="0 0 1000 100"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path className="fill-background" d="M0 0V40C220 90 420 10 640 44S900 70 1000 30V0Z" />
        <path
          className="fill-none stroke-primary"
          strokeWidth="3"
          vectorEffect="non-scaling-stroke"
          d="M0 40C220 90 420 10 640 44S900 70 1000 30"
        />
        <path
          className="fill-none stroke-primary/45"
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
          d="M0 58C220 108 420 28 640 62S900 88 1000 48"
        />
      </svg>
    </>
  );
}

function Landing() {
  const members = useVault((s) => s.members);
  const vault = useVault((s) => s.vault);
  const price = useVault((s) => s.btcPrice);

  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex h-16 max-w-[88rem] items-center justify-between gap-3 px-4 sm:px-6 lg:px-10">
        <Link to="/" className="shrink-0">
          <Logo />
        </Link>
        <nav className="hidden items-center gap-6 text-sm font-semibold text-muted-foreground md:flex">
          <Link to="/dashboard" className="hover:text-foreground">
            Dashboard
          </Link>
          <Link to="/spending" className="hover:text-foreground">
            Spending
          </Link>
          <Link to="/loans" className="hover:text-foreground">
            Loans
          </Link>
          <Link to="/trust" className="hover:text-foreground">
            Trust
          </Link>
        </nav>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <Button asChild variant="ghost" className="rounded-xl px-3 sm:px-4">
            <Link to="/auth" search={{ mode: undefined, redirect: undefined }}>
              Sign in
            </Link>
          </Button>
          <Button asChild className="rounded-xl px-3 sm:px-4">
            <Link to="/auth" search={{ mode: "signup", redirect: "/onboarding" }}>
              <span className="sm:hidden">Get started</span>
              <span className="hidden sm:inline">Create family vault</span>
            </Link>
          </Button>
        </div>
      </header>

      <section className="relative overflow-hidden">
        <div className="grid lg:min-h-[min(calc(100svh-4rem),780px)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.12fr)]">
          <div className="flex items-center px-4 pb-10 pt-8 sm:px-6 sm:pb-14 sm:pt-12 lg:hero-inset lg:py-14 lg:pr-8">
            <div className="w-full max-w-xl lg:max-w-[34rem]">
              <Pill className="mb-5">
                <Bitcoin className="h-3.5 w-3.5" /> Powered by Mezo · BTC & MUSD
              </Pill>
              <h1 className="text-[2.6rem] font-extrabold leading-[1.02] tracking-[-0.035em] text-foreground min-[400px]:text-5xl sm:text-6xl xl:text-[4.25rem]">
                The family vault that grows with your household
              </h1>
              <p className="mt-5 text-base leading-relaxed text-foreground/75 sm:text-lg">
                Pool Bitcoin and MUSD, pay for everyday life with approvals that make sense, borrow
                without selling, and lock away savings for the moments that matter.
              </p>
              <div className="mt-8 flex flex-col gap-3 min-[460px]:flex-row min-[460px]:flex-wrap min-[460px]:items-center">
                <Button asChild size="xl">
                  <Link to="/dashboard">
                    Try demo <ArrowRight />
                  </Link>
                </Button>
                <Button asChild size="xl" variant="outline">
                  <Link to="/trust">See the Generational Trust</Link>
                </Button>
              </div>

              <div className="mt-8 grid max-w-md grid-cols-[minmax(0,1fr)_auto] items-center gap-4 rounded-2xl border border-border bg-card px-4 py-4 shadow-soft sm:px-5">
                <div className="flex min-w-0 -space-x-2">
                  {members.map((m) => (
                    <MemberAvatar key={m.id} member={m} size="sm" />
                  ))}
                </div>
                <div className="text-right">
                  <p className="text-xs font-semibold text-muted-foreground">
                    The Rivera family treasury
                  </p>
                  <p className="text-xl font-extrabold tabular">
                    {usd(vault.btc * price + vault.musd, { round: true })}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="relative aspect-[4/3] sm:aspect-[16/10] lg:aspect-auto">
            <img
              src={HERO_IMAGE_PATH}
              alt="A father dropping a Bitcoin coin and a mother dropping a Mezo MUSD coin into a green KinVault jar while the family watches"
              width={1920}
              height={1280}
              fetchPriority="high"
              className="absolute inset-0 h-full w-full object-cover object-[62%_center]"
            />
            <HeroDivider />
          </div>
        </div>
      </section>

      <section className="bg-surface py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="text-center">
            <Pill>Solutions</Pill>
            <h2 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl">
              Built for modern Bitcoin families
            </h2>
          </div>
          <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="rounded-2xl border border-border bg-card p-6 shadow-soft"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-mint text-mint-foreground">
                  <f.icon className="h-5 w-5" />
                </span>
                <h3 className="mt-5 text-lg font-bold">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-4 py-24 text-center sm:px-6">
        <HeartHandshake className="mx-auto h-8 w-8 text-primary" />
        <h2 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl">
          Money conversations, made a little easier
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
          Everyone sees who spent what, nobody sells Bitcoin in a panic, and the kids get a letter
          with their first big savings.
        </p>
        <Button asChild size="xl" className="mt-8">
          <Link to="/dashboard">
            Open the family dashboard <ArrowRight />
          </Link>
        </Button>
      </section>

      <footer className="border-t border-border py-8 text-center text-xs text-muted-foreground">
        KinVault · Mezo Family Trust demo. Balances shown are sample data.
      </footer>
    </div>
  );
}
