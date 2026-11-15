import { describe, expect, it } from "vitest";

import { accountLabel } from "./format";

describe("accountLabel", () => {
  it("shows the email for email and Google accounts", () => {
    expect(accountLabel("builder@kinvault.test")).toBe("builder@kinvault.test");
    expect(accountLabel("perera.family@gmail.com")).toBe("perera.family@gmail.com");
  });

  it("shows a short address for wallet accounts", () => {
    expect(accountLabel("0x70997970c51812dc3a010c7d01b50e0d17dc79c8@wallet.kinvault.invalid")).toBe(
      "0x7099.79c8",
    );
  });

  it("falls back to a neutral label when there is no address at all", () => {
    expect(accountLabel(null)).toBe("Signed in");
    expect(accountLabel(undefined)).toBe("Signed in");
  });
});
