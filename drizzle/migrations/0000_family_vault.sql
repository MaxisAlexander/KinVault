-- Families
CREATE TABLE public.families (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.families TO authenticated;
GRANT ALL ON public.families TO service_role;
ALTER TABLE public.families ENABLE ROW LEVEL SECURITY;

-- Family members (seats). A seat is claimed when user_id is set.
CREATE TABLE public.family_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  user_id uuid,
  display_name text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin', 'spouse', 'teen', 'kid')),
  age integer NOT NULL DEFAULT 0,
  wallet_address text,
  created_at timestamptz NOT NULL DEFAULT now(),
  joined_at timestamptz
);
CREATE UNIQUE INDEX family_members_one_family_per_user ON public.family_members (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX family_members_family_idx ON public.family_members (family_id);
GRANT SELECT ON public.family_members TO authenticated;
GRANT ALL ON public.family_members TO service_role;
ALTER TABLE public.family_members ENABLE ROW LEVEL SECURITY;

-- Invite codes are kept apart so only guardians can read them.
CREATE TABLE public.family_invites (
  member_id uuid PRIMARY KEY REFERENCES public.family_members(id) ON DELETE CASCADE,
  family_id uuid NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.family_invites TO authenticated;
GRANT ALL ON public.family_invites TO service_role;
ALTER TABLE public.family_invites ENABLE ROW LEVEL SECURITY;

-- Vault ledger: one JSON document per family, written only by the server after rule checks.
CREATE TABLE public.vault_ledgers (
  family_id uuid PRIMARY KEY REFERENCES public.families(id) ON DELETE CASCADE,
  state jsonb NOT NULL,
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.vault_ledgers TO authenticated;
GRANT ALL ON public.vault_ledgers TO service_role;
ALTER TABLE public.vault_ledgers ENABLE ROW LEVEL SECURITY;

-- Helper checks (security definer avoids recursive RLS on family_members)
CREATE OR REPLACE FUNCTION public.is_family_member(_family_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.family_members
    WHERE family_id = _family_id AND user_id = auth.uid()
  )
$$;

CREATE OR REPLACE FUNCTION public.is_family_guardian(_family_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.family_members
    WHERE family_id = _family_id AND user_id = auth.uid() AND role IN ('admin', 'spouse')
  )
$$;

REVOKE EXECUTE ON FUNCTION public.is_family_member(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_family_guardian(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_family_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_family_guardian(uuid) TO authenticated;

CREATE POLICY "Members can view their family"
ON public.families FOR SELECT TO authenticated
USING (public.is_family_member(id));

CREATE POLICY "Members can view family seats"
ON public.family_members FOR SELECT TO authenticated
USING (public.is_family_member(family_id));

CREATE POLICY "Guardians can view invite codes"
ON public.family_invites FOR SELECT TO authenticated
USING (public.is_family_guardian(family_id));

CREATE POLICY "Members can view the family ledger"
ON public.vault_ledgers FOR SELECT TO authenticated
USING (public.is_family_member(family_id));

-- Live updates for other family members
ALTER PUBLICATION supabase_realtime ADD TABLE public.vault_ledgers;
