-- Apply the remaining Mezo Testnet migrations in one pass.
--
-- Use this when you cannot run `drizzle-kit` against the project, for example
-- from the Supabase dashboard SQL editor. It is safe to run more than once:
-- every statement is idempotent.
--
-- It is exactly `0002_onchain_transactions.sql` followed by
-- `0003_withdrawals.sql`.

-- ---------------------------------------------------------------------------
-- 0002: treasury address + append-only verified transaction log
-- ---------------------------------------------------------------------------
ALTER TABLE public.families
  ADD COLUMN IF NOT EXISTS treasury_address text;

CREATE TABLE IF NOT EXISTS public.onchain_transactions (
  tx_hash text PRIMARY KEY,
  family_id uuid NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  member_id uuid REFERENCES public.family_members(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('musd_deposit', 'btc_deposit', 'musd_payment', 'trove_open', 'trove_repay')),
  token_address text NOT NULL,
  amount numeric(38, 18) NOT NULL,
  block_number bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS onchain_transactions_family_idx
  ON public.onchain_transactions (family_id, created_at DESC);

GRANT SELECT ON public.onchain_transactions TO authenticated;
GRANT ALL ON public.onchain_transactions TO service_role;
ALTER TABLE public.onchain_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view their family's on-chain transactions"
  ON public.onchain_transactions;

CREATE POLICY "Members can view their family's on-chain transactions"
ON public.onchain_transactions FOR SELECT TO authenticated
USING (public.is_family_member(family_id));

-- ---------------------------------------------------------------------------
-- 0003: verified treasury withdrawals
-- ---------------------------------------------------------------------------
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
