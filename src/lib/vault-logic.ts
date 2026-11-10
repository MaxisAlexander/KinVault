// Pure family-vault rules. Kept free of React/state so they can be unit tested.

export type Role = "admin" | "spouse" | "teen" | "kid";

/** Expenses strictly below this amount (MUSD) are approved instantly. */
export const AUTO_APPROVE_LIMIT = 100;
/** Approvals needed from eligible family members for larger expenses. */
export const REQUIRED_APPROVALS = 2;
/** Guardian signatures needed to release a matured lockbox. */
export const REQUIRED_GUARDIAN_SIGNATURES = 2;

/** Mezo MUSD: positions below 110% collateral ratio can be liquidated. */
export const MIN_COLLATERAL_RATIO = 1.1;
/** Highest LTV the calculator allows (kept well below the 90.9% liquidation LTV). */
export const MAX_LTV = 0.8;
/** Fixed borrow rate and one-time issuance fee on MUSD loans. */
export const LOAN_APR = 0.01;
export const ISSUANCE_FEE = 0.001;
/** Yield paid on idle MUSD sitting in the shared vault. */
export const MUSD_SAVINGS_APY = 0.065;

export function canApprove(role: Role): boolean {
  return role === "admin" || role === "spouse";
}

export function isAutoApproved(amount: number): boolean {
  return amount < AUTO_APPROVE_LIMIT;
}

export type ApprovalCheck = {
  ok: boolean;
  reason?: string;
};

/** Can `approverId` (with `approverRole`) add an approval to an expense requested by `requesterId`? */
export function checkApproval(params: {
  requesterId: string;
  approverId: string;
  approverRole: Role;
  existingApprovals: string[];
}): ApprovalCheck {
  const { requesterId, approverId, approverRole, existingApprovals } = params;
  if (!canApprove(approverRole))
    return { ok: false, reason: "Only admins and spouses can approve" };
  if (approverId === requesterId)
    return { ok: false, reason: "You can't approve your own expense" };
  if (existingApprovals.includes(approverId)) return { ok: false, reason: "Already approved" };
  return { ok: true };
}

export function isFullyApproved(approvals: string[]): boolean {
  return new Set(approvals).size >= REQUIRED_APPROVALS;
}

// ---------- Loans ----------

export function collateralRatio(collateralUsd: number, debt: number): number {
  if (debt <= 0) return Infinity;
  return collateralUsd / debt;
}

/** Health factor 1.0 = liquidation point. Above 1 is safe-ish, higher is safer. */
export function healthFactor(collateralUsd: number, debt: number): number {
  if (debt <= 0) return Infinity;
  return collateralRatio(collateralUsd, debt) / MIN_COLLATERAL_RATIO;
}

/** BTC price at which the position becomes liquidatable. */
export function liquidationPrice(collateralBtc: number, debt: number): number {
  if (collateralBtc <= 0) return Infinity;
  return (debt * MIN_COLLATERAL_RATIO) / collateralBtc;
}

export type RiskLevel = "safe" | "moderate" | "high" | "liquidatable";

export function riskLevel(hf: number): RiskLevel {
  if (hf < 1) return "liquidatable";
  if (hf < 1.3) return "high";
  if (hf < 1.8) return "moderate";
  return "safe";
}

export function borrowFromLtv(collateralUsd: number, ltv: number): number {
  const clamped = Math.max(0, Math.min(MAX_LTV, ltv));
  return collateralUsd * clamped;
}

/** Total debt recorded when borrowing `principal` MUSD (principal + issuance fee). */
export function debtWithFee(principal: number): number {
  return principal * (1 + ISSUANCE_FEE);
}

// ---------- Lockboxes ----------

export function isMatured(unlockDate: string, today: Date): boolean {
  return today.getTime() >= new Date(unlockDate).getTime();
}

export function canRelease(unlockDate: string, today: Date, signatures: string[]): boolean {
  return isMatured(unlockDate, today) && new Set(signatures).size >= REQUIRED_GUARDIAN_SIGNATURES;
}

export function daysUntil(unlockDate: string, today: Date): number {
  const ms = new Date(unlockDate).getTime() - today.getTime();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

// ---------- Family size ----------

/** A KinVault family has at most this many members. */
export const MAX_FAMILY_MEMBERS = 6;

export function canAddMember(currentCount: number): boolean {
  return currentCount < MAX_FAMILY_MEMBERS;
}

/** Only admins manage seats, roles and invites. */
export function canManageFamily(role: Role): boolean {
  return role === "admin";
}

// ---------- Emergency freeze ----------

/** Distinct guardian signatures needed to lift an emergency freeze. */
export const REQUIRED_UNFREEZE_SIGNATURES = 2;

export type FreezeState = {
  frozen: boolean;
  frozenBy: string | null;
  frozenAt: string | null;
  reason: string | null;
  unfreezeSignatures: string[];
};

export const UNFROZEN: FreezeState = {
  frozen: false,
  frozenBy: null,
  frozenAt: null,
  reason: null,
  unfreezeSignatures: [],
};

export function isVaultFrozen(f: FreezeState | undefined | null): boolean {
  return Boolean(f?.frozen);
}

export function canFreeze(role: Role): boolean {
  return canApprove(role);
}

export function canLiftFreeze(signatures: string[]): boolean {
  return new Set(signatures).size >= REQUIRED_UNFREEZE_SIGNATURES;
}

// ---------- Allowances (daily velocity + category whitelist) ----------

export type Allowance = {
  /** Max MUSD the member may spend per UTC day without approval. null = no limit. */
  dailyLimit: number | null;
  /** Categories the member may spend on without approval. null = any category. */
  categories: string[] | null;
};

export const NO_ALLOWANCE: Allowance = { dailyLimit: null, categories: null };

/** Default guardrails for new families, by role. */
export function defaultAllowance(role: Role): Allowance {
  if (role === "teen") return { dailyLimit: 50, categories: null };
  if (role === "kid") return { dailyLimit: 15, categories: ["School", "Groceries"] };
  return NO_ALLOWANCE;
}

export function sameUtcDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

/** MUSD a member has already committed today (paid or waiting for approval). */
export function spentToday(
  expenses: { memberId: string; amount: number; date: string; status: string }[],
  memberId: string,
  now: Date,
): number {
  return expenses.reduce(
    (n, e) =>
      e.memberId === memberId && e.status !== "rejected" && sameUtcDay(new Date(e.date), now)
        ? n + e.amount
        : n,
    0,
  );
}

export function checkVelocityLimit(p: {
  spentToday: number;
  amount: number;
  dailyLimit: number | null;
}): ApprovalCheck {
  if (p.dailyLimit === null) return { ok: true };
  if (p.spentToday + p.amount > p.dailyLimit + 1e-9)
    return { ok: false, reason: `Over the $${p.dailyLimit}/day allowance` };
  return { ok: true };
}

export function checkCategoryAllowed(category: string, allowed: string[] | null): ApprovalCheck {
  if (allowed === null) return { ok: true };
  if (!allowed.includes(category))
    return { ok: false, reason: `${category} isn't on this member's allowed list` };
  return { ok: true };
}

export type ExpenseRoute =
  | { route: "instant"; flags: string[] }
  | { route: "approval"; flags: string[] }
  | { route: "blocked"; flags: string[]; reason: string };

/**
 * Decide what happens to a new expense:
 * frozen vault -> blocked; under $100 with no allowance flags -> paid instantly;
 * otherwise it waits for 2 approvals, carrying any allowance flags.
 */
export function routeExpense(p: {
  amount: number;
  category: string;
  frozen: boolean;
  spentToday: number;
  allowance: Allowance;
}): ExpenseRoute {
  if (p.frozen)
    return { route: "blocked", flags: [], reason: "The vault is frozen — spending is paused" };
  const flags: string[] = [];
  const v = checkVelocityLimit({
    spentToday: p.spentToday,
    amount: p.amount,
    dailyLimit: p.allowance.dailyLimit,
  });
  if (!v.ok) flags.push(v.reason!);
  const c = checkCategoryAllowed(p.category, p.allowance.categories);
  if (!c.ok) flags.push(c.reason!);
  if (isAutoApproved(p.amount) && flags.length === 0) return { route: "instant", flags };
  return { route: "approval", flags };
}

// ---------- Loan limits & yield ----------

/** Largest MUSD principal allowed against `collateralBtc` at `price`. */
export function maxBorrow(collateralBtc: number, price: number): number {
  return Math.max(0, collateralBtc * price * MAX_LTV);
}

/** Yield earned on idle MUSD between two instants at MUSD_SAVINGS_APY. */
export function accruedYield(musd: number, fromIso: string, to: Date): number {
  const ms = to.getTime() - new Date(fromIso).getTime();
  if (!(ms > 0) || !(musd > 0)) return 0;
  return (musd * MUSD_SAVINGS_APY * ms) / (365 * 86_400_000);
}
