# Audit follow-up: the self-transfer credits

An independent review of this repository found that the deposit verifier accepted
a transfer whose sender and recipient were the same address. Three early test
deposits were exactly that, so the family ledgers held balances that no
transaction had actually moved.

This folder records what was removed and why, so the change is auditable rather
than invisible.

## What was wrong

`verifyMusdTransfer` and `verifyNativeBtcTransfer` checked the recipient, the
sender, the amount and the contract — but not that the two addresses differed.
`confirmMusdDeposit` and `confirmBtcDeposit` bound the treasury to the depositor's
own linked wallet on the first deposit, so `from == to` passed every check and the
ledger was credited for a transfer that moved nothing.

Verified on Mezo Testnet RPC before the fix:

| Transaction | Amount | Sender | Recipient |
| --- | --- | --- | --- |
| `0x3d55…2371` | 0.04 BTC | `0x4259…214d` | `0x4259…214d` |
| `0x5c61…e6d6` | 100 MUSD | `0x4259…214d` | `0x4259…214d` |
| `0x4e1e…1379` | 0.01 BTC | `0x5ce6…bc6` | `0x5ce6…bc6` |

## What changed

1. `src/lib/chain/guards.ts` adds `sameAddress` and `assertNotSelfTransfer`.
2. `confirmMusdDeposit` and `confirmBtcDeposit` reject a transfer whose sender is
   the treasury, before the receipt is even fetched, and the treasury address is
   only written to the database after that check passes.
3. `FundVaultDialog` refuses to start a transfer from the treasury wallet and no
   longer pre-fills the treasury field with the connected wallet.
4. `src/lib/chain/guards.test.ts` covers the guard, and
   `src/lib/chain/verify.fixtures.test.ts` replays the real self-transfer receipts
   to prove the guard is what stops them.

## What was removed from the database

- The three rows above were deleted from `onchain_transactions`. Their full
  contents are preserved in `purged-self-transfers.json` next to this file.
- The two affected family ledgers had their vault balances reset to zero and the
  matching "funded the family vault" activity entries removed. The remaining
  activity chain was re-sealed and still passes the ledger explorer's
  **Verify chain** check.

No genuine transaction was affected: nothing in the three hashes ever moved value
between two parties.
