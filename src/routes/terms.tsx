import { Link, createFileRoute } from "@tanstack/react-router";

import { Logo } from "@/components/vault/logo";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms — KinVault" },
      {
        name: "description",
        content: "The terms for using KinVault on Mezo Testnet.",
      },
      { property: "og:title", content: "Terms — KinVault" },
      {
        property: "og:description",
        content: "The terms for using KinVault on Mezo Testnet.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Terms,
});

const SECTIONS: { heading: string; body: string[] }[] = [
  {
    heading: "Testnet only",
    body: [
      "KinVault runs exclusively on Mezo Testnet (chain 31611). Test BTC, MEZO and MUSD have no monetary value.",
      "Do not use KinVault to hold assets you cannot afford to lose. The service is a preview of the product, not a production custodian.",
    ],
  },
  {
    heading: "You hold the keys",
    body: [
      "You sign every transaction in your own wallet. KinVault never has the ability to move your funds.",
      "If you lose access to your wallet or your account email, we cannot recover funds for you.",
    ],
  },
  {
    heading: "Verified, not optimistic",
    body: [
      "A balance only changes after KinVault verifies the Mezo transaction hash, token, sender, recipient, amount and confirmations.",
      "If a verification fails, the ledger stays unchanged and the reason is shown.",
    ],
  },
  {
    heading: "Acceptable use",
    body: [
      "Do not use KinVault to break the law, to attack the service or the Mezo network, or to impersonate another person or household.",
    ],
  },
  {
    heading: "No financial advice",
    body: [
      "Nothing in KinVault is investment, tax or legal advice. Borrowing against Bitcoin carries liquidation risk; the app shows the protocol's minimum net debt and collateral ratio before you sign.",
    ],
  },
  {
    heading: "Changes and availability",
    body: [
      "The service is provided as-is, without warranty, and may change or go offline during the testnet period.",
      "We may update these terms; the date below always reflects the current version.",
    ],
  },
];

function Terms() {
  return (
    <div className="min-h-screen bg-background px-4 py-8 sm:px-6">
      <div className="mx-auto w-full max-w-2xl">
        <Link to="/">
          <Logo />
        </Link>
        <h1 className="mt-10 text-4xl font-extrabold tracking-tight">Terms of service</h1>
        <p className="mt-2 text-muted-foreground">
          The short version: this is a testnet preview, your wallet signs everything, and the ledger
          only moves after a verified Mezo transaction.
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
          <Link to="/privacy" className="text-primary hover:underline">
            Privacy
          </Link>
        </div>
      </div>
    </div>
  );
}
