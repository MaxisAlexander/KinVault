import { describe, expect, it } from "vitest";

import { assertNotSelfTransfer, sameAddress } from "./guards";

const TREASURY = "0x42591b7D70c3aDF2eb0f48A2564a5A9aFD04214D";

describe("address guards", () => {
  it("compares addresses case-insensitively", () => {
    expect(sameAddress(TREASURY, TREASURY.toLowerCase())).toBe(true);
    expect(sameAddress(TREASURY, "0x5ce6482c487a9e3bacae8adb59e76e3a72952bc6")).toBe(false);
  });

  it("treats missing addresses as different", () => {
    expect(sameAddress(null, TREASURY)).toBe(false);
    expect(sameAddress(TREASURY, undefined)).toBe(false);
    expect(sameAddress(null, null)).toBe(false);
  });

  it("allows a transfer between two different addresses", () => {
    expect(() =>
      assertNotSelfTransfer(
        "0x5ce6482c487a9e3bacae8adb59e76e3a72952bc6",
        TREASURY,
        "self transfer",
      ),
    ).not.toThrow();
  });

  it("rejects a transfer from an address to itself, regardless of casing", () => {
    expect(() => assertNotSelfTransfer(TREASURY.toLowerCase(), TREASURY, "self transfer")).toThrow(
      "self transfer",
    );
  });
});
