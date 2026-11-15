import { describe, expect, it, vi } from "vitest";

import { friendlyError } from "./errors";

describe("friendlyError", () => {
  it("turns a viem receipt error into a short, human message", () => {
    const raw = new Error(
      'Transaction receipt with hash "0x36e4fdbf91ff3afb12116a0b5396ae887c9786e5" could not be found. The Transaction may not be processed on a block yet.',
    );
    const { title, description } = friendlyError(raw);
    expect(title).toBe("Still confirming on Mezo");
    expect(title).not.toContain("0x");
    expect(description).toBeTruthy();
  });

  it("recognises a wallet rejection", () => {
    expect(friendlyError(new Error("User rejected the request.")).title).toBe(
      "Cancelled in your wallet",
    );
    expect(friendlyError({ code: 4001, message: "nope" }).title).toBe("Cancelled in your wallet");
  });

  it("unwraps server function validation errors", () => {
    const wrapped = new Error('[{"message":"Name your family","path":["familyName"]}]');
    expect(friendlyError(wrapped).title).toBe("Name your family");
  });

  it("keeps an unknown message short and single-line", () => {
    const long = new Error(`${"Something exploded ".repeat(40)}\n    at frame (file.ts:1:1)`);
    const { title } = friendlyError(long);
    expect(title.length).toBeLessThanOrEqual(111);
    expect(title.endsWith("…")).toBe(true);
    expect(title).not.toContain("\n");
  });

  it("falls back when the error carries no message", () => {
    expect(friendlyError({}, "Could not save").title).toBe("Could not save");
    expect(friendlyError(null).title).toBe("Something went wrong");
  });

  it("logs the untouched error for debugging", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const raw = new Error("boom");
    friendlyError(raw);
    expect(spy).toHaveBeenCalledWith("[KinVault]", raw);
    spy.mockRestore();
  });
});
