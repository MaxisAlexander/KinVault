import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import { getMyVault } from "@/lib/family.functions";
import { actions, setRefreshHook, useVault } from "@/lib/vault-store";
import { startMezoHeartbeat, useMezo } from "@/lib/mezo";

const DEMO_KEY = "kinvault:demo";

/** Remember that this tab should show the sample family, even when signed in. */
export function setDemoPreference(on: boolean) {
  if (typeof window === "undefined") return;
  if (on) sessionStorage.setItem(DEMO_KEY, "1");
  else sessionStorage.removeItem(DEMO_KEY);
}

export const vaultQueryKey = ["my-vault"] as const;

export type SessionStatus = "resolving" | "demo" | "live";

/**
 * Decides whether the vault pages show the signed-in family (saved in Supabase)
 * or the sample demo family, and keeps the live family in sync.
 */
export function useVaultSession(): {
  status: SessionStatus;
  signedIn: boolean;
  email: string | null;
} {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchVault = useServerFn(getMyVault);
  const [auth, setAuth] = useState<{
    ready: boolean;
    signedIn: boolean;
    email: string | null;
    demo: boolean;
  }>({
    ready: false,
    signedIn: false,
    email: null,
    demo: false,
  });
  const familyId = useVault((s) => s.familyId);
  const btcUsd = useMezo((s) => s.btcUsd);

  useEffect(() => startMezoHeartbeat(), []);

  useEffect(() => {
    let alive = true;
    const read = () =>
      supabase.auth.getSession().then(({ data }) => {
        if (!alive) return;
        setAuth({
          ready: true,
          signedIn: Boolean(data.session),
          email: data.session?.user.email ?? null,
          demo: sessionStorage.getItem(DEMO_KEY) === "1",
        });
      });
    void read();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") void read();
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const wantLive = auth.ready && auth.signedIn && !auth.demo;

  const query = useQuery({
    queryKey: vaultQueryKey,
    queryFn: () => fetchVault(),
    enabled: wantLive,
    staleTime: 15_000,
  });

  useEffect(() => {
    if (auth.ready && !wantLive) actions.enterDemo();
  }, [auth.ready, wantLive]);

  useEffect(() => {
    if (!wantLive || query.status !== "success") return;
    if (query.data) actions.hydrateLive(query.data);
    else void navigate({ to: "/onboarding" });
  }, [wantLive, query.status, query.data, navigate]);

  useEffect(() => {
    if (btcUsd) actions.setPrice(btcUsd);
  }, [btcUsd]);

  useEffect(() => {
    setRefreshHook(() => void queryClient.invalidateQueries({ queryKey: vaultQueryKey }));
    return () => setRefreshHook(null);
  }, [queryClient]);

  // Other family members' changes stream in live.
  useEffect(() => {
    if (!wantLive || !familyId) return;
    const channel = supabase
      .channel(`vault-${familyId}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "vault_ledgers",
          filter: `family_id=eq.${familyId}`,
        },
        () => void queryClient.invalidateQueries({ queryKey: vaultQueryKey }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [wantLive, familyId, queryClient]);

  let status: SessionStatus = "resolving";
  if (auth.ready && !wantLive) status = "demo";
  else if (wantLive && query.data && familyId === query.data.family.id) status = "live";
  if (wantLive && query.isError) status = "demo";

  return { status, signedIn: auth.signedIn, email: auth.email };
}
