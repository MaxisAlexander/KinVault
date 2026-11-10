// Read-only Mezo Testnet access. This module is browser- and server-safe; it
// only performs RPC reads. Writes live in transactions.ts; verification lives
// in verify.server.ts.
import { createPublicClient, http, type Address, type Hash } from "viem";

import {
  borrowerOperationsAbi,
  hintHelpersAbi,
  priceFeedAbi,
  sortedTrovesAbi,
  troveManagerAbi,
  erc20Abi,
} from "./abis";
import { collateralHealth, formatPrice } from "./amounts";
import {
  MUSD,
  PROTOCOL,
  ZERO_ADDRESS,
  MEZO_GAS_COMPENSATION_FALLBACK,
  MEZO_MIN_NET_DEBT_FALLBACK,
  mezoTestnet,
} from "./config";

export const publicClient = createPublicClient({
  chain: mezoTestnet,
  transport: http(undefined, { timeout: 12_000, retryCount: 2 }),
});

export type ChainStatus = {
  chainId: number;
  blockNumber: bigint;
  gasPriceWei: bigint;
};

export async function readChainStatus(): Promise<ChainStatus> {
  const [chainId, blockNumber, gasPriceWei] = await Promise.all([
    publicClient.getChainId(),
    publicClient.getBlockNumber(),
    publicClient.getGasPrice(),
  ]);
  return { chainId, blockNumber, gasPriceWei };
}

export async function readNativeBalance(address: Address): Promise<bigint> {
  return publicClient.getBalance({ address });
}

export async function readTokenBalance(token: Address, account: Address): Promise<bigint> {
  return publicClient.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [account],
  });
}

export type TokenMetadata = { address: Address; symbol: string; decimals: number };

export async function readTokenMetadata(token: Address): Promise<TokenMetadata> {
  const [symbol, decimals] = await Promise.all([
    publicClient.readContract({ address: token, abi: erc20Abi, functionName: "symbol" }),
    publicClient.readContract({ address: token, abi: erc20Abi, functionName: "decimals" }),
  ]);
  return { address: token, symbol, decimals: Number(decimals) };
}

export type MezoPrice = {
  raw: bigint;
  digits: number;
  usd: number;
  oracle: Address;
};

/** Reads the price directly from Mezo's PriceFeed (never an owner-posted value). */
export async function readBtcPrice(): Promise<MezoPrice> {
  const [digits, raw, oracle] = await Promise.all([
    publicClient.readContract({
      address: PROTOCOL.priceFeed,
      abi: priceFeedAbi,
      functionName: "TARGET_DIGITS",
    }),
    publicClient.readContract({
      address: PROTOCOL.priceFeed,
      abi: priceFeedAbi,
      functionName: "fetchPrice",
    }),
    publicClient.readContract({
      address: PROTOCOL.priceFeed,
      abi: priceFeedAbi,
      functionName: "oracle",
    }),
  ]);
  const usd = formatPrice(raw, Number(digits));
  if (!(usd > 0)) throw new Error("Mezo PriceFeed returned an invalid BTC price");
  return { raw, digits: Number(digits), usd, oracle };
}

export type ProtocolParams = {
  mcr: bigint;
  ccr: bigint;
  gasCompensation: bigint;
  borrowingRate: bigint;
  borrowingRatePercent: number;
  /** Protocol minimum net debt (principal + fee), read from BorrowerOperations. */
  minNetDebt: bigint;
  /** Absolute floor the protocol will ever accept for `minNetDebt`. */
  minNetDebtFloor: bigint;
};

export async function readProtocolParams(): Promise<ProtocolParams> {
  const [mcr, ccr, gasCompensation, borrowingRate, minNetDebt, minNetDebtFloor] = await Promise.all(
    [
      publicClient.readContract({
        address: PROTOCOL.troveManager,
        abi: troveManagerAbi,
        functionName: "MCR",
      }),
      publicClient.readContract({
        address: PROTOCOL.troveManager,
        abi: troveManagerAbi,
        functionName: "CCR",
      }),
      safeRead(
        () =>
          publicClient.readContract({
            address: PROTOCOL.borrowerOperations,
            abi: borrowerOperationsAbi,
            functionName: "MUSD_GAS_COMPENSATION",
          }),
        MEZO_GAS_COMPENSATION_FALLBACK,
      ),
      publicClient.readContract({
        address: PROTOCOL.borrowerOperations,
        abi: borrowerOperationsAbi,
        functionName: "borrowingRate",
      }),
      safeRead(
        () =>
          publicClient.readContract({
            address: PROTOCOL.borrowerOperations,
            abi: borrowerOperationsAbi,
            functionName: "minNetDebt",
          }),
        MEZO_MIN_NET_DEBT_FALLBACK,
      ),
      safeRead(
        () =>
          publicClient.readContract({
            address: PROTOCOL.borrowerOperations,
            abi: borrowerOperationsAbi,
            functionName: "MIN_NET_DEBT_MIN",
          }),
        50n * 10n ** 18n,
      ),
    ],
  );
  return {
    mcr,
    ccr,
    gasCompensation,
    borrowingRate,
    borrowingRatePercent: Number(borrowingRate) / 1e16,
    minNetDebt,
    minNetDebtFloor,
  };
}

export const TROVE_STATUS = {
  0: "none",
  1: "active",
  2: "closed",
  3: "liquidated",
  4: "redeemed",
} as const;

export type TroveStatus = (typeof TROVE_STATUS)[keyof typeof TROVE_STATUS];

export type TroveState = {
  owner: Address;
  status: TroveStatus;
  collateralWei: bigint;
  debtWei: bigint;
  interestWei: bigint;
  maxBorrowWei: bigint;
  icrWei: bigint;
  health: number;
  active: boolean;
};

async function safeRead<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

/** Reads a trove even when it does not exist; missing fields become zero. */
export async function readTrove(owner: Address, priceWei?: bigint): Promise<TroveState> {
  const [statusRaw, collateralWei, debtWei, interestWei, maxBorrowWei, mcr] = await Promise.all([
    safeRead(
      () =>
        publicClient.readContract({
          address: PROTOCOL.troveManager,
          abi: troveManagerAbi,
          functionName: "getTroveStatus",
          args: [owner],
        }),
      0,
    ),
    safeRead(
      () =>
        publicClient.readContract({
          address: PROTOCOL.troveManager,
          abi: troveManagerAbi,
          functionName: "getTroveColl",
          args: [owner],
        }),
      0n,
    ),
    safeRead(
      () =>
        publicClient.readContract({
          address: PROTOCOL.troveManager,
          abi: troveManagerAbi,
          functionName: "getTroveDebt",
          args: [owner],
        }),
      0n,
    ),
    safeRead(
      () =>
        publicClient.readContract({
          address: PROTOCOL.troveManager,
          abi: troveManagerAbi,
          functionName: "getTroveInterestOwed",
          args: [owner],
        }),
      0n,
    ),
    safeRead(
      () =>
        publicClient.readContract({
          address: PROTOCOL.troveManager,
          abi: troveManagerAbi,
          functionName: "getTroveMaxBorrowingCapacity",
          args: [owner],
        }),
      0n,
    ),
    safeRead(
      () =>
        publicClient.readContract({
          address: PROTOCOL.troveManager,
          abi: troveManagerAbi,
          functionName: "MCR",
        }),
      1_100_000_000_000_000_000n,
    ),
  ]);

  const icrWei =
    priceWei && debtWei > 0n
      ? await safeRead(
          () =>
            publicClient.readContract({
              address: PROTOCOL.troveManager,
              abi: troveManagerAbi,
              functionName: "getCurrentICR",
              args: [owner, priceWei],
            }),
          0n,
        )
      : 0n;

  const status = (TROVE_STATUS[Number(statusRaw) as keyof typeof TROVE_STATUS] ??
    "none") as TroveStatus;
  return {
    owner,
    status,
    collateralWei,
    debtWei,
    interestWei,
    maxBorrowWei,
    icrWei,
    health: collateralHealth(icrWei, mcr),
    active: status === "active",
  };
}

export type TroveHints = { upperHint: Address; lowerHint: Address };

/**
 * Asks Mezo's HintHelpers/SortedTroves where a new trove belongs. If the
 * protocol cannot produce a hint we fall back to zero addresses; the contract
 * still validates the insertion, so this is a performance hint, not authority.
 */
export async function readTroveHints(params: {
  collateralWei: bigint;
  debtWei: bigint;
  seed?: bigint | undefined;
}): Promise<TroveHints> {
  if (params.collateralWei <= 0n || params.debtWei <= 0n) {
    return { upperHint: ZERO_ADDRESS, lowerHint: ZERO_ADDRESS };
  }
  try {
    const nicr = await publicClient.readContract({
      address: PROTOCOL.hintHelpers,
      abi: hintHelpersAbi,
      functionName: "computeNominalCR",
      args: [params.collateralWei, params.debtWei],
    });
    const seed = params.seed ?? BigInt(Math.floor(Math.random() * 1_000_000));
    const [approxHint] = await publicClient.readContract({
      address: PROTOCOL.hintHelpers,
      abi: hintHelpersAbi,
      functionName: "getApproxHint",
      args: [nicr, 15n, seed],
    });
    const [upperHint, lowerHint] = await publicClient.readContract({
      address: PROTOCOL.sortedTroves,
      abi: sortedTrovesAbi,
      functionName: "findInsertPosition",
      args: [nicr, approxHint, approxHint],
    });
    return { upperHint, lowerHint };
  } catch {
    return { upperHint: ZERO_ADDRESS, lowerHint: ZERO_ADDRESS };
  }
}

export type TreasurySnapshot = {
  address: Address;
  nativeBtcWei: bigint;
  musdWei: bigint;
  mezoWei: bigint;
  trove: TroveState;
};

export async function readTreasurySnapshot(
  address: Address,
  priceWei?: bigint,
): Promise<TreasurySnapshot> {
  const [nativeBtcWei, musdWei, mezoWei, trove] = await Promise.all([
    safeRead(() => readNativeBalance(address), 0n),
    safeRead(() => readTokenBalance(MUSD.address, address), 0n),
    safeRead(() => readTokenBalance("0x7B7c000000000000000000000000000000000001", address), 0n),
    readTrove(address, priceWei),
  ]);
  return { address, nativeBtcWei, musdWei, mezoWei, trove };
}

export function txExplorerPath(hash: Hash): string {
  return `/tx/${hash}`;
}
