// Server-only verification of Mezo Testnet transactions. The browser may send
// a transaction hash, but it cannot be trusted. Every credit/payment is only
// recorded after the receipt, token contract, sender, recipient and amount have
// been checked against chain 31611.
import {
  decodeFunctionData,
  parseEventLogs,
  type Address,
  type Hash,
  type PublicClient,
  type TransactionReceipt,
} from "viem";

import { borrowerOperationsAbi, erc20Abi, troveManagerAbi } from "./abis";
import {
  PROTOCOL,
  MUSD,
  MEZO_TESTNET_CHAIN_ID,
  REQUIRED_CONFIRMATIONS,
  ZERO_ADDRESS,
} from "./config";

export type VerifiedTransfer = {
  chainId: number;
  txHash: Hash;
  blockNumber: bigint;
  from: Address;
  to: Address;
  amountWei: bigint;
  token: Address;
  confirmations: number;
};

export type VerifyClient = Pick<
  PublicClient,
  "getTransactionReceipt" | "getTransaction" | "getBlockNumber" | "readContract" | "getChainId"
>;

function sameAddress(a: string | null | undefined, b: string): boolean {
  return Boolean(a) && a!.toLowerCase() === b.toLowerCase();
}

export function assertTxHash(hash: string): asserts hash is Hash {
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) throw new Error("Invalid transaction hash");
}

async function confirmationsFor(
  receipt: TransactionReceipt,
  client: VerifyClient,
): Promise<number> {
  const latest = await client.getBlockNumber();
  const depth = latest >= receipt.blockNumber ? latest - receipt.blockNumber + 1n : 0n;
  const confirmations = Number(depth);
  if (confirmations < REQUIRED_CONFIRMATIONS) {
    throw new Error(`Waiting for ${REQUIRED_CONFIRMATIONS} confirmation(s) on Mezo Testnet`);
  }
  return confirmations;
}

async function assertChain(client: VerifyClient): Promise<void> {
  const chainId = await client.getChainId();
  if (chainId !== MEZO_TESTNET_CHAIN_ID) {
    throw new Error(`Expected Mezo Testnet (${MEZO_TESTNET_CHAIN_ID}), got chain ${chainId}`);
  }
}

/** Verifies an ERC-20 MUSD Transfer emitted by the canonical testnet token. */
export async function verifyMusdTransfer(
  params: {
    txHash: string;
    expectedFrom?: Address;
    expectedTo: Address;
    minAmountWei: bigint;
  },
  client: VerifyClient = attachPublicClient(),
): Promise<VerifiedTransfer> {
  assertTxHash(params.txHash);
  await assertChain(client);
  const receipt = await client.getTransactionReceipt({ hash: params.txHash });
  if (!receipt) throw new Error("Transaction was not found on Mezo Testnet");
  if (receipt.status !== "success") throw new Error("The Mezo transaction reverted");
  if (!sameAddress(receipt.to, MUSD.address)) {
    throw new Error("That transaction did not call the canonical MUSD contract");
  }
  const confirmations = await confirmationsFor(receipt, client);

  const transfers = parseEventLogs({
    abi: erc20Abi,
    logs: receipt.logs,
    eventName: "Transfer",
  });
  const match = transfers.find(
    (log) =>
      sameAddress(log.args.to, params.expectedTo) &&
      (!params.expectedFrom || sameAddress(log.args.from, params.expectedFrom)) &&
      log.args.value >= params.minAmountWei,
  );
  if (!match) {
    throw new Error("No matching MUSD transfer to the expected recipient and amount was found");
  }

  return {
    chainId: MEZO_TESTNET_CHAIN_ID,
    txHash: params.txHash,
    blockNumber: receipt.blockNumber,
    from: match.args.from,
    to: match.args.to,
    amountWei: match.args.value,
    token: MUSD.address,
    confirmations,
  };
}

/** Verifies a native test-BTC transfer (gas asset, not an ERC-20). */
export async function verifyNativeBtcTransfer(
  params: {
    txHash: string;
    expectedFrom?: Address;
    expectedTo: Address;
    minAmountWei: bigint;
  },
  client: VerifyClient = attachPublicClient(),
): Promise<VerifiedTransfer> {
  assertTxHash(params.txHash);
  await assertChain(client);
  const [receipt, tx] = await Promise.all([
    client.getTransactionReceipt({ hash: params.txHash }),
    client.getTransaction({ hash: params.txHash }),
  ]);
  if (!receipt) throw new Error("Transaction was not found on Mezo Testnet");
  if (receipt.status !== "success") throw new Error("The Mezo transaction reverted");
  if (!sameAddress(tx.to, params.expectedTo))
    throw new Error("BTC was sent to a different address");
  if (params.expectedFrom && !sameAddress(tx.from, params.expectedFrom)) {
    throw new Error("BTC was sent from a different wallet");
  }
  if (tx.value < params.minAmountWei) throw new Error("The BTC amount is lower than expected");
  const confirmations = await confirmationsFor(receipt, client);
  return {
    chainId: MEZO_TESTNET_CHAIN_ID,
    txHash: params.txHash,
    blockNumber: receipt.blockNumber,
    from: tx.from,
    to: tx.to!,
    amountWei: tx.value,
    token: "0x0000000000000000000000000000000000000000",
    confirmations,
  };
}

export type VerifiedTrove = {
  txHash: Hash;
  blockNumber: bigint;
  owner: Address;
  status: number;
  collateralWei: bigint;
  debtWei: bigint;
  confirmations: number;
  /** MUSD the borrower actually received (the `openTrove` argument). */
  principalWei: bigint;
  interestWei: bigint;
  /** BorrowerOperations operation that produced the verified event. */
  operation: number;
};

export type VerifiedTroveRepay = VerifiedTrove & {
  /** MUSD burned from the treasury by the verified repayment. */
  repaidWei: bigint;
  closed: boolean;
};

const TROVE_OP = { open: 0, close: 1, adjust: 2, refinance: 3 } as const;

/**
 * Reads the BorrowerOperations `TroveUpdated` event emitted by this exact
 * transaction. Current trove state alone is not proof of what the transaction
 * did, so every trove confirmation is anchored to this event.
 */
function troveEvent(receipt: TransactionReceipt, owner: Address, operations: readonly number[]) {
  const events = parseEventLogs({
    abi: borrowerOperationsAbi,
    logs: receipt.logs,
    eventName: "TroveUpdated",
  });
  return events.find(
    (log) =>
      sameAddress(log.args._borrower, owner) && operations.includes(Number(log.args._operation)),
  );
}

/** Confirms that this exact transaction opened the trove and reads its effect from the event. */
export async function verifyTroveOpened(
  params: {
    txHash: string;
    owner: Address;
    minCollateralWei: bigint;
    minDebtWei: bigint;
    expectedFrom?: Address;
  },
  client: VerifyClient = attachPublicClient(),
): Promise<VerifiedTrove> {
  assertTxHash(params.txHash);
  await assertChain(client);
  const [receipt, tx, status] = await Promise.all([
    client.getTransactionReceipt({ hash: params.txHash }),
    client.getTransaction({ hash: params.txHash }),
    client.readContract({
      address: PROTOCOL.troveManager,
      abi: troveManagerAbi,
      functionName: "getTroveStatus",
      args: [params.owner],
    }),
  ]);
  if (!receipt) throw new Error("Transaction was not found on Mezo Testnet");
  if (receipt.status !== "success") throw new Error("The Mezo transaction reverted");
  if (!sameAddress(receipt.to, PROTOCOL.borrowerOperations)) {
    throw new Error("That transaction did not call Mezo BorrowerOperations");
  }
  if (!sameAddress(tx.to, PROTOCOL.borrowerOperations)) {
    throw new Error("That transaction did not call Mezo BorrowerOperations");
  }
  if (params.expectedFrom && !sameAddress(tx.from, params.expectedFrom)) {
    throw new Error("The trove transaction was signed by a different wallet");
  }

  const call = decodeFunctionData({ abi: borrowerOperationsAbi, data: tx.input });
  if (call.functionName !== "openTrove") {
    throw new Error("That transaction was not an openTrove call");
  }
  const principalWei = call.args[0];
  if (principalWei <= 0n) throw new Error("The openTrove call borrowed zero MUSD");

  const event = troveEvent(receipt, params.owner, [TROVE_OP.open]);
  if (!event) {
    throw new Error("No TroveUpdated(openTrove) event was emitted for this trove");
  }
  const collateralWei = event.args._coll;
  const debtWei = event.args._principal;
  if (collateralWei <= 0n) throw new Error("The trove event reported zero collateral");
  if (tx.value !== collateralWei) {
    throw new Error("The trove collateral does not match the BTC sent in the transaction");
  }
  if (collateralWei < params.minCollateralWei)
    throw new Error("Trove collateral is lower than expected");
  if (debtWei < params.minDebtWei) throw new Error("Trove debt is lower than expected");
  if (Number(status) !== 1) throw new Error("The Mezo trove is not active");

  const confirmations = await confirmationsFor(receipt, client);
  return {
    txHash: params.txHash,
    blockNumber: receipt.blockNumber,
    owner: params.owner,
    status: Number(status),
    collateralWei,
    debtWei,
    confirmations,
    principalWei,
    interestWei: event.args._interest,
    operation: Number(event.args._operation),
  };
}

/**
 * Confirms a repayment by decoding the BorrowerOperations call, requiring the
 * matching `TroveUpdated` event, and summing the MUSD burn logs. The returned
 * `repaidWei` is the amount actually burned on chain, never a client value.
 */
export async function verifyTroveRepaid(
  params: {
    txHash: string;
    owner: Address;
    expectedFrom?: Address;
  },
  client: VerifyClient = attachPublicClient(),
): Promise<VerifiedTroveRepay> {
  assertTxHash(params.txHash);
  await assertChain(client);
  const [receipt, tx, status] = await Promise.all([
    client.getTransactionReceipt({ hash: params.txHash }),
    client.getTransaction({ hash: params.txHash }),
    client.readContract({
      address: PROTOCOL.troveManager,
      abi: troveManagerAbi,
      functionName: "getTroveStatus",
      args: [params.owner],
    }),
  ]);
  if (!receipt) throw new Error("Transaction was not found on Mezo Testnet");
  if (receipt.status !== "success") throw new Error("The Mezo transaction reverted");
  if (!sameAddress(receipt.to, PROTOCOL.borrowerOperations)) {
    throw new Error("That transaction did not call Mezo BorrowerOperations");
  }
  if (!sameAddress(tx.to, PROTOCOL.borrowerOperations)) {
    throw new Error("That transaction did not call Mezo BorrowerOperations");
  }
  if (params.expectedFrom && !sameAddress(tx.from, params.expectedFrom)) {
    throw new Error("The repayment transaction was signed by a different wallet");
  }

  const call = decodeFunctionData({ abi: borrowerOperationsAbi, data: tx.input });
  if (call.functionName !== "repayMUSD" && call.functionName !== "closeTrove") {
    throw new Error("That transaction was not a repayMUSD or closeTrove call");
  }

  const event = troveEvent(receipt, params.owner, [TROVE_OP.close, TROVE_OP.adjust]);
  if (!event) {
    throw new Error("No TroveUpdated(repay) event was emitted for this trove");
  }
  const operation = Number(event.args._operation);
  const closed = operation === TROVE_OP.close;
  const statusNumber = Number(status);
  if (closed && statusNumber !== 2) throw new Error("The trove close was not reflected on-chain");
  if (!closed && statusNumber !== 1) throw new Error("The trove is not active after the repayment");

  const transfers = parseEventLogs({
    abi: erc20Abi,
    logs: receipt.logs,
    eventName: "Transfer",
  });
  const repaidWei = transfers
    .filter(
      (log) =>
        sameAddress(log.address, MUSD.address) &&
        sameAddress(log.args.from, params.owner) &&
        sameAddress(log.args.to, ZERO_ADDRESS),
    )
    .reduce((total, log) => total + log.args.value, 0n);
  if (repaidWei <= 0n) {
    throw new Error("No MUSD repayment burn was found in that transaction");
  }

  const confirmations = await confirmationsFor(receipt, client);
  return {
    txHash: params.txHash,
    blockNumber: receipt.blockNumber,
    owner: params.owner,
    status: statusNumber,
    collateralWei: event.args._coll,
    debtWei: closed ? 0n : event.args._principal,
    confirmations,
    principalWei: 0n,
    interestWei: event.args._interest,
    operation,
    repaidWei,
    closed,
  };
}

// Attach the production client lazily so tests can inject a fake without
// importing the RPC transport (and so this module never runs a network call at
// module scope).
import { publicClient } from "./client";
function attachPublicClient(): VerifyClient {
  return publicClient;
}
