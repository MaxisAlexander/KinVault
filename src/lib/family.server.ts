// Server-only helpers for family vaults. Writes go through the service client
// only after the calling server function has verified who the caller is.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database, Json } from "@/integrations/supabase/types";
import type { SupabaseClient } from "@supabase/supabase-js";

type Db = SupabaseClient<Database>;

import { readBtcPrice } from "./chain/client";
import { MEZO_TESTNET_RPC } from "./chain/config";
import { initialsFor, toneFor, type EngineCtx, type Ledger, type Member } from "./vault-engine";
import type { Role } from "./vault-logic";
import type { Seat, VaultPayload } from "./vault-store";

export type MemberRow = {
  id: string;
  family_id: string;
  user_id: string | null;
  display_name: string;
  role: string;
  age: number;
  wallet_address: string | null;
  created_at: string;
};

export function serverCtx(actorId: string, extra: Partial<EngineCtx> = {}): EngineCtx {
  const now = new Date();
  return {
    actorId,
    now,
    today: now,
    btcPrice: 0,
    block: null,
    // Every server-backed family is live: balances only move through verified
    // Mezo transactions, never through the ledger engine.
    onchain: true,
    newId: (p) => `${p}${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`,
    ...extra,
  };
}

export async function fetchMezoBlock(): Promise<number | null> {
  try {
    const res = await fetch(MEZO_TESTNET_RPC, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }),
      signal: AbortSignal.timeout(4000),
    });
    const json = (await res.json()) as { result?: string };
    return json.result ? parseInt(json.result, 16) : null;
  } catch {
    return null;
  }
}

/** Loan math must use the protocol oracle, not a market API or owner value. */
export async function fetchBtcPrice(): Promise<number | null> {
  try {
    return (await readBtcPrice()).usd;
  } catch {
    return null;
  }
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function newInviteCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  const chars = Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
  return `KV-${chars.slice(0, 5)}-${chars.slice(5)}`;
}

export function normalizeCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, "");
}

/** Make ledger members match the seats table (names/roles/claim status are authoritative there). */
export function syncMembers(ledger: Ledger, rows: MemberRow[]): Ledger {
  const ordered = [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const members: Member[] = ordered.map((r, i) => {
    const existing = ledger.members.find((m) => m.id === r.id);
    return {
      id: r.id,
      name: r.display_name,
      role: r.role as Role,
      age: r.age,
      initials: initialsFor(r.display_name),
      tone: existing?.tone ?? toneFor(i),
      btc: existing?.btc ?? 0,
      musd: existing?.musd ?? 0,
      contributedBtc: existing?.contributedBtc ?? 0,
      contributedMusd: existing?.contributedMusd ?? 0,
      claimed: r.user_id !== null,
    };
  });
  return { ...ledger, members };
}

export async function loadMemberRows(
  familyId: string,
  db: Db = supabaseAdmin,
): Promise<MemberRow[]> {
  const { data, error } = await db
    .from("family_members")
    .select("id, family_id, user_id, display_name, role, age, wallet_address, created_at")
    .eq("family_id", familyId);
  if (error) throw new Error(error.message);
  return data as MemberRow[];
}

export async function findMembership(
  userId: string,
  db: Db = supabaseAdmin,
): Promise<MemberRow | null> {
  const { data, error } = await db
    .from("family_members")
    .select("id, family_id, user_id, display_name, role, age, wallet_address, created_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as MemberRow | null) ?? null;
}

async function loadLedgerRow(
  familyId: string,
  db: Db = supabaseAdmin,
): Promise<{ state: Ledger; version: number }> {
  const { data, error } = await db
    .from("vault_ledgers")
    .select("state, version")
    .eq("family_id", familyId)
    .single();
  if (error) throw new Error(error.message);
  return { state: data.state as unknown as Ledger, version: data.version };
}

/**
 * Read-modify-write the family ledger with optimistic concurrency.
 * `fn` may return null to abort without saving.
 */
export async function mutateLedger<T>(
  familyId: string,
  fn: (
    ledger: Ledger,
    rows: MemberRow[],
  ) => { ledger: Ledger; result: T } | { ledger: null; result: T },
): Promise<{ result: T; ledger: Ledger; version: number }> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const [{ state, version }, rows] = await Promise.all([
      loadLedgerRow(familyId),
      loadMemberRows(familyId),
    ]);
    const synced = syncMembers(state, rows);
    const out = fn(synced, rows);
    if (!out.ledger) return { result: out.result, ledger: synced, version };
    const { data, error } = await supabaseAdmin
      .from("vault_ledgers")
      .update({
        state: out.ledger as unknown as Json,
        version: version + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("family_id", familyId)
      .eq("version", version)
      .select("version");
    if (error) throw new Error(error.message);
    if (data && data.length === 1)
      return { result: out.result, ledger: out.ledger, version: version + 1 };
    // someone else saved first — reload and re-apply
  }
  throw new Error("The vault is busy — please try again");
}

export type FamilyRow = { id: string; name: string; treasury_address: string | null };

export async function loadFamily(familyId: string, db: Db = supabaseAdmin): Promise<FamilyRow> {
  const { data, error } = await db
    .from("families")
    .select("id, name, treasury_address")
    .eq("id", familyId)
    .single();
  if (error) throw new Error(error.message);
  return data as FamilyRow;
}

export type OnchainTransactionRow = {
  tx_hash: string;
  family_id: string;
  member_id: string | null;
  kind:
    | "musd_deposit"
    | "btc_deposit"
    | "musd_payment"
    | "musd_withdrawal"
    | "btc_withdrawal"
    | "trove_open"
    | "trove_repay";
  token_address: string;
  amount: number;
  block_number: number | null;
};

/** Returns false when this tx hash was already consumed (replay protection). */
export async function recordOnchainTransaction(row: OnchainTransactionRow): Promise<boolean> {
  const { error } = await supabaseAdmin.from("onchain_transactions").insert(row);
  if (!error) return true;
  if (error.code === "23505") return false;
  throw new Error(error.message);
}

/** Best-effort rollback if a ledger write fails after the tx was recorded. */
export async function forgetOnchainTransaction(txHash: string): Promise<void> {
  await supabaseAdmin.from("onchain_transactions").delete().eq("tx_hash", txHash);
}

/** Build the signed-in member's vault view. Pass the caller's own client so row security applies. */
export async function buildPayload(userId: string, db: Db): Promise<VaultPayload | null> {
  const me = await findMembership(userId, db);
  if (!me) return null;
  const [{ data: fam, error: famErr }, rows, ledgerRow, { data: invites }] = await Promise.all([
    db.from("families").select("id, name, treasury_address").eq("id", me.family_id).single(),
    loadMemberRows(me.family_id, db),
    loadLedgerRow(me.family_id, db),
    // Row security only returns invite codes to admins and spouses.
    db.from("family_invites").select("member_id, code").eq("family_id", me.family_id),
  ]);
  if (famErr) throw new Error(famErr.message);
  const codes = new Map((invites ?? []).map((r) => [r.member_id, r.code]));
  // Live balances are authoritative on chain. Simulated yield is demo-only, so
  // server reads never accrue it.
  const ledger = syncMembers(ledgerRow.state, rows);
  ledger.treasuryAddress = fam.treasury_address ?? ledger.treasuryAddress ?? null;
  const seats: Seat[] = ledger.members.map((m) => {
    const row = rows.find((r) => r.id === m.id)!;
    return {
      id: m.id,
      name: m.name,
      role: m.role,
      age: m.age,
      claimed: row.user_id !== null,
      isMe: row.id === me.id,
      walletAddress: row.wallet_address,
      inviteCode: codes.get(m.id) ?? null,
    };
  });
  return {
    family: { id: fam.id, name: fam.name },
    meId: me.id,
    ledger,
    version: ledgerRow.version,
    seats,
    treasuryAddress: fam.treasury_address ?? ledger.treasuryAddress ?? null,
  };
}
