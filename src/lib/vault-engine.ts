// The vault rule engine: one pure function that applies an action to a family
// ledger. The browser runs it for instant feedback and the demo; the server runs
// the same code as the source of truth before anything is saved.
import { z } from "zod";

import { GENESIS_HASH, hashEntry, type ChainFields } from "./ledger-chain";
import {
  NO_ALLOWANCE,
  UNFROZEN,
  REQUIRED_GUARDIAN_SIGNATURES,
  REQUIRED_UNFREEZE_SIGNATURES,
  accruedYield,
  canApprove,
  canFreeze,
  canLiftFreeze,
  canRelease,
  checkApproval,
  debtWithFee,
  isFullyApproved,
  maxBorrow,
  routeExpense,
  spentToday,
  type Allowance,
  type FreezeState,
  type Role,
} from "./vault-logic";

export type Asset = "BTC" | "MUSD";

export const CATEGORIES = [
  "Groceries",
  "Utilities",
  "School",
  "Dining",
  "Healthcare",
  "Home",
] as const;
export type Category = (typeof CATEGORIES)[number];

export type Member = {
  id: string;
  name: string;
  role: Role;
  age: number;
  initials: string;
  /** Token name used for the avatar color, e.g. "chart-1". */
  tone: string;
  btc: number;
  musd: number;
  contributedBtc: number;
  contributedMusd: number;
  /** Live families: whether a real account has claimed this seat. */
  claimed?: boolean;
};

export type ExpenseStatus = "approved" | "pending" | "rejected";

/** A verified Mezo Testnet transaction attached to a ledger entry. */
export type OnchainRef = {
  chainId: 31611;
  txHash: string;
  blockNumber: number;
  confirmations: number;
  token: string;
  from: string;
  to: string;
  amountWei: string;
};

export type Expense = {
  id: string;
  memberId: string;
  category: Category;
  merchant: string;
  amount: number;
  note: string;
  date: string;
  status: ExpenseStatus;
  auto: boolean;
  approvals: string[];
  /** Allowance rules this expense broke (why it needs approval). */
  flags?: string[];
  /** Optional recipient wallet for the on-chain MUSD settlement. */
  merchantAddress?: string;
  /** Present once the expense has been settled with a verified MUSD transfer. */
  onchain?: OnchainRef;
};

export type Loan = {
  id: string;
  purpose: string;
  collateralBtc: number;
  principal: number;
  debt: number;
  openedAt: string;
  openedBy: string;
  status: "active" | "repaid";
  /** The Mezo trove owner (the family treasury wallet). */
  troveOwner?: string;
  /** Present once the trove was opened through BorrowerOperations. */
  onchainOpen?: OnchainRef;
  /** Present once the trove was repaid through BorrowerOperations. */
  onchainRepay?: OnchainRef;
};

export type Lockbox = {
  id: string;
  name: string;
  beneficiaryId: string;
  goal: number;
  balance: number;
  unlockDate: string;
  milestone: string;
  letter: { fromId: string; title: string; body: string };
  guardians: string[];
  signatures: string[];
  status: "locked" | "released";
};

export type ActivityKind =
  | "deposit"
  | "withdraw"
  | "expense"
  | "approval"
  | "loan"
  | "repay"
  | "lockbox"
  | "yield"
  | "security"
  | "family";

export type Activity = {
  id: string;
  ts: string;
  memberId: string;
  kind: ActivityKind;
  text: string;
  amount?: number | undefined;
  asset?: Asset | undefined;
  direction?: "in" | "out" | undefined;
  /** Included in the hash canonical form when present. */
  txHash?: string | undefined;
  /** Full verified receipt data (not hashed, but displayed and auditable). */
  onchain?: OnchainRef | undefined;
} & ChainFields;

export type Ledger = {
  vault: { btc: number; btcLocked: number; musd: number; yieldEarned: number };
  members: Member[];
  expenses: Expense[];
  loans: Loan[];
  lockboxes: Lockbox[];
  activity: Activity[];
  freeze: FreezeState;
  allowances: Record<string, Allowance>;
  lastAccrualAt: string;
  /** Mezo Testnet wallet that holds the family's on-chain treasury. */
  treasuryAddress?: string | null;
};

export const ACTIVITY_LIMIT = 200;

// ---------------- actions ----------------

const amount = z.number().finite().positive().max(1e12);
const text = (max: number) => z.string().trim().max(max);

export const vaultActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("deposit"),
    memberId: z.string().min(1).max(64),
    asset: z.enum(["BTC", "MUSD"]),
    amount,
    to: z.enum(["vault", "sub"]),
  }),
  z.object({
    type: z.literal("withdraw"),
    memberId: z.string().min(1).max(64),
    asset: z.enum(["BTC", "MUSD"]),
    amount,
    from: z.enum(["vault", "sub"]),
  }),
  z.object({
    type: z.literal("addExpense"),
    category: z.enum(CATEGORIES),
    merchant: text(80),
    amount,
    note: text(500),
  }),
  z.object({ type: z.literal("approveExpense"), expenseId: z.string().min(1).max(64) }),
  z.object({ type: z.literal("rejectExpense"), expenseId: z.string().min(1).max(64) }),
  z.object({
    type: z.literal("openLoan"),
    collateralBtc: amount,
    principal: amount,
    purpose: text(80),
  }),
  z.object({ type: z.literal("repayLoan"), loanId: z.string().min(1).max(64), amount }),
  z.object({ type: z.literal("contributeLockbox"), lockboxId: z.string().min(1).max(64), amount }),
  z.object({ type: z.literal("signLockbox"), lockboxId: z.string().min(1).max(64) }),
  z.object({
    type: z.literal("createLockbox"),
    name: text(80),
    beneficiaryId: z.string().min(1).max(64),
    goal: amount,
    unlockDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    milestone: text(80),
    letterTitle: text(120),
    letterBody: text(4000),
  }),
  z.object({ type: z.literal("freeze"), reason: text(200) }),
  z.object({ type: z.literal("signUnfreeze") }),
  z.object({
    type: z.literal("setAllowance"),
    memberId: z.string().min(1).max(64),
    dailyLimit: z.number().finite().min(0).max(1e9).nullable(),
    categories: z.array(z.enum(CATEGORIES)).max(CATEGORIES.length).nullable(),
  }),
]);

export type VaultAction = z.infer<typeof vaultActionSchema>;

export type EngineCtx = {
  actorId: string;
  /** Wall clock used for timestamps and "today" allowance windows. */
  now: Date;
  /** Date used for lockbox maturity (fixed in the demo). */
  today: Date;
  btcPrice: number;
  block: number | null;
  /**
   * True for server-backed families. Value-moving actions must then be settled
   * by a verified Mezo transaction, so the engine refuses to mutate balances
   * for deposits, withdrawals, loans and repayments.
   */
  onchain?: boolean;
  newId: (prefix: string) => string;
};

export type EngineResult =
  { ok: true; message: string; ledger: Ledger } | { ok: false; message: string };

const fail = (message: string): EngineResult => ({ ok: false, message });

function memberOf(l: Ledger, id: string): Member | undefined {
  return l.members.find((m) => m.id === id);
}

export function allowanceOf(l: Ledger, memberId: string): Allowance {
  return l.allowances[memberId] ?? NO_ALLOWANCE;
}

function withLog(
  l: Ledger,
  ctx: EngineCtx,
  entry: Omit<Activity, "id" | "ts" | "hash" | "prevHash" | "block" | "memberId"> & {
    memberId?: string;
  },
): Activity[] {
  const base = {
    memberId: ctx.actorId,
    ...entry,
    id: ctx.newId("a"),
    ts: ctx.now.toISOString(),
    prevHash: l.activity[0]?.hash ?? GENESIS_HASH,
    block: ctx.block,
  };
  const a: Activity = { ...base, hash: hashEntry(base) };
  return [a, ...l.activity].slice(0, ACTIVITY_LIMIT);
}

/** Credit idle-MUSD yield for the time elapsed since the last accrual. */
export function accrue(l: Ledger, now: Date): Ledger {
  const y = accruedYield(l.vault.musd, l.lastAccrualAt, now);
  if (y <= 0) return { ...l, lastAccrualAt: now.toISOString() };
  return {
    ...l,
    vault: { ...l.vault, musd: l.vault.musd + y, yieldEarned: l.vault.yieldEarned + y },
    lastAccrualAt: now.toISOString(),
  };
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Actions whose balance effects only exist on Mezo Testnet. A live family must
 * settle them through a verified transaction, never through the ledger engine.
 */
const CHAIN_ONLY_ACTIONS = new Set<VaultAction["type"]>([
  "deposit",
  "withdraw",
  "openLoan",
  "repayLoan",
]);

const CHAIN_ONLY_MESSAGE: Record<"deposit" | "withdraw" | "openLoan" | "repayLoan", string> = {
  deposit:
    "Use Fund with test BTC or MUSD on the dashboard — real assets are verified on Mezo Testnet",
  withdraw: "Use Withdraw on the dashboard — the treasury sends a real Mezo Testnet transaction",
  openLoan: "Open a real Mezo trove in the protocol panel — the ledger cannot mint MUSD",
  repayLoan: "Repay the Mezo trove in the protocol panel — the ledger cannot burn MUSD",
};

export function applyAction(l: Ledger, a: VaultAction, ctx: EngineCtx): EngineResult {
  const actor = memberOf(l, ctx.actorId);
  if (!actor) return fail("You're not a member of this family vault");
  if (ctx.onchain && CHAIN_ONLY_ACTIONS.has(a.type)) {
    return fail(CHAIN_ONLY_MESSAGE[a.type as keyof typeof CHAIN_ONLY_MESSAGE]);
  }
  const frozen = l.freeze.frozen;
  const guardian = canApprove(actor.role);

  switch (a.type) {
    case "deposit": {
      const target = memberOf(l, a.memberId);
      if (!target) return fail("Pick a family member");
      const key = a.asset === "BTC" ? "btc" : "musd";
      const members = l.members.map((m) => {
        if (m.id !== target.id) return m;
        if (a.to === "vault")
          return a.asset === "BTC"
            ? { ...m, contributedBtc: m.contributedBtc + a.amount }
            : { ...m, contributedMusd: m.contributedMusd + a.amount };
        return { ...m, [key]: m[key] + a.amount };
      });
      const vault = a.to === "vault" ? { ...l.vault, [key]: l.vault[key] + a.amount } : l.vault;
      const forOther = target.id !== actor.id;
      return {
        ok: true,
        message: "Deposit recorded",
        ledger: {
          ...l,
          members,
          vault,
          activity: withLog(l, ctx, {
            kind: "deposit",
            text:
              a.to === "vault"
                ? forOther
                  ? `deposited to the Family Vault for ${target.name}`
                  : "deposited to the Family Vault"
                : forOther
                  ? `deposited to ${target.name}'s sub-account`
                  : "deposited to their sub-account",
            amount: a.amount,
            asset: a.asset,
            direction: "in",
          }),
        },
      };
    }

    case "withdraw": {
      if (frozen) return fail("The vault is frozen — withdrawals are paused");
      const key = a.asset === "BTC" ? "btc" : "musd";
      if (a.from === "vault") {
        if (!guardian) return fail("Only admins and spouses can withdraw from the shared vault");
        const avail = a.asset === "BTC" ? l.vault.btc - l.vault.btcLocked : l.vault.musd;
        if (a.amount > avail + 1e-9) return fail("Not enough available in the vault");
      } else {
        if (a.memberId !== actor.id) return fail("You can only withdraw from your own sub-account");
        const avail = a.asset === "BTC" ? actor.btc : actor.musd;
        if (a.amount > avail + 1e-9) return fail("Not enough in this sub-account");
      }
      return {
        ok: true,
        message: "Withdrawal recorded",
        ledger: {
          ...l,
          vault: a.from === "vault" ? { ...l.vault, [key]: l.vault[key] - a.amount } : l.vault,
          members:
            a.from === "sub"
              ? l.members.map((m) => (m.id === actor.id ? { ...m, [key]: m[key] - a.amount } : m))
              : l.members,
          activity: withLog(l, ctx, {
            kind: "withdraw",
            text:
              a.from === "vault"
                ? "withdrew from the Family Vault"
                : "withdrew from their sub-account",
            amount: a.amount,
            asset: a.asset,
            direction: "out",
          }),
        },
      };
    }

    case "addExpense": {
      const merchant = a.merchant.trim();
      if (!merchant) return fail("Add where the money was spent");
      const value = r2(a.amount);
      const route = routeExpense({
        amount: value,
        category: a.category,
        frozen,
        spentToday: spentToday(l.expenses, actor.id, ctx.now),
        allowance: allowanceOf(l, actor.id),
      });
      if (route.route === "blocked") return fail(route.reason);
      const instant = route.route === "instant";
      // In a live family the expense is only *approved* here. The treasury's
      // MUSD leaves when a verified transfer is attached, so never debit twice.
      const paidNow = instant && !ctx.onchain;
      if (paidNow && value > l.vault.musd) return fail("Not enough MUSD in the vault");
      const expense: Expense = {
        id: ctx.newId("e"),
        memberId: actor.id,
        category: a.category,
        merchant,
        amount: value,
        note: a.note.trim(),
        date: ctx.now.toISOString(),
        status: instant ? "approved" : "pending",
        auto: instant,
        approvals: [],
        flags: route.flags,
      };
      return {
        ok: true,
        message: instant
          ? ctx.onchain
            ? "Approved instantly — settle it from the treasury with MUSD"
            : "Paid instantly — under the $100 auto-approve limit"
          : route.flags.length
            ? `Sent for 2-member approval · ${route.flags[0]}`
            : "Sent for 2-member approval",
        ledger: {
          ...l,
          expenses: [expense, ...l.expenses],
          vault: paidNow ? { ...l.vault, musd: l.vault.musd - value } : l.vault,
          activity: withLog(l, ctx, {
            kind: "expense",
            text: paidNow
              ? `paid ${merchant} · auto-approved`
              : instant
                ? `approved ${merchant} · awaiting on-chain payment`
                : `requested approval for ${merchant}`,
            amount: value,
            asset: "MUSD",
            direction: "out",
          }),
        },
      };
    }

    case "approveExpense": {
      const e = l.expenses.find((x) => x.id === a.expenseId);
      if (!e || e.status !== "pending") return fail("This expense is no longer pending");
      if (frozen) return fail("The vault is frozen — approvals are paused");
      const check = checkApproval({
        requesterId: e.memberId,
        approverId: actor.id,
        approverRole: actor.role,
        existingApprovals: e.approvals,
      });
      if (!check.ok) return fail(check.reason!);
      const approvals = [...e.approvals, actor.id];
      const done = isFullyApproved(approvals);
      const paidNow = done && !ctx.onchain;
      if (paidNow && e.amount > l.vault.musd)
        return fail("Not enough MUSD in the vault to pay this");
      return {
        ok: true,
        message: done
          ? ctx.onchain
            ? `${e.merchant} approved — settle it from the treasury`
            : `${e.merchant} approved and paid`
          : "Approval recorded — 1 more needed",
        ledger: {
          ...l,
          expenses: l.expenses.map((x) =>
            x.id === e.id ? { ...x, approvals, status: done ? "approved" : "pending" } : x,
          ),
          vault: paidNow ? { ...l.vault, musd: l.vault.musd - e.amount } : l.vault,
          activity: withLog(l, ctx, {
            kind: "approval",
            text: done
              ? ctx.onchain
                ? `gave final approval · ${e.merchant} ready for on-chain payment`
                : `gave final approval · ${e.merchant} paid`
              : `approved ${e.merchant} (${approvals.length} of 2)`,
            amount: done ? e.amount : undefined,
            asset: done ? "MUSD" : undefined,
            direction: done ? "out" : undefined,
          }),
        },
      };
    }

    case "rejectExpense": {
      const e = l.expenses.find((x) => x.id === a.expenseId);
      if (!e || e.status !== "pending") return fail("This expense is no longer pending");
      if (!guardian) return fail("Only admins and spouses can decline");
      return {
        ok: true,
        message: "Expense declined",
        ledger: {
          ...l,
          expenses: l.expenses.map((x) => (x.id === e.id ? { ...x, status: "rejected" } : x)),
          activity: withLog(l, ctx, { kind: "approval", text: `declined ${e.merchant}` }),
        },
      };
    }

    case "openLoan": {
      if (frozen) return fail("The vault is frozen — new loans are paused");
      if (!guardian) return fail("Only admins and spouses can borrow against family BTC");
      const free = l.vault.btc - l.vault.btcLocked;
      if (a.collateralBtc > free + 1e-9) return fail("Not enough unlocked BTC in the vault");
      if (!(ctx.btcPrice > 0))
        return fail("Bitcoin price is unavailable right now — try again shortly");
      const cap = maxBorrow(a.collateralBtc, ctx.btcPrice);
      if (a.principal > cap + 0.01)
        return fail("That's above the 80% loan-to-value limit for this collateral");
      const purpose = a.purpose.trim() || "Family loan";
      return {
        ok: true,
        message: "MUSD minted to the Family Vault — no Bitcoin sold",
        ledger: {
          ...l,
          vault: {
            ...l.vault,
            btcLocked: l.vault.btcLocked + a.collateralBtc,
            musd: l.vault.musd + a.principal,
          },
          loans: [
            {
              id: ctx.newId("l"),
              purpose,
              collateralBtc: a.collateralBtc,
              principal: a.principal,
              debt: debtWithFee(a.principal),
              openedAt: ctx.now.toISOString(),
              openedBy: actor.id,
              status: "active",
            },
            ...l.loans,
          ],
          activity: withLog(l, ctx, {
            kind: "loan",
            text: `borrowed against family BTC · ${purpose}`,
            amount: a.principal,
            asset: "MUSD",
            direction: "in",
          }),
        },
      };
    }

    case "repayLoan": {
      const loan = l.loans.find((x) => x.id === a.loanId);
      if (!loan || loan.status !== "active") return fail("Loan not active");
      const pay = Math.min(a.amount, loan.debt);
      if (pay > l.vault.musd + 1e-9) return fail("Not enough MUSD in the vault");
      const fully = loan.debt - pay < 0.005;
      return {
        ok: true,
        message: fully ? "Loan closed — collateral BTC unlocked" : "Repayment applied",
        ledger: {
          ...l,
          vault: {
            ...l.vault,
            musd: l.vault.musd - pay,
            btcLocked: fully
              ? Math.max(0, l.vault.btcLocked - loan.collateralBtc)
              : l.vault.btcLocked,
          },
          loans: l.loans.map((x) =>
            x.id === loan.id
              ? { ...x, debt: fully ? 0 : x.debt - pay, status: fully ? "repaid" : "active" }
              : x,
          ),
          activity: withLog(l, ctx, {
            kind: "repay",
            text: fully
              ? `fully repaid · ${loan.purpose} · BTC unlocked`
              : `repaid ${loan.purpose}`,
            amount: pay,
            asset: "MUSD",
            direction: "out",
          }),
        },
      };
    }

    case "contributeLockbox": {
      const lb = l.lockboxes.find((x) => x.id === a.lockboxId);
      if (!lb) return fail("Lockbox not found");
      if (lb.status === "released") return fail("This lockbox has already been released");
      // Live families keep their MUSD in the treasury wallet, not in on-chain
      // sub-accounts, so a live contribution earmarks treasury MUSD instead.
      if (ctx.onchain) {
        if (a.amount > l.vault.musd + 1e-9)
          return fail(`The treasury only has ${l.vault.musd.toFixed(2)} MUSD`);
      } else if (a.amount > actor.musd + 1e-9) {
        return fail(`${actor.name}'s sub-account only has ${actor.musd.toFixed(2)} MUSD`);
      }
      return {
        ok: true,
        message: `Locked into ${lb.name}`,
        ledger: {
          ...l,
          vault: ctx.onchain ? { ...l.vault, musd: l.vault.musd - a.amount } : l.vault,
          members: ctx.onchain
            ? l.members
            : l.members.map((m) => (m.id === actor.id ? { ...m, musd: m.musd - a.amount } : m)),
          lockboxes: l.lockboxes.map((x) =>
            x.id === lb.id ? { ...x, balance: x.balance + a.amount } : x,
          ),
          activity: withLog(l, ctx, {
            kind: "lockbox",
            text: ctx.onchain ? `set aside treasury MUSD in ${lb.name}` : `added to ${lb.name}`,
            amount: a.amount,
            asset: "MUSD",
            direction: "in",
          }),
        },
      };
    }

    case "signLockbox": {
      const lb = l.lockboxes.find((x) => x.id === a.lockboxId);
      if (!lb) return fail("Lockbox not found");
      if (lb.status === "released") return fail("Already released");
      if (frozen) return fail("The vault is frozen — releases are paused");
      if (!lb.guardians.includes(actor.id)) return fail("Only listed guardians can sign");
      if (lb.signatures.includes(actor.id)) return fail("You've already signed");
      const signatures = [...lb.signatures, actor.id];
      const release = canRelease(lb.unlockDate, ctx.today, signatures);
      const child = memberOf(l, lb.beneficiaryId);
      return {
        ok: true,
        message: release ? "Lockbox released — the letter is now open" : "Signature recorded",
        ledger: {
          ...l,
          // Live families never hold per-member tokens on chain: the MUSD stayed
          // in the treasury, so a release returns the earmark to the treasury.
          // The guardians then withdraw it to the child's linked wallet.
          vault: release && ctx.onchain ? { ...l.vault, musd: l.vault.musd + lb.balance } : l.vault,
          lockboxes: l.lockboxes.map((x) =>
            x.id === lb.id ? { ...x, signatures, status: release ? "released" : "locked" } : x,
          ),
          members:
            release && !ctx.onchain
              ? l.members.map((m) =>
                  m.id === lb.beneficiaryId ? { ...m, musd: m.musd + lb.balance } : m,
                )
              : l.members,
          activity: withLog(l, ctx, {
            kind: "lockbox",
            text: release
              ? ctx.onchain
                ? `released ${lb.name} to ${child?.name ?? "the beneficiary"} — ready to withdraw to their wallet`
                : `released ${lb.name} to ${child?.name ?? "the beneficiary"}`
              : `signed guardian unlock for ${lb.name} (${signatures.length} of ${REQUIRED_GUARDIAN_SIGNATURES})`,
            amount: release ? lb.balance : undefined,
            asset: release ? "MUSD" : undefined,
            direction: release ? "in" : undefined,
          }),
        },
      };
    }

    case "createLockbox": {
      if (!guardian) return fail("Only admins and spouses can create lockboxes");
      const name = a.name.trim();
      if (!name) return fail("Give the lockbox a name");
      if (!memberOf(l, a.beneficiaryId)) return fail("Pick who the lockbox is for");
      return {
        ok: true,
        message: "Lockbox sealed",
        ledger: {
          ...l,
          lockboxes: [
            ...l.lockboxes,
            {
              id: ctx.newId("lb"),
              name,
              beneficiaryId: a.beneficiaryId,
              goal: a.goal,
              balance: 0,
              unlockDate: a.unlockDate,
              milestone: a.milestone.trim() || "Milestone",
              letter: {
                fromId: actor.id,
                title: a.letterTitle.trim() || "A letter for later",
                body: a.letterBody.trim(),
              },
              guardians: l.members.filter((m) => canApprove(m.role)).map((m) => m.id),
              signatures: [],
              status: "locked",
            },
          ],
          activity: withLog(l, ctx, { kind: "lockbox", text: `created ${name}` }),
        },
      };
    }

    case "freeze": {
      if (!canFreeze(actor.role)) return fail("Only admins and spouses can freeze the vault");
      if (frozen) return fail("The vault is already frozen");
      const reason = a.reason.trim() || "Emergency freeze";
      return {
        ok: true,
        message: "Vault frozen — withdrawals, loans and payouts are paused",
        ledger: {
          ...l,
          freeze: {
            frozen: true,
            frozenBy: actor.id,
            frozenAt: ctx.now.toISOString(),
            reason,
            unfreezeSignatures: [],
          },
          activity: withLog(l, ctx, { kind: "security", text: `froze the vault · ${reason}` }),
        },
      };
    }

    case "signUnfreeze": {
      if (!frozen) return fail("The vault isn't frozen");
      if (!canFreeze(actor.role)) return fail("Only admins and spouses can sign an unfreeze");
      if (l.freeze.unfreezeSignatures.includes(actor.id)) return fail("You've already signed");
      const sigs = [...l.freeze.unfreezeSignatures, actor.id];
      const lifted = canLiftFreeze(sigs);
      return {
        ok: true,
        message: lifted
          ? "Freeze lifted — the vault is open again"
          : "Unfreeze signature recorded — 1 more needed",
        ledger: {
          ...l,
          freeze: lifted ? UNFROZEN : { ...l.freeze, unfreezeSignatures: sigs },
          activity: withLog(l, ctx, {
            kind: "security",
            text: lifted
              ? "gave the final unfreeze signature · vault reopened"
              : `signed to unfreeze (${sigs.length} of ${REQUIRED_UNFREEZE_SIGNATURES})`,
          }),
        },
      };
    }

    case "setAllowance": {
      if (actor.role !== "admin") return fail("Only admins can change allowances");
      const target = memberOf(l, a.memberId);
      if (!target) return fail("Pick a family member");
      return {
        ok: true,
        message: `Allowance updated for ${target.name}`,
        ledger: {
          ...l,
          allowances: {
            ...l.allowances,
            [target.id]: { dailyLimit: a.dailyLimit, categories: a.categories },
          },
          activity: withLog(l, ctx, {
            kind: "family",
            text: `updated ${target.name}'s allowance${a.dailyLimit !== null ? ` to $${a.dailyLimit}/day` : ""}`,
          }),
        },
      };
    }
  }
}

// ---------------- helpers for new families ----------------

const TONES = ["chart-1", "chart-3", "chart-5", "chart-2", "chart-4", "chart-6"];

export function toneFor(index: number): string {
  return TONES[index % TONES.length]!;
}

export function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  return (parts[0] ?? "?").slice(0, 2).toUpperCase();
}

export function emptyLedger(now: Date): Ledger {
  return {
    vault: { btc: 0, btcLocked: 0, musd: 0, yieldEarned: 0 },
    members: [],
    expenses: [],
    loans: [],
    lockboxes: [],
    activity: [],
    freeze: UNFROZEN,
    allowances: {},
    lastAccrualAt: now.toISOString(),
    treasuryAddress: null,
  };
}

/** Append a pre-built activity entry (used by the on-chain ledger bridge). */
export function appendActivity(
  l: Ledger,
  ctx: EngineCtx,
  entry: Omit<Activity, "id" | "ts" | "hash" | "prevHash" | "block" | "memberId"> & {
    memberId?: string;
  },
): Ledger {
  return { ...l, activity: withLog(l, ctx, entry) };
}

/** Append a non-financial family event (member joined, seat added) to the chain. */
export function logFamilyEvent(l: Ledger, ctx: EngineCtx, text: string): Ledger {
  return { ...l, activity: withLog(l, ctx, { kind: "family", text }) };
}
