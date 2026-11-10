import { describe, expect, it } from "vitest";

import {
  borrowFromLtv,
  canRelease,
  checkApproval,
  healthFactor,
  isAutoApproved,
  isFullyApproved,
  liquidationPrice,
  riskLevel,
} from "./vault-logic";

describe("spending rules", () => {
  it("auto-approves expenses under $100 MUSD", () => {
    expect(isAutoApproved(99.99)).toBe(true);
  });

  it("requires approval at $100 MUSD and above", () => {
    expect(isAutoApproved(100)).toBe(false);
  });

  it("needs two distinct family approvals", () => {
    expect(isFullyApproved(["mom"])).toBe(false);
    expect(isFullyApproved(["mom", "mom"])).toBe(false);
    expect(isFullyApproved(["mom", "dad"])).toBe(true);
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
