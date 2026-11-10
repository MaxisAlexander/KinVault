// Protocol-level MUSD/Trove planning. These functions use the live Mezo
// parameters (MCR, gas compensation, PriceFeed) instead of a hard-coded or
// owner-posted price.
import { formatEther, formatUnits } from "viem";

import { parseBtcAmount, parseTokenAmount, formatPrice } from "./amounts";
import type { ProtocolParams, TroveState } from "./client";
import { MEZO_MIN_NET_DEBT_FALLBACK } from "./config";

export type TrovePlan = {
  collateralWei: bigint;
  borrowWei: bigint;
  totalDebtWei: bigint;
  collateralUsd: number;
  maxBorrowWei: bigint;
  /** Mezo's minimum net debt, read live from BorrowerOperations. */
  minNetDebtWei: bigint;
  icr: number;
  health: number;
  liquidationPriceUsd: number;
  valid: boolean;
  errors: string[];
};

function toNumber(value: bigint): number {
  return Number(formatUnits(value, 18));
}

/**
 * Computes the protocol-enforced numbers before the wallet is asked to sign.
 * `borrowWei` is what the borrower receives; `totalDebtWei` adds the protocol
 * gas compensation that also becomes part of the trove debt.
 */
export function planTrove(params: {
  collateralBtc: string | number;
  borrowMusd: string | number;
  priceUsd: number;
  protocol: Pick<ProtocolParams, "mcr" | "gasCompensation"> & { minNetDebt?: bigint | undefined };
}): TrovePlan {
  const errors: string[] = [];
  let collateralWei = 0n;
  let borrowWei = 0n;
  try {
    collateralWei = parseBtcAmount(params.collateralBtc);
  } catch {
    errors.push("Enter a valid BTC collateral amount");
  }
  try {
    borrowWei = parseTokenAmount(params.borrowMusd);
  } catch {
    errors.push("Enter a valid MUSD amount");
  }

  const minNetDebtWei = params.protocol.minNetDebt ?? MEZO_MIN_NET_DEBT_FALLBACK;
  const collateralUsd = toNumber(collateralWei) * params.priceUsd;
  const totalDebtWei = borrowWei + params.protocol.gasCompensation;
  const icr = totalDebtWei > 0n ? collateralUsd / toNumber(totalDebtWei) : 0;
  const mcr = Number(params.protocol.mcr) / 1e18;
  const health = mcr > 0 ? icr / mcr : 0;

  // maxDebt = (collateral * price) / MCR, computed in 18-decimal integer units.
  const price6 = BigInt(Math.max(0, Math.round(params.priceUsd * 1_000_000)));
  const collateralUsdWei = (collateralWei * price6) / 1_000_000n;
  const maxDebtWei =
    params.protocol.mcr > 0n ? (collateralUsdWei * 10n ** 18n) / params.protocol.mcr : 0n;
  const maxBorrowWei =
    maxDebtWei > params.protocol.gasCompensation
      ? maxDebtWei - params.protocol.gasCompensation
      : 0n;

  if (collateralWei <= 0n) errors.push("Collateral must be greater than zero");
  if (borrowWei <= 0n) errors.push("Borrow amount must be greater than zero");
  if (minNetDebtWei > 0n && borrowWei < minNetDebtWei) {
    errors.push(
      `Borrow at least ${toNumber(minNetDebtWei).toLocaleString("en-US")} MUSD — Mezo's minimum net debt`,
    );
  }
  if (borrowWei < params.protocol.gasCompensation) {
    errors.push("Borrow must cover the protocol gas compensation");
  }
  if (totalDebtWei > 0n && health < 1) {
    errors.push("That trove would be below the 110% minimum collateral ratio");
  }

  const liquidationPriceUsd =
    collateralWei > 0n && totalDebtWei > 0n
      ? (toNumber(totalDebtWei) * mcr) / toNumber(collateralWei)
      : 0;

  return {
    collateralWei,
    borrowWei,
    totalDebtWei,
    collateralUsd,
    maxBorrowWei,
    minNetDebtWei,
    icr,
    health,
    liquidationPriceUsd,
    valid: errors.length === 0,
    errors,
  };
}

export type TroveSummary = {
  active: boolean;
  status: TroveState["status"];
  collateralBtc: number;
  debtMusd: number;
  interestMusd: number;
  icr: number;
  health: number;
  maxBorrowMusd: number;
  collateralUsd: number;
  liquidationPriceUsd: number;
  /** 0–100 progress toward the liquidation threshold, for the UI meter. */
  riskPercent: number;
};

export function summarizeTrove(trove: TroveState, priceUsd: number): TroveSummary {
  const collateralBtc = Number(formatEther(trove.collateralWei));
  const debtMusd = Number(formatUnits(trove.debtWei, 18));
  const interestMusd = Number(formatUnits(trove.interestWei, 18));
  const icr = trove.debtWei > 0n ? (collateralBtc * priceUsd) / debtMusd : 0;
  const health = trove.health;
  const liquidationPriceUsd =
    collateralBtc > 0 && debtMusd > 0 ? (debtMusd * 1.1) / collateralBtc : 0;
  return {
    active: trove.active,
    status: trove.status,
    collateralBtc,
    debtMusd,
    interestMusd,
    icr,
    health,
    maxBorrowMusd: Number(formatUnits(trove.maxBorrowWei, 18)),
    collateralUsd: collateralBtc * priceUsd,
    liquidationPriceUsd,
    riskPercent: Math.max(0, Math.min(100, (1 / Math.max(health, 0.0001)) * 100)),
  };
}

export function formatProtocolPrice(priceWei: bigint, digits = 18): number {
  return formatPrice(priceWei, digits);
}
