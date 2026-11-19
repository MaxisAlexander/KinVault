# KinVault — a family vault on Mezo Testnet

KinVault is a household finance app for families who hold **BTC** and **MUSD** on
[Mezo](https://mezo.org). Up to six family members share a vault, pay for everyday
life in MUSD only after the family members they name approve it, and borrow MUSD
against BTC through Mezo's own `BorrowerOperations` rather than selling the
Bitcoin.

> **North star:** families pay for household life and their children's futures
> without selling their Bitcoin.

**This repository targets Mezo Testnet only (chain 31611).** There is no mainnet
configuration in the chain layer.

---

## What is actually on-chain

| Flow                   | What happens                                                                                                                                                                                                    |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Fund with MUSD**     | The member's wallet sends canonical testnet MUSD to the family treasury. The server verifies the ERC-20 `Transfer`, then credits the ledger.                                                                    |
| **Fund with test BTC** | Native test BTC moves from the member's wallet to the treasury; the server verifies the transaction value, sender and recipient.                                                                                |
| **Pay an expense**     | After the family's approval rules pass, the treasury wallet sends MUSD to the merchant. The server verifies the transfer before debiting the treasury.                                                          |
| **Withdraw**           | The treasury wallet sends test MUSD or BTC to a member's linked wallet. The server verifies the sender, recipient, asset and amount before debiting.                                                            |
| **Borrow**             | The treasury wallet calls `BorrowerOperations.openTrove` with native test BTC. The server decodes the call, requires the matching `TroveUpdated` event and 3 confirmations before recording collateral and debt. KinVault policy (not a Mezo protocol rule): the treasury must hold at least 1 MEZO to borrow through KinVault. |
| **Repay**              | A partial repayment calls `repayMUSD`; a full repayment calls `closeTrove()` (which also returns the 200 MUSD gas compensation). The server decodes the call, derives the repaid amount from MUSD burn logs, and records it after 3 confirmations. |
| **MEZO participation** | MEZO is no longer display-only: holding at least 1 MEZO in the treasury is what unlocks KinVault's borrow flow. The balance is checked in the browser before the wallet signs and again on the server before the ledger records a trove (`src/lib/chain/participation.ts`). |
| **Price**              | Loans and the UI read `PriceFeed.fetchPrice()` from Mezo, not CoinGecko or an owner-posted number.                                                                                                              |
| **Trove state**        | `TroveManager.getTroveStatus/getTroveColl/getTroveDebt/getCurrentICR` are read live.                                                                                                                            |

The browser only ever sends a **transaction hash** to the server. The server
independently fetches the receipt and checks the chain, contract, sender,
recipient, amount and confirmations before touching the family ledger.

### Evidence you can check yourself

Every claim above can be re-run from a clean checkout:

```sh
bun run proof 0x<transaction hash>   # re-verifies one tx with the production verifier
bun run fixtures                     # re-records the chain fixtures from Mezo Testnet
```

`bun run proof` prints the decoded effect of a transaction — amount, sender,
recipient, collateral, debt, MUSD burned — using the same functions the server
runs before it credits a ledger. It works for MUSD transfers, native BTC
transfers, `openTrove`, `repayMUSD` and `closeTrove`, and it labels a
self-transfer as one instead of reporting it as a deposit.

The verifier is also tested against **real Mezo Testnet receipts**, not only
against mocks. `src/test/fixtures/mezo-receipts.json` is recorded from chain 31611
by `bun run fixtures` and replayed in `src/lib/chain/verify.fixtures.test.ts`:

| Fixture | Transaction | What the test proves |
| --- | --- | --- |
| `openTrove` | [`0x4ea9ac26…`](https://explorer.test.mezo.org/tx/0x4ea9ac261a6c6a69234e8c508fcfda6594a00ad855ff1d396aa9fa592bd90fb4) | A genuine `BorrowerOperations.openTrove` (0.06 BTC collateral) decodes, and the `TroveUpdated` event is read rather than trusted from the client |
| `musdTransfer` | [`0xf027f02f…`](https://explorer.test.mezo.org/tx/0xf027f02f4fc5e005cbfe7b2b2ca5095d8f8efbb6d7ebdc32efefda901161900c) | A genuine 500 MUSD transfer between two wallets is accepted; a different recipient or a higher amount is rejected |
| `musdSelfTransfer` | [`0x5c61ad31…`](https://explorer.test.mezo.org/tx/0x5c61ad312481b2076adfc35a11363fe586d89e35b0cdc8310d7c1959a24fe6d6) | A real transfer from a wallet to itself passes the receipt check, which is exactly why the deposit guard rejects it |
| `btcSelfTransfer` | [`0x3d553eac…`](https://explorer.test.mezo.org/tx/0x3d553eacbafb8a7985011c191c37fef161b7f1c86f53d5cf3385ecc00b512371) | Same, for native test BTC |

> **Current status (read this before the claims above).** The verifier and the
> borrow/repay code paths are complete and tested, and the reference Perera
> treasury (`0x4259…214d`) holds test BTC, MUSD and 200 MEZO. But as of this
> commit **no KinVault treasury has opened a trove through the app** — the
> `openTrove` fixture above is a third party's transaction, used to prove the
> verifier. Executing the borrow needs a human to sign in the treasury wallet;
> no private key exists in this repo or its environment, by design. The runbook
> is `TESTING.md` → "Open a Mezo trove". Until those hashes exist, treat
> "Borrow" and "Repay" as *implemented and verifier-proven, not yet executed
> end-to-end from KinVault*.

> **An early bug, and what happened to it.** The first three deposits ever
> recorded by KinVault were transfers a wallet made to *itself*; the verifier
> checked sender, recipient and amount but not that the two differed, so the
> ledger was credited for money that never moved. `src/lib/chain/guards.ts` now
> rejects that, the deposit form refuses to start such a transfer, the three rows
> were deleted from `onchain_transactions`, and the affected ledger balances were
> reset to zero. `docs/audit/README.md` documents the removal and
> `docs/audit/purged-self-transfers.json` keeps the deleted rows.

### Verified testnet contracts

| Contract           | Address                                      |
| ------------------ | -------------------------------------------- |
| MUSD (18 decimals) | `0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503` |
| MEZO (18 decimals) | `0x7B7c000000000000000000000000000000000001` |
| BorrowerOperations | `0xCdF7028ceAB81fA0C6971208e83fa7872994beE5` |
| TroveManager       | `0xE47c80e8c23f6B4A1aE41c34837a0599D5D16bb0` |
| PriceFeed          | `0x86bCF0841622a5dAC14A313a15f96A95421b9366` |
| HintHelpers        | `0x4e4cBA3779d56386ED43631b4dCD6d8EacEcBCF6` |
| SortedTroves       | `0x722E4D24FD6Ff8b0AC679450F3D91294607268fA` |

Network:

| Parameter    | Value                            |
| ------------ | -------------------------------- |
| Chain ID     | `31611` (`0x7b7b`)               |
| RPC          | `https://rpc.test.mezo.org`      |
| WSS          | `wss://rpc-ws.test.mezo.org`     |
| Explorer     | `https://explorer.test.mezo.org` |
| Faucet       | `https://faucet.test.mezo.org/`  |
| Testnet dApp | `https://testnet.mezo.org`       |

> The Buildathon asset is **MUSD**. The testnet mUSDC address in older docs is
> not deployed at that address on chain 31611; KinVault uses canonical MUSD.

---

## Architecture

```text
Browser (React 19 / TanStack Start)
  routes + vault components
  src/lib/chain/client.ts        read-only viem public client (PriceFeed, troves, balances)
  src/lib/chain/transactions.ts  EIP-1193 wallet writes (MUSD/BTC, openTrove, repayMUSD/closeTrove)
  src/lib/vault-store.ts         demo store + authoritative live hydration (no optimistic balances)
        │
        │  tx hash only
        ▼
Server (TanStack Start server functions)
  requireSupabaseAuth
  src/lib/chain/verify.server.ts verify receipt, token, from/to, amount, chain, confirmations
  src/lib/chain/ledger.ts        pure ledger bridge (deposit, payment, trove)
  family.server.ts               membership + optimistic-concurrency ledger writes
        │
        ▼
Supabase Postgres (RLS)  ·  families · family_members · family_invites ·
                           vault_ledgers · onchain_transactions
```

Key decisions:

- **One chain config.** All addresses and endpoints live in
  `src/lib/chain/config.ts`; mainnet is deliberately absent.
- **Server-authoritative writes.** The browser cannot credit a deposit or settle
  an expense without a verified Mezo receipt. Live mode never shows an
  optimistic balance: it waits for the server's ledger.
- **Event-anchored troves.** `openTrove`, `repayMUSD` and `closeTrove` are
  decoded from the transaction input, and the matching `TroveUpdated` operation
  is required. Current trove state alone is not accepted as proof.
- **Replay protection.** `onchain_transactions.tx_hash` is a primary key, so a
  transaction can only be consumed once.
- **Protocol-native borrowing.** Troves are opened and repaid through
  `BorrowerOperations`; `PriceFeed`, `TroveManager` and the live
  `minNetDebt()`/gas-compensation values are the source of truth.
- **Hash-chained ledger.** Activity entries keep the existing SHA-256 chain and
  commit to a `txHash` when one is present. Older entries remain valid.
- **Accounting is net of debt.** The dashboard counts outstanding loans against
  pool assets and allocates the debt pro rata to member net positions.

---

## Family rules

All rules are pure functions in `src/lib/vault-logic.ts`:

| Rule                      | Value                                                                     |
| ------------------------- | ------------------------------------------------------------------------- |
| Expense approval          | requester names the approvers; every chosen admin/spouse must sign         |
| Auto-approval limit       | admin-set, default $0 (off); only amounts strictly under it and inside the member's allowance skip signatures |
| Legacy expense            | rows with no named approvers need 2 distinct approvals                    |
| Roles                     | admin/spouse approve; teen/kid cannot                                     |
| Default allowances        | teen $50/day; kid $15/day and School/Groceries only           |
| Family size               | max 6                                                         |
| Trove MCR                 | 110% (protocol)                                               |
| Minimum trove net debt    | 1,800 MUSD (read live from `BorrowerOperations.minNetDebt()`) |
| Protocol gas compensation | 200 MUSD (added to trove debt)                                |
| Lockbox release           | matured + 2 distinct guardian signatures                      |
| Unfreeze                  | 2 distinct guardian signatures                                |

---

## Project layout

```text
src/
  lib/
    chain/
      config.ts          Mezo Testnet, token/protocol addresses, explorer helpers
      abis.ts            ERC-20, PriceFeed, BorrowerOperations, TroveManager, hints
      amounts.ts         BigInt token/price helpers
      client.ts          read-only RPC: chain status, balances, PriceFeed, trove
      protocol.ts        trove planning and summaries
      transactions.ts    wallet writes (MUSD/BTC, openTrove, repayMUSD/closeTrove)
      verify.server.ts   server-only receipt + call + event verification
      ledger.ts          pure on-chain -> ledger bridge (deposit, payment, withdrawal, trove)
    mezo.ts              testnet heartbeat + PriceFeed store
    wallet.ts            EIP-1193 wallet state and balances
    family.functions.ts  authenticated server functions
    family.server.ts     membership, seat sync, optimistic concurrency
    vault-engine.ts      shared action engine and ledger types
    vault-store.ts       demo/live client store
  routes/                landing, auth, dashboard, spending, loans, trust, family
  components/vault/      app shell, wallet, fund/pay dialogs, trove panel, ledger
blockchain.test.ts       root blockchain test suite
TESTING.md               every automated and manual check
drizzle/migrations/      families, seats, invites, ledgers, onchain_transactions
```

---

## Setup

Requirements: Bun (or Node.js 20+) and a browser wallet.

```sh
bun install
cp .env.example .env   # then fill in the Supabase values
bun run dev
```

`.env` is git-ignored. The server needs `SUPABASE_SERVICE_ROLE_KEY` for verified
ledger writes; the browser only receives the publishable key.

Environment variables:

| Variable                                             | Used by                                     |
| ---------------------------------------------------- | ------------------------------------------- |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | Browser auth/database                       |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`           | Server auth middleware                      |
| `SUPABASE_SERVICE_ROLE_KEY`                          | Server-only privileged ledger writes        |
| `VITE_DEMO_MERCHANT_ADDRESS`                         | Optional default merchant for test payments |

No private key is ever stored in the app or the repository. All transactions are
signed by the user's wallet.

### Enabling live mode

Demo mode needs no configuration. Live mode - where every balance change is a
verified Mezo transaction - needs two things on the server:

1. **Schema.** Apply the Drizzle migrations to the Supabase project with
   `bun run scripts/apply-migrations.ts`, which runs `0000`–`0003` in filename
   order and is safe to re-run. It reads `MIGRATION_DATABASE_URL`, or
   `DB_HOST` + `DB_PASSWORD` for a direct Postgres connection. If you can only
   reach the Supabase SQL editor, paste `drizzle/migrations/apply-0002-0003.sql`
   after `0000` and `0001`; it is the same statements in one pass.
2. **Service-role key.** Set `SUPABASE_SERVICE_ROLE_KEY` in `.env` and in the
   hosting environment. Without it the server refuses to write and reports the
   missing variable instead of mutating the ledger.

If either is missing the app stays in demo mode; it never falls back to
unverified writes.

### Getting test assets

1. Add Mezo Testnet to your wallet (chain `31611`, RPC `https://rpc.test.mezo.org`).
2. Get test BTC and MEZO from the [faucet](https://faucet.test.mezo.org/).
3. Borrow MUSD against test BTC or swap BTC → MUSD in the
   [testnet dApp](https://testnet.mezo.org).
4. In KinVault, connect the wallet, link it to your family seat, and fund the
   treasury.

---

## Testing

```sh
bun run test        # 98 unit and integration tests across 11 files
bun run test:live   # read-only smoke test against Mezo Testnet
bun run proof 0x…   # re-verify one real transaction with the server verifier
bun run fixtures    # re-record the Mezo Testnet fixtures used by the test suite
bun run build       # production build
```

GitHub Actions runs type checking, lint, tests and the production build on every
push (`.github/workflows/ci.yml`).

`blockchain.test.ts` covers:

- chain 31611 and canonical token/protocol addresses
- testnet explorer links (no mainnet)
- ERC-20 and `openTrove` call encoding
- token/price amount math
- trove planning, 1,800 MUSD minimum net debt and health
- server verification: success, wrong chain, wrong recipient, low amount,
  reverted tx, insufficient confirmations
- trove verification from decoded calls and `TroveUpdated` events
- repayment verification from MUSD burn logs, including `closeTrove()`
- ledger bridge: MUSD/BTC deposits, expense settlement debit, withdrawals,
  trove open/repay and hash-chain integrity
- live mode refusing ledger-only value movements, demo mode paying only after
  the chosen approver signs, and the admin-only auto-approval limit (strictly
  under it pays with no signature; at or above it stays pending)

`src/lib/chain/verify.fixtures.test.ts` replays real Mezo Testnet receipts
recorded in `src/test/fixtures/mezo-receipts.json`, and
`src/lib/chain/guards.test.ts` covers the self-transfer guard. `TESTING.md`
documents every automated test and the manual testnet checks (connect, link,
fund, approve, pay, withdraw, open trove, partial repay, close) with expected
explorer results.

---

## Security model

- RLS is enabled on every Supabase table; there are no client write policies.
- Server functions derive the acting member from the authenticated user.
- The server verifies every on-chain event; the client cannot invent balances.
- Trove confirmations decode the exact `BorrowerOperations` call and require the
  matching `TroveUpdated` operation, so stale or unrelated trove state cannot be
  passed off as a new borrow or repayment.
- Repayment amounts come from MUSD burn logs, never from client input.
- Trove opens and repayments are recorded only after **3 confirmations**
  (`REQUIRED_TROVE_CONFIRMATIONS`); plain transfers use 1.
- Opening a trove through KinVault requires the treasury to hold ≥ 1 MEZO
  (KinVault participation policy, enforced pre-sign and server-side).
- `onchain_transactions` has a unique tx hash for replay protection.
- MUSD/MEZO/protocol addresses are constants; no user-supplied token address is
  trusted.
- Testnet only. Do not reuse this configuration with real funds without an audit.

### Known limitations

These are real, and they are stated here rather than left to be discovered.

**The treasury is a single EOA, so the two-signature rule is enforced by this app,
not by the chain.** `families.treasury_address` is one wallet, and only that
wallet can settle an expense, withdraw or open a trove
(`src/lib/family.functions.ts`). The "your chosen guardians must approve" rule lives in
`src/lib/vault-logic.ts` and the server ledger: the key holder could bypass
KinVault entirely and send MUSD from the treasury wallet with any wallet client.
The rule is genuine for everyone using the app and worthless against the key
holder. Moving the treasury to a 2-of-3 Safe — so an approval is a signature the
chain requires — is the top item on the roadmap. Until then, the family's
protection against a rogue guardian is social and visible (every ledger entry is
hash-chained and every movement is explorer-linkable), not cryptographic.

**The ledger and the chain can disagree, on purpose.** `vault.musd` and
`vault.btc` count only funds that moved *through KinVault* and passed server
verification. The dashboard therefore also shows the treasury's live on-chain
balance, read from Mezo, labelled "On-chain treasury" — so a treasury funded
before KinVault recorded anything reads $0 in the ledger and its real balance
next to it. Nothing is adopted automatically: crediting an unverified balance is
exactly the failure mode that was found and removed earlier in this project.

**A treasury can be designated without a transfer.** An admin can save their own
connected wallet as the treasury (`setTreasuryAddress`, "Use my connected wallet
as the treasury" in the Fund dialog) while it is still unset. That action moves
no funds and credits nothing; it only fixes which address the family will use.

**Rate limiting is per instance.** `src/lib/rate-limit.server.ts` is an
in-process fixed window on the invite, join, create-family and vault-action
functions. On Vercel each warm instance keeps its own counter, so the effective
limit scales with instance count. It stops a single client from hammering an
endpoint; it is not a distributed limiter. Moving it to a shared store
(Upstash/Redis) behind the same `rateLimit()` signature is still outstanding:
no shared-store credentials are configured for this deployment, so the code
was not switched to a backend it cannot reach.

**The MEZO gate is a KinVault policy, not protocol enforcement.** Holding
≥ 1 MEZO unlocks borrowing *in this app* (checked pre-sign and server-side).
Mezo's BorrowerOperations does not require MEZO, and nothing stops a treasury
from borrowing outside KinVault without it. It gives MEZO a real function in
the product; it is not staking, collateral, or a fee.

**Fork execution tests are still outstanding.** The verifier is tested with
mocks plus real recorded receipts. There is no Anvil/Hardhat fork job that
executes an open → repay → close cycle, because no fork toolchain is part of
this repo's stack. That is the next testing investment, not a completed one.

**There are no Solidity contracts in this repository.** KinVault consumes Mezo's
deployed MUSD and BorrowerOperations. That is a deliberate scope choice — the
interesting problem here is family governance and receipt verification — but it
does mean "smart contract design" is not something this submission demonstrates.

**Testnet only.** No mainnet configuration exists anywhere in the codebase, by
design.

---

## Deployment

The build produces a standard Nitro Node server in `.output/server/index.mjs`.

**Docker (any host):**

```sh
docker build -t kinvault .
docker run --rm -p 3000:3000 --env-file .env.production kinvault
```

**Vercel:** the repo includes `vercel.json`; Nitro's Vercel preset writes
`.vercel/output`. Build command `bun run build`, install command
`bun install --frozen-lockfile`.

**Netlify / Render:** build command `bun run build`, start command
`node .output/server/index.mjs`.

Set the environment variables from the table above in the host. `VITE_*`
variables are inlined at build time; `SUPABASE_SERVICE_ROLE_KEY` is read at
runtime and must never be exposed to the browser.

Apply the Drizzle migrations in `drizzle/migrations/` to the production Supabase
project before the first live transaction, and add the deployed origin to
Supabase Auth → URL Configuration so sign-in redirects work.

---

## Buildathon notes

- Track: **Access & Distribution** (family MUSD interface) and/or **DeFi**
  (protocol-native borrowing through BorrowerOperations).
- Chain: **Mezo Testnet**.
- Status: existing product with a new MUSD/test-BTC integration.
- The app keeps a **demo mode** (simulated Riveras) so reviewers can click
  through without a wallet; live mode uses real testnet assets and explorer-
  verifiable transactions.

### Live deployment

- **Live app:** https://kinvault-six.vercel.app
- **Repository:** https://github.com/MaxisAlexander/KinVault

```text
https://kinvault-six.vercel.app
```

The app is deployed on Vercel from `main`; every push to `main` triggers a
production deployment. `vercel.json` selects Nitro's Vercel preset.

`SUBMISSION.md` tracks the remaining submission-form items.

---

## Business model

There is no revenue today. This section is the plan, written down so it can be
argued with rather than assumed.

**Who pays.** The household, not the merchant and not the protocol. A family that
already holds Bitcoin and wants a shared account with rules is the buyer; the
teenager who spends from it is not.

**What they are buying.** Not a wallet — a policy layer. The approval thresholds,
the daily allowances, the lockboxes and the hash-chained receipt log are the
product. Any wallet can hold MUSD; none of them can tell a fifteen-year-old "you
have $50 today and School and Groceries only".

**Three ways it could earn, in order of how much I believe them.**

1. **Origination fee on MUSD borrowed through KinVault.** The borrow flow is the
   monetisable moment: a family that mints 3,000 MUSD against its BTC to pay for a
   roof is already paying Mezo's borrowing fee, and a 0.25% KinVault fee on
   principal (7.5 MUSD in that example) is small next to the alternative of
   selling the Bitcoin. This is the only line that scales with the thing the
   product is actually for.
2. **Subscription.** $4 per month per family for the rules engine, the receipt
   log and multi-guardian approvals. Predictable, and matches how family-finance
   apps already price (Greenlight, Acorns Early). It also caps the market: this is
   a paid product in a category where most people expect free banking.
3. **White label.** Wallets and credit unions on Mezo that want a household mode
   can license the policy engine and the verification layer. Highest ceiling,
   longest sales cycle, and it only becomes credible after (1) works.

**Why it is defensible.** The verification layer is the moat that is cheapest to
build first and hardest to copy badly: the browser sends a hash, the server
re-derives the chain, contract, sender, recipient, amount, decoded call and
emitted event before the ledger moves. A competitor can copy the UI in a week; a
competitor that copies the UI without copying the verification will ship a product
where a client can invent a deposit.

**What would have to be true.** Families would need to hold MUSD, which means Mezo
needs a fiat on-ramp and a card or bill-pay rail before a household can use this
for groceries rather than for a one-off purchase. That is the honest dependency:
KinVault is a consumer product sitting on infrastructure that is still testnet.

---

## Roadmap

- 2-of-3 Safe (or a dedicated KinVault vault contract) as the treasury, replacing
  the testnet EOA treasury.
- Contract/integration tests against a forked Mezo Testnet.
- Mainnet deployment and a third-party audit.
- Recurring allowance automation and merchant address book.
