CREATE TABLE public.wallet_login_nonces (
  nonce text PRIMARY KEY,
  address text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.wallet_login_nonces TO service_role;
REVOKE ALL ON public.wallet_login_nonces FROM anon, authenticated;
ALTER TABLE public.wallet_login_nonces ENABLE ROW LEVEL SECURITY;
-- No policies: only the server (service role) records used sign-in nonces to block replays.
CREATE INDEX wallet_login_nonces_created_at_idx ON public.wallet_login_nonces (created_at);