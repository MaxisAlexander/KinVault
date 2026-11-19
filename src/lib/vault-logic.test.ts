import { describe, expect, it } from "vitest";

import {
  NO_ALLOWANCE,
  borrowFromLtv,
  canRelease,
  checkApproval,
  healthFactor,
  isFullyApproved,
  liquidationPrice,
  riskLevel,
  routeExpense,
} from "./vault-logic";

describe("spending rules", () => {
  it("falls back to two distinct approvals for legacy rows with no chosen approvers", () => {
    expect(isFullyApproved(["mom"])).toBe(false);
    expect(isFullyApproved(["mom", "mom"])).toBe(false);
    expect(isFullyApproved(["mom", "dad"])).toBe(true);
  });

  it("is complete when every chosen approver has signed", () => {
    expect(isFullyApproved([], ["dad"])).toBe(false);
    expect(isFullyApproved(["dad"], ["dad"])).toBe(true);
    expect(isFullyApproved(["dad"], ["dad", "mom"])).toBe(false);
    expect(isFullyApproved(["dad", "mom"], ["dad", "mom"])).toBe(true);
  });

  it("only lets the chosen approvers sign", () => {
    expect(
      checkApproval({
        requesterId: "maya",
        approverId: "mom",
        approverRole: "spouse",
        existingApprovals: [],
        requiredApprovers: ["dad"],
      }).ok,
    ).toBe(false);
    expect(
      checkApproval({
        requesterId: "maya",
        approverId: "dad",
        approverRole: "admin",
        existingApprovals: [],
        requiredApprovers: ["dad"],
      }).ok,
    ).toBe(true);
  });

  it("blocks requesters from approving their own expense", () => {
    expect(
      checkApproval({
        requesterId: "dad",
        approverId: "dad",
        approverRole: "admin",
        existingApprovals: [],
      }).ok,
    ).toBe(false);
  });

  it("blocks teens and kids from approving", () => {
    expect(
      checkApproval({
        requesterId: "dad",
        approverId: "maya",
        approverRole: "teen",
        existingApprovals: [],
      }).ok,
    ).toBe(false);
    expect(
      checkApproval({
        requesterId: "dad",
        approverId: "sam",
        approverRole: "kid",
        existingApprovals: [],
      }).ok,
    ).toBe(false);
  });
});

describe("auto-approval limit", () => {
  const base = {
    category: "Groceries",
    frozen: false,
    spentToday: 0,
    allowance: NO_ALLOWANCE,
  };

  it("needs an approver when no limit is set", () => {
    expect(routeExpense({ ...base, amount: 12 }).route).toBe("approval");
    expect(routeExpense({ ...base, amount: 12, autoApproveLimit: 0 }).route).toBe("approval");
  });

  it("pays without a signature strictly under the limit", () => {
    expect(routeExpense({ ...base, amount: 49.99, autoApproveLimit: 50 }).route).toBe("instant");
  });

  it("needs an approver at or above the limit", () => {
    expect(routeExpense({ ...base, amount: 50, autoApproveLimit: 50 }).route).toBe("approval");
    expect(routeExpense({ ...base, amount: 51, autoApproveLimit: 50 }).route).toBe("approval");
  });

  it("still needs an approver when an allowance rule is broken", () => {
    const daily = routeExpense({
      ...base,
      amount: 40,
      spentToday: 40,
      allowance: { dailyLimit: 50, categories: null },
      autoApproveLimit: 100,
    });
    expect(daily.route).toBe("approval");
    expect(daily.flags.length).toBe(1);

    const category = routeExpense({
      ...base,
      amount: 10,
      category: "Dining",
      allowance: { dailyLimit: null, categories: ["Groceries"] },
      autoApproveLimit: 100,
    });
    expect(category.route).toBe("approval");
    expect(category.flags.length).toBe(1);
  });

  it("a frozen vault blocks the expense even under the limit", () => {
    const r = routeExpense({ ...base, amount: 5, frozen: true, autoApproveLimit: 100 });
    expect(r.route).toBe("blocked");
  });
});

describe("loan math", () => {
  it("health factor is 1 at the 110% collateral ratio", () => {
    expect(healthFactor(11_000, 10_000)).toBeCloseTo(1);
  });

  it("liquidation price matches 110% of debt per BTC", () => {
    expect(liquidationPrice(0.5, 20_000)).toBeCloseTo(44_000);
  });

  it("caps borrowing at 80% LTV", () => {
    expect(borrowFromLtv(100_000, 0.95)).toBe(80_000);
  });

  it("classifies risk", () => {
    expect(riskLevel(0.95)).toBe("liquidatable");
    expect(riskLevel(1.2)).toBe("high");
    expect(riskLevel(1.5)).toBe("moderate");
    expect(riskLevel(2.5)).toBe("safe");
  });
});

describe("lockbox release", () => {
  const today = new Date("2026-11-05T00:00:00Z");
  it("stays locked before the unlock date even with signatures", () => {
    expect(canRelease("2027-01-01", today, ["mom", "grandma"])).toBe(false);
  });
  it("needs two guardian signatures after maturity", () => {
    expect(canRelease("2026-10-01", today, ["mom"])).toBe(false);
    expect(canRelease("2026-10-01", today, ["mom", "grandma"])).toBe(true);
  });
});
