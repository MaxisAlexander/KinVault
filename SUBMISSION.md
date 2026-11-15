# KinVault — Mezo Buildathon submission

Wave 2 deadline: **November 15, 2026, 20:30**. Judging: November 16–22. Winners:
November 23.

## Hard requirements

| Item                     | Status                                                | Where                           |
| ------------------------ | ----------------------------------------------------- | ------------------------------- |
| Live deployment link     | **DONE** — https://kinvault-six.vercel.app            | `README.md` → Live deployment   |
| Public GitHub repository | **DONE** — https://github.com/MaxisAlexander/KinVault | `main` branch                   |
| Pitch deck               | **DONE** - 9 slides, 16:9 PDF                          | `docs/deck/kinvault-deck.pdf`   |
| 2-minute demo video      | **DONE** — 2:19, 1080p, narrated                      | `docs/video/kinvault-demo.mp4`  |

## Rubric mapping

### Mezo Integration — 30%

- Canonical testnet MUSD and MEZO addresses in `src/lib/chain/config.ts`.
- `PriceFeed.fetchPrice()` and `TroveManager` reads are live, not hard-coded.
- `BorrowerOperations.openTrove`, `repayMUSD` and `closeTrove` are called by the
  treasury wallet.
- Live `minNetDebt()` (1,800 MUSD) and `MUSD_GAS_COMPENSATION()` (200 MUSD) are
  read from the protocol and enforced before signing.
- The server decodes the exact call and requires the matching `TroveUpdated`
  operation; repayment amounts come from MUSD burn logs.
- Deposits, expense payments and withdrawals are verified ERC-20/native
  transfers on chain 31611.

Read-only verification against the live chain (`bun run test:live`, 15 Nov 2026):

```text
chain: 31611
block: 16786352
MUSD: 0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503 (18)
MEZO: 0x7B7c000000000000000000000000000000000001 (18)
BTC/USD from Mezo PriceFeed: $63002.97
MCR: 1.1; gas compensation: 200 MUSD
Minimum net debt: 1800 MUSD
BorrowerOperations: 0xCdF7028ceAB81fA0C6971208e83fa7872994beE5
mezo live check: ok
```

### Product & Business Viability — 30%

- The product solves a concrete household problem: pay for family life and
  borrow for big moments without selling Bitcoin.
- Two-approval spending rules, per-member allowances, freeze/unfreeze and
  guardian lockboxes are implemented as pure, tested rules.
- The treasury is a real Mezo Testnet wallet; KinVault never holds a key.
- Clear path to a 2-of-3 Safe or dedicated vault contract for production.

### Technical Implementation — 20%

- React 19 + TanStack Start, strict TypeScript, viem, Supabase Postgres + RLS.
- Server-authoritative ledger: the browser sends only a transaction hash.
- Replay protection via `onchain_transactions.tx_hash` primary key.
- Hash-chained activity log.
- 58 automated tests plus a read-only Mezo RPC smoke test.
- Live mode never applies an optimistic balance; it waits for the verified
  server ledger.

### UX — 10%

- Demo mode is clickable without a wallet and clearly labelled.
- Live mode shows the treasury address, wallet-link state, explorer links and
  exact failure reasons.
- Borrow/repay panels display the protocol's minimum net debt and gas
  compensation before the wallet signs.

### Submission Materials — 10%

- `README.md`: architecture, on-chain flows, setup, security model.
- `TESTING.md`: automated coverage and the manual testnet checklist.
- `SUBMISSION.md`: this rubric map and the remaining checklist.

## Demo video

The submitted walkthrough is `docs/video/kinvault-demo.mp4` (2:19, 1920×1080,
narrated). It covers:

1. **0:00–0:28** — Landing, the three product pillars, and the three sign-in
   paths (email, Google, wallet signature).
2. **0:28–0:58** — Dashboard, deposits and withdrawals, member sub-accounts,
   roles and the acting-as switcher, and onboarding/invite codes.
3. **0:58–1:25** — Two-approval spending, the under-$100 auto-approve rule,
   expense logging, filters and charts; the loan calculator, LTV and stress
   sliders, borrow, repay and repay-in-full.
4. **1:25–1:56** — Lockboxes, letters, guardian signatures, contributions, a new
   lockbox, and hash-chained receipts with Mezo block heights.
5. **1:56–2:19** — The server-side verification model and the close.

The walkthrough uses demo mode so it can be watched without a wallet. The
verification model it describes is the live path in `src/lib/chain/`.

Script and rebuild notes: `docs/video/DEMO-SCRIPT.md`.

## Pitch deck

`docs/deck/kinvault-deck.pdf` - 9 slides at 1920x1080, built by
`docs/deck/make_deck.py`. Regenerate with:

```bash
python docs/deck/make_deck.py
```

| # | Slide | Argument |
| - | ----- | -------- |
| 1 | Title | KinVault: the family vault for Bitcoin and MUSD |
| 2 | Problem | Bitcoin is the family savings, but life keeps asking for cash |
| 3 | Product | One vault, six seats, rules everyone agreed on |
| 4 | Walkthrough | Every household flow in one place (real screenshots) |
| 5 | Mezo | Bitcoin stays, MUSD does the work - trove mechanics |
| 6 | Security | Browser signs, server verifies, ledger follows |
| 7 | Comparison | A joint account can't hold Bitcoin; an exchange can't raise a family |
| 8 | Business | Small recurring revenue, aligned with families |
| 9 | Roadmap | Testnet today, vault contract and mainnet next |

Screenshots used in the deck and the submission form:

| File                                | Page                   |
| ----------------------------------- | ---------------------- |
| `docs/screenshots/01-landing.png`   | Landing                |
| `docs/screenshots/02-dashboard.png` | Family dashboard       |
| `docs/screenshots/03-spending.png`  | Spending and approvals |
| `docs/screenshots/04-loans.png`     | Borrow against BTC     |
| `docs/screenshots/05-trust.png`     | Generational lockboxes |

## Pre-submit checklist

- [x] Deploy the app and add the URL to `README.md` —
      https://kinvault-six.vercel.app
- [x] Create a public GitHub repository and push this directory —
      https://github.com/MaxisAlexander/KinVault
- [x] Confirm `.env` is not committed and `.env.example` is.
- [ ] Apply all four Drizzle migrations to the production Supabase project.
- [ ] Set `SUPABASE_SERVICE_ROLE_KEY` in the deployment environment.
- [ ] Run `bun run test`, `bunx tsc --noEmit` and `bun run build`.
- [ ] Run `bun run test:live` and save the output.
- [x] Record the 2:19 narrated walkthrough — `docs/video/kinvault-demo.mp4`.
- [ ] Upload the video and deck to the submission form.
- [ ] Submit on the Akindo Buildathon page before the deadline.
