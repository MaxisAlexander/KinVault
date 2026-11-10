# Testing KinVault

KinVault has two test surfaces: a fully offline automated suite that runs in CI,
and a read-only/manual Mezo Testnet checklist that produces explorer evidence.

## 1. Automated checks

```sh
bun install
bun run test        # 58 unit/integration tests across 4 files
bunx tsc --noEmit   # strict TypeScript check
bun run build       # production build
bun run lint        # ESLint
```

The suite never signs a transaction and never depends on the network.

| File                            | What it covers                                                                     |
| ------------------------------- | ---------------------------------------------------------------------------------- |
| `blockchain.test.ts`            | Chain config, amount math, trove planning, receipt verification, live ledger rules |
| `src/lib/vault-logic.test.ts`   | Approval thresholds, allowances, lockboxes, loan math, freeze rules                |
| `src/lib/wallet-auth.test.ts`   | Wallet signature message and nonce handling                                        |
| `src/test/app-routing.test.tsx` | Route rendering and auth-safe redirects                                            |

### Blockchain coverage

`blockchain.test.ts` asserts:

- chain `31611`, canonical MUSD/MEZO addresses, and testnet-only explorer links;
- ERC-20 `transfer` and `BorrowerOperations.openTrove` calldata encoding;
- 18-decimal MUSD/BTC parsing and Mezo `PriceFeed` conversion;
- `planTrove` adds the 200 MUSD gas compensation, enforces the live
  `minNetDebt()` (1,800 MUSD), and rejects unsafe collateral ratios;
- `verifyMusdTransfer` rejects the wrong chain, wrong recipient, low amount,
  reverted receipts and insufficient confirmations;
- `verifyTroveOpened` decodes `openTrove`, requires a matching
  `TroveUpdated(_operation = 0)` event, and rejects collateral that does not
  equal `tx.value`;
- `verifyTroveRepaid` decodes `repayMUSD`/`closeTrove`, requires
  `TroveUpdated(_operation = 1 or 2)`, and derives `repaidWei` from MUSD
  `Transfer(owner, 0x0, amount)` burn logs;
- the ledger bridge credits deposits, debits verified expense settlements,
  credits borrowed MUSD while locking BTC, debits repaid MUSD while unlocking
  collateral on close, and records treasury withdrawals;
- live mode refuses ledger-only `deposit`, `withdraw`, `openLoan` and
  `repayLoan` actions;
- live expenses are approved without a ledger debit; only the verified
  on-chain payment debits the treasury;
- live lockbox contributions earmark treasury MUSD (the token stays in the
  treasury wallet), and releasing one returns the earmark to the spendable
  treasury balance so guardians can withdraw it to the child's wallet;
- demo mode still pays instant expenses immediately.

## 2. Read-only Mezo Testnet smoke test

```sh
bun run test:live
```

This calls the public Mezo Testnet RPC and asserts:

- chain ID is `31611`;
- MUSD is `0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503` with 18 decimals;
- MEZO is `0x7B7c000000000000000000000000000000000001` with 18 decimals;
- `PriceFeed.fetchPrice()` is greater than zero;
- `TroveManager.MCR()` is 110%;
- `BorrowerOperations.MUSD_GAS_COMPENSATION()` is 200 MUSD;
- `BorrowerOperations.minNetDebt()` is 1,800 MUSD;
- `BorrowerOperations.MIN_NET_DEBT_MIN()` is 50 MUSD.

Set `MEZO_TEST_ADDRESS=0x...` to print a treasury's BTC, MUSD, MEZO and trove
state. The script is read-only and safe to run against the public RPC.

## 3. Manual testnet checklist

Use two browser profiles or two wallets: one guardian/treasury wallet and one
member wallet.

### Setup

1. Add Mezo Testnet to the wallet: chain `31611` (`0x7b7b`), RPC
   `https://rpc.test.mezo.org`, explorer `https://explorer.test.mezo.org`.
2. Get test BTC and MEZO from `https://faucet.test.mezo.org/`.
3. Borrow or swap for test MUSD in `https://testnet.mezo.org`.
4. Start the app with `bun run dev` and sign in.
5. Create a family, or open the seeded demo family and switch to live mode by
   signing in with a real family.
6. Link the treasury wallet to the admin seat (wallet menu → link profile), and
   link the second wallet to another seat.
7. Fund the treasury with a small test MUSD amount.

Expected: the dashboard shows the MUSD balance only after the server verifies
the receipt. The activity entry links to the exact Mezo Testnet transaction.

### Fund with MUSD

1. Dashboard → **Fund MUSD** → enter `1` → sign the ERC-20 `transfer`.
2. Open the explorer link from the success toast.

Expected: the transaction calls the canonical MUSD contract, transfers from the
member wallet to the treasury, and the ledger credits `1` MUSD once. Replaying
the same hash is rejected as already recorded.

### Fund with test BTC

1. Dashboard → **Fund test BTC** → enter `0.001` → sign the native transfer.

Expected: the explorer shows a native value transfer to the treasury; the
server verifies sender, recipient, value and confirmations before crediting.

### Expense approval and payment

1. **Log expense** for `$42` (under the $100 instant limit).
2. In live mode the expense is approved immediately but the treasury is **not**
   debited yet.
3. As the treasury wallet, click **Pay MUSD** on the approved expense, confirm
   the merchant address, and sign the MUSD transfer.

Expected: the server verifies the treasury as sender, the merchant as recipient,
the amount, chain and confirmations. Only then does the ledger debit the
treasury. The expense row shows an **On-chain** explorer link.

For an expense of `$150`, two distinct guardians must approve it first; the
requester cannot approve their own expense. Approval still does not debit the
treasury — the verified payment does.

### Withdraw to a member

1. Link a second member's wallet.
2. Dashboard → **Withdraw** → choose MUSD or BTC, pick the member, enter an
   amount, and sign as the treasury wallet.

Expected: the server verifies the treasury as sender, the member's linked wallet
as recipient, the asset and the amount. The ledger debits the verified amount;
the activity entry links to the explorer. The treasury cannot withdraw to
itself, and a member without a linked wallet is not offered as a recipient.

### Open a Mezo trove

1. Ensure the treasury wallet holds test BTC.
2. Loans → **Open trove on Mezo Testnet** → collateral `0.01` BTC, borrow
   `2000` MUSD (Mezo requires at least `1,800` MUSD net debt plus `200` MUSD gas
   compensation).
3. Sign `openTrove`.

Expected: the transaction calls `BorrowerOperations`, emits
`TroveUpdated(_operation = 0)`, and sends the borrowed MUSD to the treasury. The
server decodes the `openTrove` call, checks `tx.value` equals the event
collateral, and records the loan. The protocol panel shows the live trove.

### Partial repay

1. Loans → protocol panel → enter a repayment smaller than the debt.
2. Sign `repayMUSD`.

Expected: the server requires `TroveUpdated(_operation = 2)` and sums the MUSD
burn logs. The ledger debits the burned amount, not a client-supplied number.

### Close the trove

1. Click **Close trove**.

Expected: the wallet calls `closeTrove()`, which burns the debt minus the 200
MUSD gas compensation and returns the BTC collateral. The server requires
`TroveUpdated(_operation = 1)`, confirms `getTroveStatus == 2`, and unlocks the
collateral in the ledger. A full repayment through `repayMUSD` is intentionally
not used because it cannot burn the gas compensation.

### Rejection cases

These must all fail without changing the ledger:

- a transaction hash from another chain;
- a MUSD transfer to the wrong recipient;
- a native BTC transfer to the wrong recipient;
- a reverted transaction;
- a transaction with too few confirmations;
- replaying a hash already present in `onchain_transactions`;
- a non-`openTrove` transaction submitted to `confirmTroveOpen`;
- an `openTrove` event whose collateral differs from `tx.value`;
- a repayment with no MUSD burn log;
- a borrow below the live `minNetDebt()`;
- a live deposit/withdraw/loan action sent through `dispatchVaultAction`.

## 4. Demo mode

Open the app without signing in and use the seeded Rivera family. Demo mode is
deliberately optimistic and includes a simulated BTC price tick and MUSD yield.
It is clearly separated from live mode; live families never accrue simulated
yield and never apply a ledger balance before the server verifies the chain.

## 5. Database migrations

Apply the SQL files in `drizzle/migrations/` in order:

1. `0000_family_vault.sql`
2. `0001_wallet_login_nonces.sql`
3. `0002_onchain_transactions.sql`
4. `0003_withdrawals.sql`

The server requires `SUPABASE_SERVICE_ROLE_KEY` for verified ledger writes. The
browser only receives the publishable key. `.env` is git-ignored; copy
`.env.example` to `.env` and fill in the values.
