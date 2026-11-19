# KinVault — Mezo Buildathon submission

Wave 2 deadline: **November 15, 2026, 20:30**. Judging: November 16–22. Winners:
November 23. The repository has been updated during the judging window; every
change is listed under [What changed after the first submission](#what-changed-after-the-first-submission).

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
  operation; repayment amounts come from MUSD burn logs. Trove opens and
  repayments are recorded only after **3 confirmations**.
- **MEZO now has a function:** the treasury must hold at least 1 MEZO to borrow
  through KinVault (KinVault participation policy, checked before signing and
  again server-side; `src/lib/chain/participation.ts`). It is a holding
  requirement, not staking or a protocol fee — stated as such in the README.
- Deposits, expense payments and withdrawals are verified ERC-20/native
  transfers on chain 31611.
- The verifier is tested against **real Mezo Testnet receipts**, not only mocks:
  `src/test/fixtures/mezo-receipts.json` is recorded from chain 31611 and
  replayed in `src/lib/chain/verify.fixtures.test.ts`.
- `bun run proof 0x…` re-verifies any single transaction with the production
  verifier and prints the decoded effect, so a reviewer can check a claim without
  trusting this document.

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
- Requester-chosen spending approvals plus an admin-set auto-approval limit
  (default `$0`, off), per-member allowances, freeze/unfreeze and guardian
  lockboxes are implemented as pure, tested rules.
- The treasury is a real Mezo Testnet wallet; KinVault never holds a key.
- A written business model — who pays, what they buy, three revenue paths, and
  the honest dependency on Mezo getting a fiat on-ramp — is in
  `README.md` → Business model.
- Clear path to a 2-of-3 Safe or dedicated vault contract for production. The
  current limitation is disclosed rather than implied away; see
  [Known limitations](#known-limitations).

### Technical Implementation — 20%

- React 19 + TanStack Start, strict TypeScript, viem, Supabase Postgres + RLS.
- Server-authoritative ledger: the browser sends only a transaction hash.
- Replay protection via `onchain_transactions.tx_hash` primary key.
- Hash-chained activity log.
- Self-transfer guard: a deposit whose sender is the treasury is rejected before
  the receipt is fetched, so a genuine transaction that moved no value cannot
  credit the ledger.
- Fixed-window rate limiting on invite preview, join, create-family and vault
  actions (`src/lib/rate-limit.server.ts`).
- 98 automated tests across 11 files, including a suite that replays real Mezo
  Testnet receipts, plus a read-only Mezo RPC smoke test.
- Live mode never applies an optimistic balance; it waits for the verified
  server ledger.

### UX — 10%

- Demo mode is clickable without a wallet and clearly labelled.
- Live mode shows the treasury address, wallet-link state, explorer links and
  exact failure reasons.
- Borrow/repay panels display the protocol's minimum net debt and gas
  compensation before the wallet signs.

### Submission Materials — 10%

- `README.md`: architecture, on-chain flows, setup, security model, known
  limitations, business model.
- `TESTING.md`: automated coverage, the real-chain fixture suite, the manual
  testnet checklist and `bun run proof`.
- `SUBMISSION.md`: this rubric map and the remaining checklist.

## Known limitations

Stated up front, because a judge will find them anyway and discovery costs more
than disclosure.

1. **The treasury is a single EOA.** The "your chosen guardians must approve"
   rule is enforced by this application and the server ledger, not by the chain. The
   treasury key holder could bypass KinVault and move MUSD directly. The rule is
   real for everyone using the app and not a cryptographic guarantee against the
   key holder. Replacing the EOA with a 2-of-3 Safe is the first roadmap item.
2. **Rate limiting is per instance.** The limiter is in-process, so on Vercel the
   effective limit scales with the number of warm instances.
3. **No Solidity in this repository.** KinVault consumes Mezo's deployed MUSD and
   BorrowerOperations rather than shipping its own contracts.
4. **Testnet only.** There is no mainnet configuration anywhere in the codebase.

## What changed after the first submission

An independent review of this repository produced a list of findings. These were
fixed rather than argued with:

| Finding | Fix |
| --- | --- |
| Deposits accepted self-transfers (`from == to`), inflating the ledger | `src/lib/chain/guards.ts` rejects it before the receipt is fetched; the deposit form refuses to start such a transfer; the three affected rows were deleted and the ledger balances reset (`docs/audit/`) |
| The borrow path had never been executed | The verifier is now proven against a real `openTrove` receipt from chain 31611 (`src/lib/chain/verify.fixtures.test.ts`), and `bun run proof 0x…` reproduces it. A KinVault-signed borrow still needs a funded treasury wallet; the runbook is in `TESTING.md` |
| Tests never touched a real chain | `src/lib/chain/verify.fixtures.test.ts` replays receipts recorded from chain 31611 |
| No business model | `README.md` → Business model |
| The EOA treasury was undisclosed | `README.md` → Known limitations, and this file |
| Stale test counts (58/4) | 98 tests across 11 files, everywhere |
| No abuse controls | `src/lib/rate-limit.server.ts` on invite preview, join, create-family and vault actions |
| Signed-out visitors saw app navigation | The header and mobile nav now render only when signed in |
| MEZO was display-only | Treasury must hold ≥ 1 MEZO to borrow through KinVault, enforced pre-sign (`transactions.ts`) and server-side (`confirmTroveOpen`), shown in the trove panel |
| Troves settled on 1 confirmation | Opens/repayments now require 3 confirmations (`REQUIRED_TROVE_CONFIRMATIONS`), with a regression test at 2 |
| 6.5% APY could be misread as protocol yield | Demo stat relabelled "Simulated yield · demo only — Mezo does not pay this yield"; live mode unchanged (already yield-free) |
| Approvals could be read as chain-enforced | Spending page now states in live mode that approvals are server-ledger-enforced, not chain-enforced |
| Under-$100 expenses auto-approved without a family signature | Instant approval removed: the requester names the approvers (e.g. Dad), every chosen approver must sign, and a sub-$100 expense stays pending until they do; legacy rows still need two distinct approvals |
| Families wanted a say in when a signature is overkill | Admin-only auto-approval limit (default `$0` = off). Amounts strictly under it, and inside the member's allowance, pay with no signature; at or above it the chosen approvers sign. Enforced in `routeExpense`/`addExpense`, not just the UI |
| Generated labels repeated words ("The Perera Family Family Vault", "created the The … family vault") | The dashboard eyebrow uses `familyLabel()`, generated vault-created text drops the duplicated article and suffix, and the five existing testnet ledgers were rewritten in place with their hashes re-sealed so the receipt chain still verifies |
| README carried screenshots and a demo-video section | Removed; README now leads with on-chain claims, evidence and current status |
| Wallet disconnected on every page refresh | The address is remembered and restored silently through `eth_accounts` (no popup, no signature); 4 tests in `src/lib/wallet.test.ts` |
| Header BTC price could show the demo constant in live mode | Header reads Mezo `PriceFeed.fetchPrice()` with a live/stale dot and tooltip; the vault price is only a fallback while the RPC loads |
| A family whose treasury was its own wallet could never set one (the Fund dialog blocked self-transfers, so the treasury stayed unset) | New admin action `setTreasuryAddress` plus "Use my connected wallet as the treasury" in the Fund dialog — moves no funds, credits nothing |
| The ledger read $0 while the treasury held funds on Mezo | Dashboard shows the treasury's live on-chain MUSD and BTC read-only, labelled "On-chain treasury", next to the ledger |
| The Fund dialog was a dead end when the connected wallet was the treasury | Explains why a self-transfer is blocked, offers "Switch wallet", and states that borrowing does not need a deposit |

## Demo video

The submitted walkthrough is `docs/video/kinvault-demo.mp4` (2:19, 1920×1080,
narrated). It covers:

1. **0:00–0:28** — Landing, the three product pillars, and the three sign-in
   paths (email, Google, wallet signature).
2. **0:28–0:58** — Dashboard, deposits and withdrawals, member sub-accounts,
   roles and the acting-as switcher, and onboarding/invite codes.
3. **0:58–1:25** — Requester-chosen approvals (the requester picks the father or
   another guardian), the admin-only auto-approval limit and the sub-limit spends
   that skip signatures, expense logging, filters and charts; the loan
   calculator, LTV and stress sliders, borrow, repay and repay-in-full.
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
- [x] Apply all four Drizzle migrations to the production Supabase project.
- [x] Set `SUPABASE_SERVICE_ROLE_KEY` in the deployment environment.
- [x] Run `bun run test`, `bunx tsc --noEmit` and `bun run build` — 98/98 tests
      pass, TypeScript clean, production build succeeds.
- [x] Run `bun run test:live` and save the output — see below.
- [x] Record the 2:19 narrated walkthrough — `docs/video/kinvault-demo.mp4`.
- [ ] Upload the video and deck to the submission form.
- [ ] Submit on the Akindo Buildathon page before the deadline.

## Live deployment verification

The production deployment is backed by its own Supabase project
(`qfuybxxijknirukcmdvz`), not a preview backend:

- All four Drizzle migrations (`0000`–`0003`) applied with
  `bun run scripts/apply-migrations.ts`.
- `SUPABASE_SERVICE_ROLE_KEY` is set as a Vercel production variable and is
  never exposed to the browser bundle.
- End-to-end check on https://kinvault-six.vercel.app: email sign-in, family
  creation on `/onboarding`, then `/dashboard` hydrating the saved family
  ("The Perera Family · saved") with live activity, real dates and
  "Verified on Mezo Testnet · no simulated yield" instead of the demo banner.
- Demo mode is unchanged and still reachable with no account.

`bun run test:live` output against Mezo Testnet:

```text
chain: 31611
block: 16792109
gas: 0.000000146 gwei
MUSD: 0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503 (18)
MEZO: 0x7B7c000000000000000000000000000000000001 (18)
BTC/USD from Mezo PriceFeed: $63752.31
MCR: 1.1; gas compensation: 200 MUSD
Minimum net debt: 1800 MUSD
BorrowerOperations: 0xCdF7028ceAB81fA0C6971208e83fa7872994beE5
mezo live check: ok
```

