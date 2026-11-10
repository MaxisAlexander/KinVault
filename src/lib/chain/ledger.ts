// Pure ledger mutations for verified Mezo Testnet events. Keeping these free
// of React/RPC makes the accounting testable and ensures the server applies the
// same rules whether the event came from a wallet or a test fixture.
import { appendActivity, type EngineCtx, type Ledger, type OnchainRef } from "../vault-engine";

function requireMember(l: Ledger, memberId: string): void {
  if (!l.members.some((m) => m.id === memberId)) throw new Error("Family member not found");
}

export function setTreasuryAddress(l: Ledger, address: string | null): Ledger {
  return { ...l, treasuryAddress: address ? address.toLowerCase() : null };
}

export function creditMusdDeposit(
  l: Ledger,
  ctx: EngineCtx,
  params: { memberId: string; amountMusd: number; ref: OnchainRef },
): Ledger {
  requireMember(l, params.memberId);
  return {
    ...l,
    vault: { ...l.vault, musd: l.vault.musd + params.amountMusd },
    members: l.members.map((m) =>
      m.id === params.memberId
        ? { ...m, contributedMusd: m.contributedMusd + params.amountMusd }
        : m,
    ),
    activity: appendActivity(l, ctx, {
      memberId: params.memberId,
      kind: "deposit",
      text: "funded the family vault with MUSD on Mezo Testnet",
      amount: params.amountMusd,
      asset: "MUSD",
      direction: "in",
      txHash: params.ref.txHash,
      onchain: params.ref,
    }).activity,
  };
}

export function creditBtcDeposit(
  l: Ledger,
  ctx: EngineCtx,
  params: { memberId: string; amountBtc: number; ref: OnchainRef },
): Ledger {
  requireMember(l, params.memberId);
  return {
    ...l,
    vault: { ...l.vault, btc: l.vault.btc + params.amountBtc },
    members: l.members.map((m) =>
      m.id === params.memberId ? { ...m, contributedBtc: m.contributedBtc + params.amountBtc } : m,
    ),
    activity: appendActivity(l, ctx, {
      memberId: params.memberId,
      kind: "deposit",
      text: "funded the family vault with test BTC on Mezo Testnet",
      amount: params.amountBtc,
      asset: "BTC",
      direction: "in",
      txHash: params.ref.txHash,
      onchain: params.ref,
    }).activity,
  };
}

export function attachExpenseSettlement(
  l: Ledger,
  ctx: EngineCtx,
  params: { expenseId: string; amountMusd: number; ref: OnchainRef },
): Ledger {
  const expense = l.expenses.find((e) => e.id === params.expenseId);
  if (!expense) throw new Error("Expense not found");
  // Live expenses are not debited when they are approved: the treasury's MUSD
  // only leaves when the verified transfer is attached. Clamp at zero so a
  // slightly stale ledger can never hide a real on-chain payment.
  const musd = Math.max(0, l.vault.musd - params.amountMusd);
  return {
    ...l,
    vault: { ...l.vault, musd },
    expenses: l.expenses.map((e) =>
      e.id === expense.id ? { ...e, onchain: params.ref, merchantAddress: params.ref.to } : e,
    ),
    activity: appendActivity(l, ctx, {
      kind: "expense",
      text: `settled ${expense.merchant} with MUSD on Mezo Testnet`,
      amount: params.amountMusd,
      asset: "MUSD",
      direction: "out",
      txHash: params.ref.txHash,
      onchain: params.ref,
    }).activity,
  };
}

export function recordWithdrawal(
  l: Ledger,
  ctx: EngineCtx,
  params: {
    memberId: string;
    recipientId: string;
    asset: "BTC" | "MUSD";
    amount: number;
    ref: OnchainRef;
  },
): Ledger {
  requireMember(l, params.memberId);
  const recipient = l.members.find((m) => m.id === params.recipientId);
  if (!recipient) throw new Error("Recipient is not a family member");
  // The verified transfer is the source of truth. If the ledger is slightly
  // behind the chain, record the withdrawal and clamp rather than losing it.
  const available = params.asset === "BTC" ? l.vault.btc : l.vault.musd;
  const amount = Math.min(params.amount, Math.max(0, available));
  return {
    ...l,
    vault:
      params.asset === "BTC"
        ? { ...l.vault, btc: Math.max(0, l.vault.btc - amount) }
        : { ...l.vault, musd: Math.max(0, l.vault.musd - amount) },
    activity: appendActivity(l, ctx, {
      kind: "withdraw",
      text: `withdrew ${params.asset} from the treasury to ${recipient.name} on Mezo Testnet`,
      amount: params.amount,
      asset: params.asset,
      direction: "out",
      txHash: params.ref.txHash,
      onchain: params.ref,
    }).activity,
  };
}

export function recordTroveOpen(
  l: Ledger,
  ctx: EngineCtx,
  params: {
    loanId: string;
    purpose: string;
    collateralBtc: number;
    principalMusd: number;
    debtMusd: number;
    troveOwner: string;
    ref: OnchainRef;
  },
): Ledger {
  return {
    ...l,
    // Opening a trove moves BTC from the wallet into protocol collateral: the
    // family still owns it, so total BTC is unchanged but it becomes locked.
    // The borrowed MUSD is minted to the treasury, so the ledger credits it.
    vault: {
      ...l.vault,
      musd: l.vault.musd + params.principalMusd,
      btcLocked: l.vault.btcLocked + params.collateralBtc,
    },
    loans: [
      {
        id: params.loanId,
        purpose: params.purpose,
        collateralBtc: params.collateralBtc,
        principal: params.principalMusd,
        debt: params.debtMusd,
        openedAt: ctx.now.toISOString(),
        openedBy: ctx.actorId,
        status: "active",
        troveOwner: params.troveOwner.toLowerCase(),
        onchainOpen: params.ref,
      },
      ...l.loans,
    ],
    activity: appendActivity(l, ctx, {
      kind: "loan",
      text: `opened a Mezo trove · ${params.purpose}`,
      amount: params.principalMusd,
      asset: "MUSD",
      direction: "in",
      txHash: params.ref.txHash,
      onchain: params.ref,
    }).activity,
  };
}

export function recordTroveRepay(
  l: Ledger,
  ctx: EngineCtx,
  params: { loanId: string; amountMusd: number; remainingDebtMusd: number; ref: OnchainRef },
): Ledger {
  const loan = l.loans.find((x) => x.id === params.loanId);
  if (!loan) throw new Error("Loan not found");
  const closed = params.remainingDebtMusd <= 0.005;
  return {
    ...l,
    // The verified repayment burned MUSD from the treasury and, when the trove
    // closed, returned the collateral to the family wallet.
    vault: {
      ...l.vault,
      musd: Math.max(0, l.vault.musd - params.amountMusd),
      btcLocked: closed ? Math.max(0, l.vault.btcLocked - loan.collateralBtc) : l.vault.btcLocked,
    },
    loans: l.loans.map((x) =>
      x.id === loan.id
        ? {
            ...x,
            debt: closed ? 0 : params.remainingDebtMusd,
            status: closed ? "repaid" : "active",
            onchainRepay: params.ref,
          }
        : x,
    ),
    activity: appendActivity(l, ctx, {
      kind: "repay",
      text: closed
        ? `repaid and closed the Mezo trove · ${loan.purpose}`
        : `repaid the Mezo trove · ${loan.purpose}`,
      amount: params.amountMusd,
      asset: "MUSD",
      direction: "out",
      txHash: params.ref.txHash,
      onchain: params.ref,
    }).activity,
  };
}
