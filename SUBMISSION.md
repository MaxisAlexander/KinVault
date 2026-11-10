# KinVault — Mezo Buildathon submission

Wave 2 deadline: **November 15, 2026, 20:30**. Judging: November 16–22. Winners:
November 23.

## Hard requirements

| Item                     | Status                           | Where                           |
| ------------------------ | -------------------------------- | ------------------------------- |
| Live deployment link     | **TODO — add before submitting** | `README.md` → Live deployment   |
| Public GitHub repository | **TODO — initialise and push**   | This directory                  |
| Pitch deck               | **TODO**                         | Add `deck.pdf` or a hosted link |
| 2-minute demo video      | **TODO**                         | Add the video URL               |

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

## Suggested 2-minute video

1. **0:00–0:15** — Problem: families hold Bitcoin but sell it for everyday
   expenses and emergencies.
2. **0:15–0:35** — Demo mode: dashboard, family rules, two-approval expense,
   lockbox.
3. **0:35–1:05** — Live funding: connect Mezo Testnet wallet, fund the treasury
   with test MUSD, show the explorer transaction and the verified ledger credit.
4. **1:05–1:35** — Borrow: open a trove with 0.01 test BTC, borrow 2,000 MUSD,
   show `TroveUpdated` and the live protocol panel.
5. **1:35–1:55** — Repay/close: `closeTrove()` returns the BTC; show the
   explorer and the unlocked collateral.
6. **1:55–2:00** — Close: server-authoritative verification, replay protection,
   testnet-only, open-source repo.

## Suggested deck

1. Problem and who feels it.
2. Product: one family vault, six seats, shared rules.
3. Why Mezo: BTC collateral + MUSD without selling Bitcoin.
4. Live demo screenshots and explorer evidence (`docs/screenshots/`).
5. Architecture: browser → tx hash → server verification → ledger.
6. Security: call decoding, event anchoring, replay protection, RLS.
7. Business model: subscription or treasury fee; path to mainnet.
8. Roadmap and team.

Screenshots ready to drop into the deck:

| File                                | Page                   |
| ----------------------------------- | ---------------------- |
| `docs/screenshots/01-landing.png`   | Landing                |
| `docs/screenshots/02-dashboard.png` | Family dashboard       |
| `docs/screenshots/03-spending.png`  | Spending and approvals |
| `docs/screenshots/04-loans.png`     | Borrow against BTC     |
| `docs/screenshots/05-trust.png`     | Generational lockboxes |

## Pre-submit checklist

- [ ] Deploy the app and add the URL to `README.md`.
- [ ] Create a public GitHub repository and push this directory.
- [ ] Confirm `.env` is not committed and `.env.example` is.
- [ ] Apply all four Drizzle migrations to the production Supabase project.
- [ ] Set `SUPABASE_SERVICE_ROLE_KEY` in the deployment environment.
- [ ] Run `bun run test`, `bunx tsc --noEmit` and `bun run build`.
- [ ] Run `bun run test:live` and save the output.
- [ ] Record the 2-minute video and upload the deck.
- [ ] Submit on the Akindo Buildathon page before the deadline.
