import { describe, expect, it } from "vitest";

import {
  MAX_PASSWORD,
  addressError,
  ageError,
  amountError,
  dateError,
  emailError,
  inviteCodeError,
  normalizeInviteCode,
  parseDecimal,
  passwordError,
  sanitizeDecimal,
  textError,
} from "./input-validation";

describe("numeric fields", () => {
  it("drops everything that is not a digit or a single dot", () => {
    expect(sanitizeDecimal("50jhb", 2)).toBe("50");
    expect(sanitizeDecimal("12abc.5x0", 2)).toBe("12.50");
    expect(sanitizeDecimal("1.2.3", 2)).toBe("1.23");
    expect(sanitizeDecimal("$1,234.50", 2)).toBe("1234.50");
    expect(sanitizeDecimal("-5", 2)).toBe("5");
    expect(sanitizeDecimal(".5", 2)).toBe("0.5");
    expect(sanitizeDecimal("0.123456789", 8)).toBe("0.12345678");
  });

  it("keeps an empty field empty instead of inventing a zero", () => {
    expect(sanitizeDecimal("", 2)).toBe("");
    expect(parseDecimal("")).toBeNull();
    expect(parseDecimal(".")).toBeNull();
    expect(parseDecimal("0.")).toBe(0);
    expect(parseDecimal("42.5")).toBe(42.5);
  });

  it("rejects empty, zero and over-precise amounts", () => {
    expect(amountError("")).toBe("Enter a value");
    expect(amountError("", { label: "an amount" })).toBe("Enter an amount");
    expect(amountError("0", { label: "an amount" })).toBe("Enter an amount above zero");
    expect(amountError("1.234", { decimals: 2 })).toBe("Use at most 2 decimal places");
    expect(amountError("abc")).toBe("Use numbers only");
  });

  it("allows zero only when the rule says so", () => {
    expect(amountError("0", { allowZero: true })).toBeNull();
    expect(amountError("0", { allowZero: false })).toBe("Enter an amount above zero");
  });

  it("enforces min, max and a custom max message", () => {
    expect(amountError("0.0001", { decimals: 8, min: 0.001 })).toBe("Must be at least 0.001");
    expect(amountError("11", { max: 10 })).toBe("That's more than the 10 maximum");
    expect(amountError("1000000001", { max: 1_000_000_000 })).toBe(
      "That's more than the 1,000,000,000 maximum",
    );
    expect(amountError("11", { max: 10, maxLabel: "You only have $10.00" })).toBe(
      "You only have $10.00",
    );
  });
});

describe("text fields", () => {
  it("requires, trims and caps text", () => {
    expect(textError("   ", { label: "a name" })).toBe("Enter a name");
    expect(textError("Ada", { max: 2 })).toBe("Keep it under 2 characters");
    expect(textError("A", { min: 2 })).toBe("Use at least 2 characters");
    expect(textError("Ada", { max: 40 })).toBeNull();
    expect(textError("", { required: false })).toBeNull();
  });
});

describe("account fields", () => {
  it("checks emails", () => {
    expect(emailError("")).toBe("Enter your email");
    expect(emailError("dad@")).toBe("Enter a valid email address");
    expect(emailError("dad perera@kinvault.test")).toBe("Enter a valid email address");
    expect(emailError("dad.perera@kinvault.test")).toBeNull();
  });

  it("checks passwords without leaking the library rule", () => {
    expect(passwordError("short")).toBe("Use at least 8 characters");
    expect(passwordError("x".repeat(MAX_PASSWORD + 1))).toBe("Use at most 72 characters");
    expect(passwordError("KinVault!2026")).toBeNull();
  });

  it("checks invite codes", () => {
    expect(inviteCodeError("")).toBe("Enter the invite code");
    expect(inviteCodeError("KV")).toBe("That code is too short");
    expect(inviteCodeError("KV 123")).toBe("Use letters, numbers and dashes only");
    expect(inviteCodeError("KV-ABCDE-12345")).toBeNull();
    expect(normalizeInviteCode("kv-ab12 x")).toBe("KV-AB12X");
  });

  it("checks wallet addresses", () => {
    expect(addressError("")).toBe("Enter a wallet address");
    expect(addressError("42591b7d70c3adf2eb0f48a2564a5a9afd04214d")).toBe(
      "A wallet address starts with 0x",
    );
    expect(addressError("0x123")).toBe("A wallet address is 0x followed by 40 characters");
    expect(addressError("0x42591b7d70c3adf2eb0f48a2564a5a9afd04214d")).toBeNull();
  });

  it("checks ages", () => {
    expect(ageError("")).toBe("Enter an age");
    expect(ageError("4.5")).toBe("Use whole years only");
    expect(ageError("12", { min: 18 })).toBe("Must be 18 or over");
    expect(ageError("121")).toBe("Must be 120 or under");
    expect(ageError("41")).toBeNull();
  });

  it("checks dates against a floor", () => {
    expect(dateError("")).toBe("Pick a date");
    expect(dateError("14/03/2028")).toBe("Use a date like 2028-03-14");
    expect(dateError("2028-02-31")).toBe("That date doesn't exist");
    expect(dateError("2020-01-01", { min: "2026-11-19" })).toBe("Pick a future date");
    expect(dateError("2028-03-14", { min: "2026-11-19" })).toBeNull();
  });
});
