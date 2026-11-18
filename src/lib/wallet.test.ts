import { afterEach, describe, expect, it, vi } from "vitest";

const ADDRESS = "0x42591B7D70c3aDF2eb0f48A2564a5A9aFD04214D";

function fakeProvider(accounts: string[]) {
  return {
    request: vi.fn(async ({ method }: { method: string }) => {
      if (method === "eth_accounts") return accounts;
      if (method === "eth_chainId") return "0x7b7b";
      throw new Error(`unexpected method ${method}`);
    }),
    on: vi.fn(),
  };
}

describe("wallet session persistence", () => {
  afterEach(() => {
    window.localStorage.clear();
    // @ts-expect-error test double replaces the injected wallet
    delete window.ethereum;
    vi.resetModules();
  });

  it("restores the saved address silently after a refresh", async () => {
    window.localStorage.setItem("kinvault:wallet-address", ADDRESS.toLowerCase());
    // @ts-expect-error test double for the injected wallet
    window.ethereum = fakeProvider([ADDRESS]);

    const { getWalletState, restoreWalletSession } = await import("./wallet");
    expect(await restoreWalletSession()).toBe(true);
    expect(getWalletState().status).toBe("connected");
    expect(getWalletState().address).toBe(ADDRESS);
  });

  it("does not restore an address the wallet no longer authorizes", async () => {
    window.localStorage.setItem("kinvault:wallet-address", ADDRESS.toLowerCase());
    // @ts-expect-error test double for the injected wallet
    window.ethereum = fakeProvider([]);

    const { getWalletState, restoreWalletSession } = await import("./wallet");
    expect(await restoreWalletSession()).toBe(false);
    expect(getWalletState().status).not.toBe("connected");
  });

  it("does nothing when no wallet was ever connected", async () => {
    const { restoreWalletSession } = await import("./wallet");
    expect(await restoreWalletSession()).toBe(false);
  });

  it("disconnect forgets the saved address", async () => {
    window.localStorage.setItem("kinvault:wallet-address", ADDRESS.toLowerCase());
    // @ts-expect-error test double for the injected wallet
    window.ethereum = fakeProvider([ADDRESS]);

    const { disconnectWallet, restoreWalletSession } = await import("./wallet");
    expect(await restoreWalletSession()).toBe(true);
    disconnectWallet();
    expect(window.localStorage.getItem("kinvault:wallet-address")).toBeNull();
  });
});
