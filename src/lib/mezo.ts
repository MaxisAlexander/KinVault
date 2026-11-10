// Live Mezo Testnet status. This is intentionally testnet-only: block height,
// gas price and the BTC/USD price all come from Mezo Testnet, and the BTC price
// is read from the protocol PriceFeed rather than CoinGecko or an owner value.
import { useSyncExternalStore } from "react";

import { formatUnits } from "viem";

import { readBtcPrice, readChainStatus } from "./chain/client";
import {
  MEZO_TESTNET_CHAIN_ID,
  MEZO_TESTNET_EXPLORER,
  explorerAddressUrl,
  explorerBlockUrl,
  explorerTxUrl,
} from "./chain/config";

export {
  MEZO_TESTNET_CHAIN_ID,
  MEZO_TESTNET_EXPLORER,
  explorerAddressUrl,
  explorerBlockUrl,
  explorerTxUrl,
};

/** Typical simple transfer; used to estimate network fees. */
export const TRANSFER_GAS = 21_000;

export type MezoStatus = "connecting" | "online" | "degraded" | "offline";

export type MezoState = {
  chainId: number;
  status: MezoStatus;
  block: number | null;
  latencyMs: number | null;
  gasPriceWei: bigint | null;
  btcUsd: number | null;
  updatedAt: number | null;
};

let state: MezoState = {
  chainId: MEZO_TESTNET_CHAIN_ID,
  status: "connecting",
  block: null,
  latencyMs: null,
  gasPriceWei: null,
  btcUsd: null,
  updatedAt: null,
};
const initial = state;
const listeners = new Set<() => void>();
function set(patch: Partial<MezoState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function useMezo<T>(selector: (s: MezoState) => T): T {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => selector(state),
    () => selector(initial),
  );
}
useMezo.get = () => state;

async function heartbeat() {
  const t0 = performance.now();
  try {
    const status = await readChainStatus();
    const latency = Math.round(performance.now() - t0);
    if (status.chainId !== MEZO_TESTNET_CHAIN_ID) throw new Error("Wrong Mezo network");
    set({
      chainId: status.chainId,
      status: latency > 1500 ? "degraded" : "online",
      block: Number(status.blockNumber),
      gasPriceWei: status.gasPriceWei,
      latencyMs: latency,
      updatedAt: Date.now(),
    });
  } catch {
    set({ status: state.block ? "degraded" : "offline", latencyMs: null });
  }
}

async function refreshPrice() {
  try {
    const price = await readBtcPrice();
    set({ btcUsd: price.usd, updatedAt: Date.now() });
  } catch {
    // Keep the last verified protocol price; never fall back to an owner value.
  }
}

let users = 0;
let timers: ReturnType<typeof setInterval>[] = [];

/** Start polling (ref-counted). Returns a stop function. */
export function startMezoHeartbeat(): () => void {
  users++;
  if (users === 1) {
    void heartbeat();
    void refreshPrice();
    timers = [setInterval(heartbeat, 6000), setInterval(refreshPrice, 30_000)];
  }
  return () => {
    users--;
    if (users === 0) {
      timers.forEach(clearInterval);
      timers = [];
    }
  };
}

/** Estimated fee in BTC for a simple Mezo transfer at the current gas price. */
export function estimateFeeBtc(gasPriceWei: bigint | null, gas = TRANSFER_GAS): number | null {
  if (gasPriceWei === null) return null;
  return Number(gasPriceWei * BigInt(gas)) / 1e18;
}

export function formatGasPrice(gasPriceWei: bigint | null): string {
  if (gasPriceWei === null) return "—";
  return `${Number(formatUnits(gasPriceWei, 9)).toFixed(2)} gwei`;
}

export function explorerTokenUrl(address: string) {
  return `${MEZO_TESTNET_EXPLORER}/token/${address}`;
}
