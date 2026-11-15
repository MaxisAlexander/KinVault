import { Link, createFileRoute } from "@tanstack/react-router";

import { Logo } from "@/components/vault/logo";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy — KinVault" },
      {
        name: "description",
        content: "What KinVault stores, where it lives, and what it never touches.",
      },
      { property: "og:title", content: "Privacy — KinVault" },
      {
        property: "og:description",
        content: "What KinVault stores, where it lives, and what it never touches.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Privacy,
});

const SECTIONS: { heading: string; body: string[] }[] = [
  {
    heading: "What we store",
    body: [
      "Your email address, so you can sign in and recover your account.",
      "The family name you choose, plus the display names, roles and ages you enter for family members.",
      "The wallet address you link to your seat, when you link one.",
      "The family ledger: deposits, expenses, approvals, loans, lockbox releases, and the Mezo Testnet transaction hash behind each verified movement.",
    ],
  },
  {
    heading: "What we never touch",
    body: [
      "Private keys or seed phrases. KinVault never holds a key; your wallet signs every transaction.",
      "Card or bank details. There is no fiat on-ramp in KinVault.",
      "Advertising identifiers, and we do not sell or rent personal data.",
    ],
  },
  {
    heading: "Where it lives",
    body: [
      "Account and ledger data is stored in a Supabase Postgres database with row-level security, and served from Vercel.",
      "Chain data is read from the public Mezo Testnet RPC. Anything written there is public by nature.",
    ],
  },
  {
    heading: "Demo mode",
    body: [
      "The sample family is seed data. Browsing it without an account stores nothing on our servers.",
    ],
  },
  {
    heading: "Deleting your data",
    body: [
      "Email us from the address on your account and we will delete your account, family and ledger. Transaction hashes already written to Mezo Testnet cannot be erased by anyone.",
    ],
  },
];

function Privacy() {
  return (
    <div className="min-h-screen bg-background px-4 py-8 sm:px-6">
      <div className="mx-auto w-full max-w-2xl">
        <Link to="/">
          <Logo />
        </Link>
        <h1 className="mt-10 text-4xl font-extrabold tracking-tight">Privacy</h1>
        <p className="mt-2 text-muted-foreground">
          KinVault runs on Mezo Testnet. This page explains what the app stores and what it never
          asks for.
        </p>
        <p className="mt-1 text-xs font-semibold text-muted-foreground">Last updated 15 Nov 2026</p>

        <div className="mt-10 space-y-8">
          {SECTIONS.map((section) => (
            <section key={section.heading}>
              <h2 className="text-lg font-extrabold tracking-tight">{section.heading}</h2>
              <ul className="mt-3 space-y-2 text-sm leading-relaxed text-foreground/80">
                {section.body.map((line) => (
                  <li key={line} className="flex gap-2">
                    <span
                      aria-hidden="true"
                      className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
                    />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <div className="mt-12 flex flex-wrap gap-4 border-t border-border pt-6 text-sm font-semibold">
          <Link to="/" className="text-primary hover:underline">
            Back to KinVault
          </Link>
          <Link to="/terms" className="text-primary hover:underline">
            Terms of service
          </Link>
        </div>
      </div>
    </div>
  );
}
