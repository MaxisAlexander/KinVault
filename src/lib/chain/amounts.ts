// Token/price amount helpers. All on-chain amounts are integers; never do
// arithmetic in floating point before converting to a BigInt.
import { formatEther, formatUnits, parseEther, parseUnits } from "viem";

import { MUSD } from "./config";

export const MUSD_DECIMALS = MUSD.decimals;
export const BTC_DECIMALS = 18;
export const PRICE_DECIMALS = 18;

/** Accepts a UI string/number and returns base units. Throws on invalid input. */
export function parseTokenAmount(value: string | number, decimals = MUSD_DECIMALS): bigint {
  const text = typeof value === "number" ? String(value) : value.trim();
  if (!text || text === ".") throw new Error("Enter an amount");
  if (!/^\d*\.?\d*$/.test(text)) throw new Error("Enter a valid amount");
  return parseUnits(text, decimals);
}

export function parseBtcAmount(value: string | number): bigint {
  const text = typeof value === "number" ? String(value) : value.trim();
  if (!text || text === ".") throw new Error("Enter an amount");
  if (!/^\d*\.?\d*$/.test(text)) throw new Error("Enter a valid amount");
  return parseEther(text);
}

export function formatTokenAmount(
  value: bigint,
  decimals = MUSD_DECIMALS,
  maxFractionDigits = 2,
): string {
  const raw = formatUnits(value, decimals);
  const parts = raw.split(".");
  const whole = parts[0] ?? "0";
  const fraction = parts[1] ?? "";
  const trimmed = fraction.slice(0, maxFractionDigits).replace(/0+$/, "");
  return trimmed ? `${whole}.${trimmed}` : whole;
}

export function formatMusd(value: bigint): string {
  return formatTokenAmount(value, MUSD_DECIMALS, 2);
}

export function formatBtc(value: bigint): string {
  return formatTokenAmount(value, BTC_DECIMALS, 6);
}

export function formatPrice(value: bigint, digits = PRICE_DECIMALS): number {
  const n = Number(formatUnits(value, digits));
  if (!Number.isFinite(n) || n <= 0) throw new Error("Invalid Mezo price");
  return n;
}

/** USD value of a BTC amount at a Mezo PriceFeed price, as a display number. */
export function btcUsdValue(btcWei: bigint, priceUsd: number): number {
  return Number(formatEther(btcWei)) * priceUsd;
}

/** MUSD value of a debt in base units, as a display number. */
export function musdValue(debtWei: bigint): number {
  return Number(formatUnits(debtWei, MUSD_DECIMALS));
}

/** Health factor: 1.0 is the liquidation threshold. */
export function collateralHealth(icrWei: bigint, mcrWei: bigint): number {
  if (icrWei <= 0n || mcrWei <= 0n) return 0;
  return Number((icrWei * 10n ** 18n) / mcrWei) / 1e18;
}

export function bpsToPercent(bps: bigint): number {
  return Number(bps) / 100;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
