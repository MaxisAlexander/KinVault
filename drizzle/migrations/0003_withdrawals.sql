-- Verified treasury withdrawals. A withdrawal is a real Mezo Testnet transfer
-- from the family treasury to a member's linked wallet, so it is recorded in
-- the same append-only onchain_transactions table as deposits and payments.
ALTER TABLE public.onchain_transactions
  DROP CONSTRAINT IF EXISTS onchain_transactions_kind_check;

ALTER TABLE public.onchain_transactions
  ADD CONSTRAINT onchain_transactions_kind_check
  CHECK (
    kind IN (
      'musd_deposit',
      'btc_deposit',
      'musd_payment',
      'musd_withdrawal',
      'btc_withdrawal',
      'trove_open',
      'trove_repay'
    )
  );
