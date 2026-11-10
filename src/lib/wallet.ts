// Browser wallet connection (MetaMask, Rabby, OKX and other EIP-1193 wallets)
// for Mezo Testnet. Reads native test BTC, MUSD and MEZO balances; never signs
// anything without the user's wallet prompt.
import { useSyncExternalStore } from "react";

import { readNativeBalance, readTokenBalance } from "./chain/client";
import { MUSD, TOKENS, MEZO_TESTNET_CHAIN_ID } from "./chain/config";
import { ensureMezoTestnet, getInjectedProvider, type Eip1193Provider } from "./chain/transactions";

export type Eip1193 = Eip1193Provider;

/** Provider the family member picked in the wallet list (falls back to window.ethereum). */
let selected: Eip1193 | null = null;

function provider(): Eip1193 | null {
  return selected ?? getInjectedProvider();
}

// ---- EIP-6963 multi-wallet discovery: each installed wallet announces its name and official icon.
export type DiscoveredWallet = {
  uuid: string;
  name: string;
  icon: string;
  rdns: string;
  provider: Eip1193;
};

let discovered: DiscoveredWallet[] = [];
const discoveryListeners = new Set<() => void>();
const EMPTY_WALLETS: DiscoveredWallet[] = [];
let discoveryStarted = false;

/** Call from an effect: listens for wallet announcements and asks wallets to announce. */
export function startWalletDiscovery() {
  if (typeof window === "undefined") return;
  if (!discoveryStarted) {
    discoveryStarted = true;
    window.addEventListener("eip6963:announceProvider", (event) => {
      const detail = (
        event as CustomEvent<{ info: Omit<DiscoveredWallet, "provider">; provider: Eip1193 }>
      ).detail;
      if (!detail?.info?.uuid || !detail.provider) return;
      if (discovered.some((w) => w.uuid === detail.info.uuid || w.rdns === detail.info.rdns))
        return;
      discovered = [...discovered, { ...detail.info, provider: detail.provider }];
      discoveryListeners.forEach((l) => l());
    });
  }
  window.dispatchEvent(new Event("eip6963:requestProvider"));
}

export function useDiscoveredWallets(): DiscoveredWallet[] {
  return useSyncExternalStore(
    (l) => {
      discoveryListeners.add(l);
      return () => discoveryListeners.delete(l);
    },
    () => discovered,
    () => EMPTY_WALLETS,
  );
}

export function hasLegacyInjectedWallet() {
  return (
    typeof window !== "undefined" && Boolean((window as unknown as { ethereum?: Eip1193 }).ethereum)
  );
}

export type WalletState = {
  status: "idle" | "connecting" | "connected" | "unavailable";
  address: string | null;
  chainId: number | null;
  balanceBtc: number | null;
  balanceMusd: number | null;
  balanceMezo: number | null;
  error: string | null;
};

let state: WalletState = {
  status: "idle",
  address: null,
  chainId: null,
  balanceBtc: null,
  balanceMusd: null,
  balanceMezo: null,
  error: null,
};
const initial = state;
const listeners = new Set<() => void>();
function set(patch: Partial<WalletState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function useWallet<T>(selector: (s: WalletState) => T): T {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => selector(state),
    () => selector(initial),
  );
}

export function hasBrowserWallet() {
  return provider() !== null;
}

async function refreshBalances(address: string) {
  try {
    const [btcWei, musdWei, mezoWei] = await Promise.all([
      readNativeBalance(address as `0x${string}`),
      readTokenBalance(MUSD.address, address as `0x${string}`),
      readTokenBalance(TOKENS.MEZO.address, address as `0x${string}`),
    ]);
    set({
      balanceBtc: Number(btcWei) / 1e18,
      balanceMusd: Number(musdWei) / 1e18,
      balanceMezo: Number(mezoWei) / 1e18,
    });
  } catch {
    set({ balanceBtc: null, balanceMusd: null, balanceMezo: null });
  }
}

let wired = false;
function wireEvents(p: Eip1193) {
  if (wired || !p.on) return;
  wired = true;
  p.on("accountsChanged", (accs) => {
    const a = (accs as string[])[0] ?? null;
    if (!a)
      set({
        status: "idle",
        address: null,
        balanceBtc: null,
        balanceMusd: null,
        balanceMezo: null,
      });
    else {
      set({ address: a });
      void refreshBalances(a);
    }
  });
  p.on("chainChanged", (id) => {
    const chainId = parseInt(String(id), 16);
    set({ chainId });
    if (chainId !== MEZO_TESTNET_CHAIN_ID) {
      set({ error: "KinVault runs on Mezo Testnet. Switch networks to continue." });
    } else {
      set({ error: null });
      if (state.address) void refreshBalances(state.address);
    }
  });
}

export async function connectWallet(chosen?: Eip1193) {
  if (chosen && chosen !== selected) {
    selected = chosen;
    wired = false;
  }
  const p = provider();
  if (!p) {
    set({
      status: "unavailable",
      error: "No browser wallet found. Install MetaMask, Rabby or OKX Wallet.",
    });
    return;
  }
  set({ status: "connecting", error: null });
  try {
    const accs = (await p.request({ method: "eth_requestAccounts" })) as string[];
    const chainHex = (await p.request({ method: "eth_chainId" })) as string;
    const address = accs[0] ?? null;
    const chainId = parseInt(chainHex, 16);
    set({ status: address ? "connected" : "idle", address, chainId });
    wireEvents(p);
    if (address) {
      if (chainId !== MEZO_TESTNET_CHAIN_ID) {
        try {
          await ensureMezoTestnet(p);
          set({ chainId: MEZO_TESTNET_CHAIN_ID, error: null });
        } catch {
          set({ error: "Switch to Mezo Testnet to use KinVault" });
        }
      }
      void refreshBalances(address);
    }
  } catch (e) {
    set({ status: "idle", error: e instanceof Error ? e.message : "Connection was cancelled" });
  }
}

/** Snapshot of the wallet state outside React (used right after connecting). */
export function getWalletState(): WalletState {
  return state;
}

export async function switchToMezo() {
  const p = provider();
  if (!p) return;
  await ensureMezoTestnet(p);
  set({ chainId: MEZO_TESTNET_CHAIN_ID, error: null });
  if (state.address) void refreshBalances(state.address);
}

/** Ask the wallet to sign a plain-text message (proves the family member owns the address). */
export async function signMessage(message: string): Promise<string> {
  const p = provider();
  if (!p || !state.address) throw new Error("Connect a wallet first");
  const hex =
    "0x" +
    Array.from(new TextEncoder().encode(message))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  return (await p.request({ method: "personal_sign", params: [hex, state.address] })) as string;
}

export function disconnectWallet() {
  set({
    status: "idle",
    address: null,
    chainId: null,
    balanceBtc: null,
    balanceMusd: null,
    balanceMezo: null,
    error: null,
  });
}

export function shortAddress(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}
