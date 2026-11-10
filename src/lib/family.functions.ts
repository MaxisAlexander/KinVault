import { createServerFn } from "@tanstack/react-start";
import { formatEther, formatUnits, parseUnits } from "viem";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import { DEMO_MERCHANT_ADDRESS, MUSD } from "./chain/config";
import { vaultActionSchema, type Ledger, type VaultAction } from "./vault-engine";
import type { VaultPayload } from "./vault-store";

const roleSchema = z.enum(["admin", "spouse", "teen", "kid"]);
const nameSchema = z.string().trim().min(1, "Add a name").max(40);
const ageSchema = z.number().int().min(0).max(120);
const familyNameSchema = z.string().trim().min(1, "Name your family").max(60);
const txHashSchema = z.string().regex(/^0x[0-9a-fA-F]{64}$/, "That isn't a Mezo transaction hash");
const addressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/, "That isn't a valid Mezo address");

type ActionResponse = { ok: boolean; message: string; ledger: Ledger | null; version: number };

function onchainRef(v: {
  txHash: string;
  blockNumber: bigint;
  confirmations: number;
  token: string;
  from: string;
  to: string;
  amountWei: bigint;
}) {
  return {
    chainId: 31611 as const,
    txHash: v.txHash,
    blockNumber: Number(v.blockNumber),
    confirmations: v.confirmations,
    token: v.token,
    from: v.from,
    to: v.to,
    amountWei: v.amountWei.toString(),
  };
}

function amountNumber(wei: bigint, decimals = 18): number {
  return Number(formatUnits(wei, decimals));
}

function onchainTroveRef(
  v: { txHash: string; blockNumber: bigint; confirmations: number; owner: string },
  amountWei: bigint,
) {
  return {
    chainId: 31611 as const,
    txHash: v.txHash,
    blockNumber: Number(v.blockNumber),
    confirmations: v.confirmations,
    token: MUSD.address,
    from: v.owner,
    to: v.owner,
    amountWei: amountWei.toString(),
  };
}

/**
 * Value-moving actions that a server-backed (live) family must settle through a
 * verified Mezo transaction. The engine enforces this too; the explicit guard
 * here keeps the rule visible at the API boundary.
 */
const CHAIN_ONLY_ACTIONS = new Set<VaultAction["type"]>([
  "deposit",
  "withdraw",
  "openLoan",
  "repayLoan",
]);

/** The signed-in user's family vault, or null when they haven't joined one yet. */
export const getMyVault = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<VaultPayload | null> => {
    const srv = await import("./family.server");
    return srv.buildPayload(context.userId, context.supabase);
  });

export const createFamily = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        familyName: familyNameSchema,
        me: z.object({ name: nameSchema, age: ageSchema }),
        members: z
          .array(z.object({ name: nameSchema, role: roleSchema, age: ageSchema }))
          .max(5, "A family vault holds up to 6 members"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const srv = await import("./family.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const engine = await import("./vault-engine");
    const logic = await import("./vault-logic");

    if (await srv.findMembership(context.userId))
      throw new Error("You already belong to a family vault");

    const { data: fam, error: famErr } = await supabaseAdmin
      .from("families")
      .insert({ name: data.familyName, created_by: context.userId })
      .select("id, name")
      .single();
    if (famErr) throw new Error(famErr.message);

    try {
      const base = Date.now();
      const rows = [
        {
          family_id: fam.id,
          user_id: context.userId,
          display_name: data.me.name,
          role: "admin",
          age: data.me.age,
          joined_at: new Date().toISOString(),
          created_at: new Date(base).toISOString(),
        },
        ...data.members.map((m, i) => ({
          family_id: fam.id,
          user_id: null,
          display_name: m.name,
          role: m.role,
          age: m.age,
          joined_at: null,
          created_at: new Date(base + (i + 1) * 1000).toISOString(),
        })),
      ];
      const { data: inserted, error: memErr } = await supabaseAdmin
        .from("family_members")
        .insert(rows)
        .select("id, family_id, user_id, display_name, role, age, wallet_address, created_at");
      if (memErr) throw new Error(memErr.message);

      const invites = inserted
        .filter((r) => r.user_id === null)
        .map((r) => ({ member_id: r.id, family_id: fam.id, code: srv.newInviteCode() }));
      if (invites.length) {
        const { error } = await supabaseAdmin.from("family_invites").insert(invites);
        if (error) throw new Error(error.message);
      }

      const me = inserted.find((r) => r.user_id === context.userId)!;
      let ledger = srv.syncMembers(engine.emptyLedger(new Date()), inserted as never);
      ledger = {
        ...ledger,
        allowances: Object.fromEntries(
          inserted.map((r) => [
            r.id,
            logic.defaultAllowance(r.role as "admin" | "spouse" | "teen" | "kid"),
          ]),
        ),
      };
      const block = await srv.fetchMezoBlock();
      ledger = engine.logFamilyEvent(
        ledger,
        srv.serverCtx(me.id, { block }),
        `created the ${fam.name} family vault`,
      );

      const { error: ledErr } = await supabaseAdmin
        .from("vault_ledgers")
        .insert({ family_id: fam.id, state: ledger as never, version: 1 });
      if (ledErr) throw new Error(ledErr.message);
    } catch (e) {
      await supabaseAdmin.from("families").delete().eq("id", fam.id);
      throw e;
    }
    return srv.buildPayload(context.userId, context.supabase);
  });

/** Who an invite code is for — lets the join screen confirm before claiming the seat. */
export const previewInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ code: z.string().trim().min(4).max(40) }).parse(input),
  )
  .handler(async ({ data }) => {
    const srv = await import("./family.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: inv } = await supabaseAdmin
      .from("family_invites")
      .select("member_id, family_id")
      .eq("code", srv.normalizeCode(data.code))
      .maybeSingle();
    if (!inv) return null;
    const [{ data: fam }, { data: seat }] = await Promise.all([
      supabaseAdmin.from("families").select("name").eq("id", inv.family_id).single(),
      supabaseAdmin
        .from("family_members")
        .select("display_name, role, user_id")
        .eq("id", inv.member_id)
        .single(),
    ]);
    if (!fam || !seat || seat.user_id) return null;
    return { familyName: fam.name, seatName: seat.display_name, role: seat.role };
  });

export const joinFamily = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ code: z.string().trim().min(4).max(40) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const srv = await import("./family.server");
    const engine = await import("./vault-engine");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (await srv.findMembership(context.userId))
      throw new Error("You already belong to a family vault");
    const { data: inv } = await supabaseAdmin
      .from("family_invites")
      .select("member_id, family_id")
      .eq("code", srv.normalizeCode(data.code))
      .maybeSingle();
    if (!inv) throw new Error("That invite code isn't valid or was already used");

    // Claim atomically: only succeeds while the seat is still unclaimed.
    const { data: claimed, error } = await supabaseAdmin
      .from("family_members")
      .update({ user_id: context.userId, joined_at: new Date().toISOString() })
      .eq("id", inv.member_id)
      .is("user_id", null)
      .select("id, display_name");
    if (error) throw new Error(error.message);
    if (!claimed || claimed.length !== 1) throw new Error("That seat has already been claimed");
    await supabaseAdmin.from("family_invites").delete().eq("member_id", inv.member_id);

    const block = await srv.fetchMezoBlock();
    await srv.mutateLedger(inv.family_id, (ledger) => ({
      ledger: engine.logFamilyEvent(
        ledger,
        srv.serverCtx(inv.member_id, { block }),
        "joined the family vault",
      ),
      result: null,
    }));
    return srv.buildPayload(context.userId, context.supabase);
  });

async function requireAdmin(userId: string) {
  const srv = await import("./family.server");
  const me = await srv.findMembership(userId);
  if (!me) throw new Error("You're not in a family vault yet");
  if (me.role !== "admin") throw new Error("Only family admins can manage members");
  return me;
}

export const addMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ name: nameSchema, role: roleSchema, age: ageSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const srv = await import("./family.server");
    const engine = await import("./vault-engine");
    const logic = await import("./vault-logic");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const me = await requireAdmin(context.userId);

    const rows = await srv.loadMemberRows(me.family_id);
    if (!logic.canAddMember(rows.length))
      throw new Error(`A family vault holds up to ${logic.MAX_FAMILY_MEMBERS} members`);

    const { data: row, error } = await supabaseAdmin
      .from("family_members")
      .insert({ family_id: me.family_id, display_name: data.name, role: data.role, age: data.age })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await supabaseAdmin
      .from("family_invites")
      .insert({ member_id: row.id, family_id: me.family_id, code: srv.newInviteCode() });

    const block = await srv.fetchMezoBlock();
    await srv.mutateLedger(me.family_id, (ledger) => ({
      ledger: engine.logFamilyEvent(
        {
          ...ledger,
          allowances: { ...ledger.allowances, [row.id]: logic.defaultAllowance(data.role) },
        },
        srv.serverCtx(me.id, { block }),
        `added a seat for ${data.name}`,
      ),
      result: null,
    }));
    return srv.buildPayload(context.userId, context.supabase);
  });

export const updateMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ memberId: z.string().uuid(), name: nameSchema, role: roleSchema, age: ageSchema })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const srv = await import("./family.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const me = await requireAdmin(context.userId);
    const rows = await srv.loadMemberRows(me.family_id);
    const target = rows.find((r) => r.id === data.memberId);
    if (!target) throw new Error("Member not found");
    const adminsLeft = rows.filter((r) => r.role === "admin" && r.id !== target.id).length;
    if (target.role === "admin" && data.role !== "admin" && adminsLeft === 0)
      throw new Error("A family needs at least one admin");

    const { error } = await supabaseAdmin
      .from("family_members")
      .update({ display_name: data.name, role: data.role, age: data.age })
      .eq("id", target.id);
    if (error) throw new Error(error.message);
    return srv.buildPayload(context.userId, context.supabase);
  });

export const removeMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ memberId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const srv = await import("./family.server");
    const engine = await import("./vault-engine");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const me = await requireAdmin(context.userId);
    if (data.memberId === me.id) throw new Error("You can't remove yourself");
    const rows = await srv.loadMemberRows(me.family_id);
    const target = rows.find((r) => r.id === data.memberId);
    if (!target) throw new Error("Member not found");

    const { result } = await srv.mutateLedger(me.family_id, (ledger) => {
      const m = ledger.members.find((x) => x.id === target.id);
      if (m && (m.btc > 1e-9 || m.musd > 0.005))
        return {
          ledger: null,
          result: "Move this member's sub-account balance out before removing them",
        };
      if (ledger.lockboxes.some((lb) => lb.beneficiaryId === target.id && lb.status === "locked"))
        return { ledger: null, result: "This member still has a locked lockbox" };
      if (ledger.expenses.some((e) => e.memberId === target.id && e.status === "pending"))
        return { ledger: null, result: "Resolve this member's pending expenses first" };
      const { [target.id]: _removed, ...allowances } = ledger.allowances;
      return {
        ledger: engine.logFamilyEvent(
          {
            ...ledger,
            members: ledger.members.filter((x) => x.id !== target.id),
            allowances,
            lockboxes: ledger.lockboxes.map((lb) => ({
              ...lb,
              guardians: lb.guardians.filter((g) => g !== target.id),
            })),
          },
          srv.serverCtx(me.id),
          `removed ${target.display_name} from the family`,
        ),
        result: null as string | null,
      };
    });
    if (result) throw new Error(result);
    const { error } = await supabaseAdmin.from("family_members").delete().eq("id", target.id);
    if (error) throw new Error(error.message);
    return srv.buildPayload(context.userId, context.supabase);
  });

export const regenerateInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ memberId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const srv = await import("./family.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const me = await requireAdmin(context.userId);
    const rows = await srv.loadMemberRows(me.family_id);
    const target = rows.find((r) => r.id === data.memberId);
    if (!target || target.user_id) throw new Error("Only unclaimed seats have invite codes");
    const { error } = await supabaseAdmin
      .from("family_invites")
      .upsert({ member_id: target.id, family_id: me.family_id, code: srv.newInviteCode() });
    if (error) throw new Error(error.message);
    return srv.buildPayload(context.userId, context.supabase);
  });

/** Apply a vault action with the family's rules on the server and save it. */
export const dispatchVaultAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ action: vaultActionSchema }).parse(input))
  .handler(async ({ data, context }): Promise<ActionResponse> => {
    const srv = await import("./family.server");
    const engine = await import("./vault-engine");
    const me = await srv.findMembership(context.userId, context.supabase);
    if (!me)
      return { ok: false, message: "You're not in a family vault yet", ledger: null, version: 0 };

    if (CHAIN_ONLY_ACTIONS.has(data.action.type)) {
      const message =
        data.action.type === "deposit" || data.action.type === "withdraw"
          ? "Move real assets from the dashboard — every transfer is verified on Mezo Testnet"
          : "Borrow and repay through Mezo BorrowerOperations in the protocol panel";
      return { ok: false, message, ledger: null, version: 0 };
    }

    const block = await srv.fetchMezoBlock();
    const ctx = srv.serverCtx(me.id, { block, onchain: true });
    const out = await srv.mutateLedger(me.family_id, (ledger) => {
      const r = engine.applyAction(ledger, data.action, ctx);
      return r.ok
        ? { ledger: r.ledger, result: { ok: true, message: r.message } }
        : { ledger: null, result: { ok: false, message: r.message } };
    });
    return { ...out.result, ledger: out.ledger, version: out.version };
  });

/** Link a Mezo wallet to your own seat after proving you control it with a signature. */
export const linkWallet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        address: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
        message: z.string().max(500),
        signature: z.string().regex(/^0x[0-9a-fA-F]+$/),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const srv = await import("./family.server");
    const { verifyMessage } = await import("viem");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const me = await srv.findMembership(context.userId);
    if (!me) throw new Error("You're not in a family vault yet");

    const issued = /Issued: (\S+)/.exec(data.message)?.[1];
    if (!data.message.includes(`Member: ${me.id}`) || !issued)
      throw new Error("Signature message doesn't match");
    if (Math.abs(Date.now() - new Date(issued).getTime()) > 10 * 60_000)
      throw new Error("Signature expired — try again");
    const valid = await verifyMessage({
      address: data.address as `0x${string}`,
      message: data.message,
      signature: data.signature as `0x${string}`,
    });
    if (!valid) throw new Error("Signature check failed");

    const { error } = await supabaseAdmin
      .from("family_members")
      .update({ wallet_address: data.address.toLowerCase() })
      .eq("id", me.id);
    if (error) throw new Error(error.message);
    return srv.buildPayload(context.userId, context.supabase);
  });

export const unlinkWallet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const srv = await import("./family.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const me = await srv.findMembership(context.userId);
    if (!me) throw new Error("You're not in a family vault yet");
    await supabaseAdmin.from("family_members").update({ wallet_address: null }).eq("id", me.id);
    return srv.buildPayload(context.userId, context.supabase);
  });

/**
 * Confirms a real MUSD transfer into the family treasury. The browser supplies
 * only the tx hash; the server verifies the token, sender, recipient, amount,
 * chain and confirmations before crediting anything.
 */
export const confirmMusdDeposit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ txHash: txHashSchema, treasuryAddress: addressSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const srv = await import("./family.server");
    const verify = await import("./chain/verify.server");
    const bridge = await import("./chain/ledger");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const me = await srv.findMembership(context.userId);
    if (!me) throw new Error("You're not in a family vault yet");
    if (!me.wallet_address) throw new Error("Link your wallet before funding the vault");
    const fam = await srv.loadFamily(me.family_id);
    const requestedTreasury = data.treasuryAddress.toLowerCase();
    const treasury = (fam.treasury_address ?? requestedTreasury).toLowerCase();
    if (!fam.treasury_address) {
      if (me.role !== "admin") throw new Error("Only an admin can set the family treasury");
      if (requestedTreasury !== treasury) throw new Error("Treasury address mismatch");
      await supabaseAdmin.from("families").update({ treasury_address: treasury }).eq("id", fam.id);
    }
    if (requestedTreasury !== treasury)
      throw new Error("This family uses a different treasury address");

    const verified = await verify.verifyMusdTransfer({
      txHash: data.txHash,
      expectedFrom: me.wallet_address as `0x${string}`,
      expectedTo: treasury as `0x${string}`,
      minAmountWei: 1n,
    });
    const amount = amountNumber(verified.amountWei);
    if (!(amount > 0)) throw new Error("The MUSD transfer was zero");

    const recorded = await srv.recordOnchainTransaction({
      tx_hash: verified.txHash,
      family_id: fam.id,
      member_id: me.id,
      kind: "musd_deposit",
      token_address: MUSD.address,
      amount,
      block_number: Number(verified.blockNumber),
    });
    if (!recorded) throw new Error("That Mezo transaction has already been recorded");

    try {
      await srv.mutateLedger(fam.id, (ledger) => {
        const ctx = srv.serverCtx(me.id, { block: Number(verified.blockNumber) });
        let next = bridge.setTreasuryAddress(ledger, treasury);
        next = bridge.creditMusdDeposit(next, ctx, {
          memberId: me.id,
          amountMusd: amount,
          ref: onchainRef(verified),
        });
        return { ledger: next, result: null };
      });
    } catch (error) {
      await srv.forgetOnchainTransaction(verified.txHash);
      throw error;
    }
    return srv.buildPayload(context.userId, context.supabase);
  });

/** Confirms a real native test-BTC transfer into the family treasury. */
export const confirmBtcDeposit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ txHash: txHashSchema, treasuryAddress: addressSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const srv = await import("./family.server");
    const verify = await import("./chain/verify.server");
    const bridge = await import("./chain/ledger");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const me = await srv.findMembership(context.userId);
    if (!me) throw new Error("You're not in a family vault yet");
    if (!me.wallet_address) throw new Error("Link your wallet before funding the vault");
    const fam = await srv.loadFamily(me.family_id);
    const requestedTreasury = data.treasuryAddress.toLowerCase();
    const treasury = (fam.treasury_address ?? requestedTreasury).toLowerCase();
    if (!fam.treasury_address) {
      if (me.role !== "admin") throw new Error("Only an admin can set the family treasury");
      await supabaseAdmin.from("families").update({ treasury_address: treasury }).eq("id", fam.id);
    }
    if (requestedTreasury !== treasury)
      throw new Error("This family uses a different treasury address");

    const verified = await verify.verifyNativeBtcTransfer({
      txHash: data.txHash,
      expectedFrom: me.wallet_address as `0x${string}`,
      expectedTo: treasury as `0x${string}`,
      minAmountWei: 1n,
    });
    const amount = amountNumber(verified.amountWei);
    if (!(amount > 0)) throw new Error("The BTC transfer was zero");

    const recorded = await srv.recordOnchainTransaction({
      tx_hash: verified.txHash,
      family_id: fam.id,
      member_id: me.id,
      kind: "btc_deposit",
      token_address: "native",
      amount,
      block_number: Number(verified.blockNumber),
    });
    if (!recorded) throw new Error("That Mezo transaction has already been recorded");

    try {
      await srv.mutateLedger(fam.id, (ledger) => {
        const ctx = srv.serverCtx(me.id, { block: Number(verified.blockNumber) });
        let next = bridge.setTreasuryAddress(ledger, treasury);
        next = bridge.creditBtcDeposit(next, ctx, {
          memberId: me.id,
          amountBtc: amount,
          ref: onchainRef(verified),
        });
        return { ledger: next, result: null };
      });
    } catch (error) {
      await srv.forgetOnchainTransaction(verified.txHash);
      throw error;
    }
    return srv.buildPayload(context.userId, context.supabase);
  });

/** Attaches a verified MUSD payment to an already-approved expense. */
export const confirmExpensePayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        txHash: txHashSchema,
        expenseId: z.string().min(1).max(64),
        merchantAddress: addressSchema.optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const srv = await import("./family.server");
    const verify = await import("./chain/verify.server");
    const bridge = await import("./chain/ledger");

    const me = await srv.findMembership(context.userId);
    if (!me) throw new Error("You're not in a family vault yet");
    if (me.role !== "admin" && me.role !== "spouse")
      throw new Error("Only guardians can settle expenses");
    if (!me.wallet_address) throw new Error("Link the treasury wallet first");
    const fam = await srv.loadFamily(me.family_id);
    if (!fam.treasury_address) throw new Error("Fund the treasury before paying expenses");
    if (me.wallet_address.toLowerCase() !== fam.treasury_address.toLowerCase()) {
      throw new Error("Only the treasury wallet can pay from the family vault");
    }
    const payload = await srv.buildPayload(context.userId, context.supabase);
    if (!payload) throw new Error("Your family vault could not be loaded");
    const expense = payload.ledger.expenses.find((e) => e.id === data.expenseId);
    if (!expense) throw new Error("Expense not found");
    if (expense.status !== "approved") throw new Error("This expense still needs approvals");
    if (expense.onchain) throw new Error("This expense is already settled on-chain");

    const merchant = (
      expense.merchantAddress ??
      data.merchantAddress ??
      DEMO_MERCHANT_ADDRESS
    ).toLowerCase();
    const amountWei = parseUnits(expense.amount.toFixed(2), 18);
    const verified = await verify.verifyMusdTransfer({
      txHash: data.txHash,
      expectedFrom: fam.treasury_address as `0x${string}`,
      expectedTo: merchant as `0x${string}`,
      minAmountWei: amountWei,
    });
    const recorded = await srv.recordOnchainTransaction({
      tx_hash: verified.txHash,
      family_id: fam.id,
      member_id: me.id,
      kind: "musd_payment",
      token_address: MUSD.address,
      amount: expense.amount,
      block_number: Number(verified.blockNumber),
    });
    if (!recorded) throw new Error("That Mezo transaction has already been recorded");

    try {
      await srv.mutateLedger(fam.id, (ledger) => {
        const ctx = srv.serverCtx(me.id, { block: Number(verified.blockNumber) });
        const next = bridge.attachExpenseSettlement(ledger, ctx, {
          expenseId: expense.id,
          amountMusd: expense.amount,
          ref: onchainRef(verified),
        });
        return { ledger: next, result: null };
      });
    } catch (error) {
      await srv.forgetOnchainTransaction(verified.txHash);
      throw error;
    }
    return srv.buildPayload(context.userId, context.supabase);
  });

/** Records a real Mezo trove opened through BorrowerOperations. */
export const confirmTroveOpen = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        txHash: txHashSchema,
        purpose: z.string().trim().min(1).max(80),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const srv = await import("./family.server");
    const verify = await import("./chain/verify.server");
    const bridge = await import("./chain/ledger");
    const client = await import("./chain/client");

    const me = await srv.findMembership(context.userId);
    if (!me) throw new Error("You're not in a family vault yet");
    if (me.role !== "admin" && me.role !== "spouse")
      throw new Error("Only guardians can open a trove");
    if (!me.wallet_address) throw new Error("Link the treasury wallet first");
    const fam = await srv.loadFamily(me.family_id);
    if (!fam.treasury_address) throw new Error("Fund the treasury before borrowing");
    if (me.wallet_address.toLowerCase() !== fam.treasury_address.toLowerCase()) {
      throw new Error("Only the treasury wallet can open a Mezo trove");
    }

    const protocol = await client.readProtocolParams();
    // The browser sends only the tx hash. Collateral, principal and debt are
    // read from the decoded openTrove call and its TroveUpdated event.
    const verified = await verify.verifyTroveOpened({
      txHash: data.txHash,
      owner: fam.treasury_address as `0x${string}`,
      minCollateralWei: 1n,
      minDebtWei: protocol.minNetDebt + protocol.gasCompensation,
      expectedFrom: fam.treasury_address as `0x${string}`,
    });
    const principalMusd = Number(formatUnits(verified.principalWei, 18));
    const debtMusd = Number(formatUnits(verified.debtWei, 18));
    const collateralBtc = Number(formatEther(verified.collateralWei));
    if (!(principalMusd > 0)) throw new Error("The verified trove borrowed no MUSD");

    const recorded = await srv.recordOnchainTransaction({
      tx_hash: verified.txHash,
      family_id: fam.id,
      member_id: me.id,
      kind: "trove_open",
      token_address: MUSD.address,
      amount: principalMusd,
      block_number: Number(verified.blockNumber),
    });
    if (!recorded) throw new Error("That Mezo transaction has already been recorded");

    try {
      await srv.mutateLedger(fam.id, (ledger) => {
        const ctx = srv.serverCtx(me.id, { block: Number(verified.blockNumber), btcPrice: 0 });
        const next = bridge.recordTroveOpen(ledger, ctx, {
          loanId: ctx.newId("l"),
          purpose: data.purpose,
          collateralBtc,
          principalMusd,
          debtMusd,
          troveOwner: fam.treasury_address!,
          ref: onchainTroveRef(verified, verified.principalWei),
        });
        return { ledger: next, result: null };
      });
    } catch (error) {
      await srv.forgetOnchainTransaction(verified.txHash);
      throw error;
    }
    return srv.buildPayload(context.userId, context.supabase);
  });

/** Records a real Mezo trove repayment. */
export const confirmTroveRepay = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        txHash: txHashSchema,
        loanId: z.string().min(1).max(64),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const srv = await import("./family.server");
    const verify = await import("./chain/verify.server");
    const bridge = await import("./chain/ledger");

    const me = await srv.findMembership(context.userId);
    if (!me) throw new Error("You're not in a family vault yet");
    if (me.role !== "admin" && me.role !== "spouse")
      throw new Error("Only guardians can repay a trove");
    if (!me.wallet_address) throw new Error("Link the treasury wallet first");
    const fam = await srv.loadFamily(me.family_id);
    if (!fam.treasury_address) throw new Error("This family has no treasury");
    if (me.wallet_address.toLowerCase() !== fam.treasury_address.toLowerCase()) {
      throw new Error("Only the treasury wallet can repay this trove");
    }
    const payload = await srv.buildPayload(context.userId, context.supabase);
    if (!payload) throw new Error("Your family vault could not be loaded");
    const loan = payload.ledger.loans.find((l) => l.id === data.loanId);
    if (!loan) throw new Error("Loan not found");
    if (loan.status !== "active") throw new Error("This loan is already closed");

    // The repayment amount comes from the MUSD burn logs, not from the client.
    const verified = await verify.verifyTroveRepaid({
      txHash: data.txHash,
      owner: fam.treasury_address as `0x${string}`,
      expectedFrom: fam.treasury_address as `0x${string}`,
    });
    const repaidMusd = Number(formatUnits(verified.repaidWei, 18));
    const remainingDebtMusd = Number(formatUnits(verified.debtWei, 18));
    if (!(repaidMusd > 0)) throw new Error("The verified repayment burned no MUSD");

    const recorded = await srv.recordOnchainTransaction({
      tx_hash: verified.txHash,
      family_id: fam.id,
      member_id: me.id,
      kind: "trove_repay",
      token_address: MUSD.address,
      amount: repaidMusd,
      block_number: Number(verified.blockNumber),
    });
    if (!recorded) throw new Error("That Mezo transaction has already been recorded");

    try {
      await srv.mutateLedger(fam.id, (ledger) => {
        const ctx = srv.serverCtx(me.id, { block: Number(verified.blockNumber) });
        const next = bridge.recordTroveRepay(ledger, ctx, {
          loanId: loan.id,
          amountMusd: repaidMusd,
          remainingDebtMusd,
          ref: onchainTroveRef(verified, verified.repaidWei),
        });
        return { ledger: next, result: null };
      });
    } catch (error) {
      await srv.forgetOnchainTransaction(verified.txHash);
      throw error;
    }
    return srv.buildPayload(context.userId, context.supabase);
  });

/**
 * Confirms a real withdrawal from the family treasury to a member's linked
 * wallet. The treasury wallet signs; the server verifies the sender, recipient,
 * asset and amount on chain before debiting the ledger.
 */
export const confirmWithdrawal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        txHash: txHashSchema,
        asset: z.enum(["MUSD", "BTC"]),
        toMemberId: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const srv = await import("./family.server");
    const verify = await import("./chain/verify.server");
    const bridge = await import("./chain/ledger");

    const me = await srv.findMembership(context.userId);
    if (!me) throw new Error("You're not in a family vault yet");
    if (me.role !== "admin" && me.role !== "spouse") {
      throw new Error("Only guardians can withdraw from the family treasury");
    }
    if (!me.wallet_address) throw new Error("Link the treasury wallet first");
    const fam = await srv.loadFamily(me.family_id);
    if (!fam.treasury_address) throw new Error("This family has no treasury yet");
    if (me.wallet_address.toLowerCase() !== fam.treasury_address.toLowerCase()) {
      throw new Error("Only the treasury wallet can sign a withdrawal");
    }

    const rows = await srv.loadMemberRows(fam.id);
    const recipient = rows.find((r) => r.id === data.toMemberId);
    if (!recipient) throw new Error("Recipient is not a family member");
    if (!recipient.wallet_address) throw new Error("That member has not linked a wallet yet");
    const recipientAddress = recipient.wallet_address.toLowerCase();
    if (recipientAddress === fam.treasury_address.toLowerCase()) {
      throw new Error("Choose a different wallet — the treasury cannot pay itself");
    }

    const verified =
      data.asset === "MUSD"
        ? await verify.verifyMusdTransfer({
            txHash: data.txHash,
            expectedFrom: fam.treasury_address as `0x${string}`,
            expectedTo: recipientAddress as `0x${string}`,
            minAmountWei: 1n,
          })
        : await verify.verifyNativeBtcTransfer({
            txHash: data.txHash,
            expectedFrom: fam.treasury_address as `0x${string}`,
            expectedTo: recipientAddress as `0x${string}`,
            minAmountWei: 1n,
          });
    const amount = amountNumber(verified.amountWei);
    if (!(amount > 0)) throw new Error("The withdrawal was zero");

    const recorded = await srv.recordOnchainTransaction({
      tx_hash: verified.txHash,
      family_id: fam.id,
      member_id: me.id,
      kind: data.asset === "MUSD" ? "musd_withdrawal" : "btc_withdrawal",
      token_address: data.asset === "MUSD" ? MUSD.address : "native",
      amount,
      block_number: Number(verified.blockNumber),
    });
    if (!recorded) throw new Error("That Mezo transaction has already been recorded");

    try {
      await srv.mutateLedger(fam.id, (ledger) => {
        const ctx = srv.serverCtx(me.id, { block: Number(verified.blockNumber) });
        const next = bridge.recordWithdrawal(ledger, ctx, {
          memberId: me.id,
          recipientId: recipient.id,
          asset: data.asset,
          amount,
          ref: onchainRef(verified),
        });
        return { ledger: next, result: null };
      });
    } catch (error) {
      await srv.forgetOnchainTransaction(verified.txHash);
      throw error;
    }
    return srv.buildPayload(context.userId, context.supabase);
  });
