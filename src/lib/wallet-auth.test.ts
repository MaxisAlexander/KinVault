import { describe, expect, it } from "vitest";

import {
  buildWalletSignInMessage,
  checkWalletSignInMessage,
  walletAccountEmail,
} from "./wallet-auth";

const ADDRESS = "0x70997970c51812dc3a010c7d01b50e0d17dc79c8";
const ORIGIN = "https://kinvault.example";
const ISSUED = new Date("2026-11-09T05:00:00.000Z");

function message(overrides: Partial<Parameters<typeof buildWalletSignInMessage>[0]> = {}) {
  return buildWalletSignInMessage({
    address: ADDRESS,
    chainId: 31612,
    origin: ORIGIN,
    nonce: "abc123XYZ789",
    issuedAt: ISSUED,
    ...overrides,
  });
}

describe("wallet sign-in message", () => {
  it("accepts a fresh message signed for this site", () => {
    const res = checkWalletSignInMessage(message(), {
      origin: ORIGIN,
      now: new Date(ISSUED.getTime() + 30_000),
    });
    expect(res).toEqual({
      ok: true,
      address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
      nonce: "abc123XYZ789",
    });
  });

  it("rejects a message signed for a different site", () => {
    const res = checkWalletSignInMessage(message({ origin: "https://phishing.example" }), {
      origin: ORIGIN,
      now: ISSUED,
    });
    expect(res.ok).toBe(false);
  });

  it("rejects a message older than 10 minutes", () => {
    const res = checkWalletSignInMessage(message(), {
      origin: ORIGIN,
      now: new Date(ISSUED.getTime() + 11 * 60_000),
    });
    expect(res.ok).toBe(false);
  });

  it("rejects a message dated more than a minute in the future", () => {
    const res = checkWalletSignInMessage(message(), {
      origin: ORIGIN,
      now: new Date(ISSUED.getTime() - 2 * 60_000),
    });
    expect(res.ok).toBe(false);
  });

  it("maps each wallet to its own lowercase account email", () => {
    expect(walletAccountEmail("0x70997970C51812dc3A010C7d01b50e0d17dc79C8")).toBe(
      "0x70997970c51812dc3a010c7d01b50e0d17dc79c8@wallet.kinvault.invalid",
    );
  });
});
