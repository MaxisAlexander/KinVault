import { useSyncExternalStore } from "react";
import { toast } from "sonner";

import { DEMO_BTC_PRICE, DEMO_FAMILY_NAME, DEMO_TODAY, demoLedger } from "./vault-seed";
import {
  applyAction,
  type Asset,
  type Category,
  type Ledger,
  type Member,
  type VaultAction,
} from "./vault-engine";
import { MUSD_SAVINGS_APY } from "./vault-logic";
import { useMezo } from "./mezo";

export { CATEGORIES } from "./vault-engine";
export type {
  Activity,
  Asset,
  Category,
  Expense,
  ExpenseStatus,
  Ledger,
  Lockbox,
  Loan,
  Member,
} from "./vault-engine";
export { DEMO_TODAY } from "./vault-seed";

export type VaultMode = "demo" | "live";

export type Seat = {
  id: string;
  name: string;
  role: Member["role"];
  age: number;
  claimed: boolean;
  isMe: boolean;
  walletAddress: string | null;
  inviteCode: string | null;
};

export type VaultPayload = {
  family: { id: string; name: string };
  meId: string;
  ledger: Ledger;
  version: number;
  seats: Seat[];
  /** Mezo Testnet wallet that holds the family treasury, once configured. */
  treasuryAddress: string | null;
};

export type VaultState = Ledger & {
  mode: VaultMode;
  familyName: string;
  familyId: string | null;
  actingId: string;
  btcPrice: number;
  prevBtcPrice: number;
  /** ISO date used for lockbox maturity (fixed in the demo, real date when live). */
  today: string;
  version: number;
  syncing: number;
  seats: Seat[];
  treasuryAddress: string | null;
};

const demoState: VaultState = {
  ...demoLedger,
  mode: "demo",
  familyName: DEMO_FAMILY_NAME,
  familyId: null,
  actingId: "dad",
  btcPrice: DEMO_BTC_PRICE,
  prevBtcPrice: 103_880,
  today: DEMO_TODAY.toISOString(),
  version: 0,
  syncing: 0,
  seats: [],
  treasuryAddress: null,
};

// ---------------- store ----------------

let state: VaultState = demoState;
const listeners = new Set<() => void>();

function set(updater: (s: VaultState) => VaultState) {
  state = updater(state);
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useVault<T>(selector: (s: VaultState) => T): T {
  return useSyncExternalStore(
    subscribe,
    () => selector(state),
    () => selector(demoState),
  );
}

export function getVaultState() {
  return state;
}

export type Result = { ok: true; message: string } | { ok: false; message: string };

const FORMER_MEMBER: Member = {
  id: "former",
  name: "Former member",
  role: "kid",
  age: 0,
  initials: "--",
  tone: "chart-6",
  btc: 0,
  musd: 0,
  contributedBtc: 0,
  contributedMusd: 0,
};

/** Returns the member, or a shared placeholder for people who have left the family. */
export const memberById = (s: VaultState, id: string): Member =>
  s.members.find((m) => m.id === id) ?? FORMER_MEMBER;

function ledgerOf(s: VaultState): Ledger {
  return {
    vault: s.vault,
    members: s.members,
    expenses: s.expenses,
    loans: s.loans,
    lockboxes: s.lockboxes,
    activity: s.activity,
    freeze: s.freeze,
    allowances: s.allowances,
    lastAccrualAt: s.lastAccrualAt,
    treasuryAddress: s.treasuryAddress,
  };
}

let localCounter = 1000;
function localId(prefix: string) {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}${++localCounter}${rand}`;
}

// The live-sync function is loaded lazily so the demo never pulls server code.
let dispatchRemote:
  | ((action: VaultAction) => Promise<{
      ok: boolean;
      message: string;
      ledger: Ledger | null;
      version: number;
    }>)
  | null = null;

async function getDispatch() {
  if (!dispatchRemote) {
    const mod = await import("./family.functions");
    dispatchRemote = (action) => mod.dispatchVaultAction({ data: { action } });
  }
  return dispatchRemote;
}

function run(action: VaultAction): Result {
  const s = state;
  const now = new Date();
  const ctx = {
    actorId: s.actingId,
    now,
    today: s.mode === "demo" ? DEMO_TODAY : now,
    btcPrice: s.btcPrice,
    block: useMezo.get().block,
    onchain: s.mode === "live",
    newId: localId,
  };
  const r = applyAction(ledgerOf(s), action, ctx);
  if (!r.ok) return r;

  if (s.mode === "live") {
    // Never show a ledger-only balance change for a live family. The server
    // re-applies the action and returns the authoritative ledger.
    set((st) => ({ ...st, syncing: st.syncing + 1 }));
    void confirmLive(action);
    return { ok: true, message: r.message };
  }

  set((st) => ({ ...st, ...r.ledger }));
  return { ok: true, message: r.message };
}

async function confirmLive(action: VaultAction) {
  const familyId = state.familyId;
  try {
    const dispatch = await getDispatch();
    const res = await dispatch(action);
    if (state.familyId !== familyId) return;
    set((st) => {
      const next = { ...st, syncing: Math.max(0, st.syncing - 1) };
      if (res.ok && res.ledger && res.version >= st.version) {
        return { ...next, ...res.ledger, version: res.version };
      }
      return next;
    });
    if (!res.ok) {
      toast.error(res.message);
      refreshHook?.();
    }
  } catch (err) {
    set((st) => ({ ...st, syncing: Math.max(0, st.syncing - 1) }));
    toast.error("Couldn't save that change", {
      description: err instanceof Error ? err.message : "Check your connection and try again.",
    });
    refreshHook?.();
  }
}

let refreshHook: (() => void) | null = null;
/** Lets the session gate re-fetch the vault after a failed save. */
export function setRefreshHook(fn: (() => void) | null) {
  refreshHook = fn;
}

// ---------------- actions ----------------

export const actions = {
  setActing(id: string) {
    if (state.mode !== "demo") return;
    set((s) => ({ ...s, actingId: id }));
  },

  enterDemo() {
    if (state.mode === "demo" && state.familyId === null) return;
    set(() => demoState);
  },

  hydrateLive(p: VaultPayload) {
    set((s) => {
      if (s.mode === "live" && s.familyId === p.family.id && p.version < s.version) return s;
      return {
        ...s,
        ...p.ledger,
        mode: "live",
        familyName: p.family.name,
        familyId: p.family.id,
        actingId: p.meId,
        today: new Date().toISOString(),
        version: p.version,
        seats: p.seats,
        treasuryAddress: p.treasuryAddress,
        // Live families value Bitcoin at the real market price.
        btcPrice: s.mode === "live" ? s.btcPrice : (useMezo.get().btcUsd ?? s.btcPrice),
        prevBtcPrice: s.mode === "live" ? s.prevBtcPrice : (useMezo.get().btcUsd ?? s.btcPrice),
      };
    });
  },

  setPrice(price: number) {
    if (state.mode !== "live" || !(price > 0) || price === state.btcPrice) return;
    set((s) => ({ ...s, prevBtcPrice: s.btcPrice, btcPrice: price }));
  },

  dispatch: run,

  deposit(p: { memberId: string; asset: Asset; amount: number; to: "vault" | "sub" }): Result {
    if (!(p.amount > 0)) return { ok: false, message: "Enter an amount above zero" };
    return run({ type: "deposit", ...p });
  },

  withdraw(p: { memberId: string; asset: Asset; amount: number; from: "vault" | "sub" }): Result {
    if (!(p.amount > 0)) return { ok: false, message: "Enter an amount above zero" };
    return run({ type: "withdraw", ...p });
  },

  addExpense(p: { category: Category; merchant: string; amount: number; note: string }): Result {
    if (!(p.amount > 0)) return { ok: false, message: "Enter an amount above zero" };
    if (!p.merchant.trim()) return { ok: false, message: "Add where the money was spent" };
    return run({ type: "addExpense", ...p });
  },

  approveExpense(expenseId: string): Result {
    return run({ type: "approveExpense", expenseId });
  },

  rejectExpense(expenseId: string): Result {
    return run({ type: "rejectExpense", expenseId });
  },

  openLoan(p: { collateralBtc: number; principal: number; purpose: string }): Result {
    if (!(p.collateralBtc > 0)) return { ok: false, message: "Choose how much BTC to lock" };
    if (!(p.principal > 0)) return { ok: false, message: "Choose how much to borrow" };
    return run({ type: "openLoan", ...p });
  },

  repayLoan(loanId: string, amount: number): Result {
    if (!(amount > 0)) return { ok: false, message: "Enter an amount above zero" };
    return run({ type: "repayLoan", loanId, amount });
  },

  contributeLockbox(lockboxId: string, amount: number): Result {
    if (!(amount > 0)) return { ok: false, message: "Enter an amount above zero" };
    return run({ type: "contributeLockbox", lockboxId, amount });
  },

  signLockbox(lockboxId: string): Result {
    return run({ type: "signLockbox", lockboxId });
  },

  createLockbox(p: {
    name: string;
    beneficiaryId: string;
    goal: number;
    unlockDate: string;
    milestone: string;
    letterTitle: string;
    letterBody: string;
  }): Result {
    if (!p.name.trim()) return { ok: false, message: "Give the lockbox a name" };
    if (!(p.goal > 0)) return { ok: false, message: "Set a savings goal" };
    if (!p.unlockDate) return { ok: false, message: "Pick an unlock date" };
    return run({ type: "createLockbox", ...p });
  },

  freeze(reason: string): Result {
    return run({ type: "freeze", reason });
  },

  signUnfreeze(): Result {
    return run({ type: "signUnfreeze" });
  },

  setAllowance(memberId: string, dailyLimit: number | null, categories: Category[] | null): Result {
    return run({ type: "setAllowance", memberId, dailyLimit, categories });
  },

  /** Demo-only tick: BTC price drifts and idle MUSD accrues yield (accelerated). */
  tick() {
    if (state.mode !== "demo") return;
    set((s) => {
      const drift = 1 + (Math.random() - 0.48) * 0.003;
      const btcPrice = Math.round(s.btcPrice * drift);
      const accrued = (s.vault.musd * MUSD_SAVINGS_APY) / 365 / 24; // ~1 hour of yield per tick
      return {
        ...s,
        prevBtcPrice: s.btcPrice,
        btcPrice,
        vault: {
          ...s.vault,
          musd: s.vault.musd + accrued,
          yieldEarned: s.vault.yieldEarned + accrued,
        },
      };
    });
  },
};
