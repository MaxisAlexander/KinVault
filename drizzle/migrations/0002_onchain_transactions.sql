-- Mezo Testnet integration: a family treasury address and an append-only
-- record of verified on-chain transactions. The tx hash primary key makes
-- replaying the same transaction impossible.
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

CREATE POLICY "Members can view their family's on-chain transactions"
ON public.onchain_transactions FOR SELECT TO authenticated
USING (public.is_family_member(family_id));
