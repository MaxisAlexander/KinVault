/**
 * Re-verifies a real Mezo Testnet transaction with the same code the server runs
 * before it credits a family ledger, and prints copy-pasteable evidence.
 *
 *   bun scripts/mezo-proof.ts 0x<64 hex chars>
 *
 * The transaction type is detected from the receipt, so the same command works
 * for a MUSD transfer, a native BTC transfer, an `openTrove`, or a
 * `repayMUSD`/`closeTrove`. Nothing is written and no key is needed: this is a
 * read-only audit of a transaction you (or anyone) already mined.
 */
import { decodeFunctionData, formatUnits, parseEventLogs, type Address } from "viem";

import { borrowerOperationsAbi, erc20Abi } from "../src/lib/chain/abis";
import { explorerTxUrl, MEZO_TESTNET_CHAIN_ID, MUSD, PROTOCOL } from "../src/lib/chain/config";
import { sameAddress } from "../src/lib/chain/guards";
import {
  verifyMusdTransfer,
  verifyNativeBtcTransfer,
  verifyTroveOpened,
  verifyTroveRepaid,
  type VerifyClient,
} from "../src/lib/chain/verify.server";
import { publicClient } from "../src/lib/chain/client";

const hash = process.argv[2];
if (!hash || !/^0x[0-9a-fA-F]{64}$/.test(hash)) {
  console.error("usage: bun scripts/mezo-proof.ts 0x<64 hex characters>");
  process.exit(1);
}

/** The public endpoint sometimes answers "not found" for a tx it has served. */
async function withRetry<T>(label: string, fn: () => Promise<T>, attempts = 5): Promise<T> {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch {
      if (attempt === attempts) break;
      await new Promise((resolve) => setTimeout(resolve, 600 * attempt));
    }
  }
  throw new Error(
    `${label} could not be read from the Mezo Testnet RPC after ${attempts} attempts. ` +
      "That is usually a transient RPC miss — wait a few seconds and run the command again.",
  );
}

const client: VerifyClient = publicClient;
const [tx, receipt, chainId] = await Promise.all([
  withRetry("The transaction", () => client.getTransaction({ hash: hash as `0x${string}` })),
  withRetry("The receipt", () => client.getTransactionReceipt({ hash: hash as `0x${string}` })),
  client.getChainId(),
]);

if (chainId !== MEZO_TESTNET_CHAIN_ID) {
  throw new Error(`Expected Mezo Testnet (${MEZO_TESTNET_CHAIN_ID}), got ${chainId}`);
}
if (receipt.status !== "success") throw new Error("That transaction reverted on chain");

const owner = tx.from as Address;
const usd = (wei: bigint) => `${formatUnits(wei, 18)}`;

type Evidence = {
  kind: string;
  summary: string;
  detail: Array<[string, string]>;
};

let evidence: Evidence;

if (tx.to && sameAddress(tx.to, MUSD.address)) {
  // The recipient comes from the receipt, never from a guess.
  const [log] = parseEventLogs({ abi: erc20Abi, logs: receipt.logs, eventName: "Transfer" });
  if (!log) throw new Error("No MUSD Transfer log in that receipt");
  const verified = await verifyMusdTransfer({
    txHash: hash,
    expectedFrom: log.args.from,
    expectedTo: log.args.to,
    minAmountWei: 1n,
  });
  evidence = {
    kind: sameAddress(verified.from, verified.to)
      ? "MUSD transfer (SELF-TRANSFER)"
      : "MUSD transfer",
    summary: `${usd(verified.amountWei)} MUSD ${verified.from} → ${verified.to}`,
    detail: [
      ["from", verified.from],
      ["to", verified.to],
      ["amount", `${usd(verified.amountWei)} MUSD`],
      ["block", verified.blockNumber.toString()],
      ["confirmations", String(verified.confirmations)],
    ],
  };
} else if (tx.to && sameAddress(tx.to, PROTOCOL.borrowerOperations)) {
  const call = decodeFunctionData({ abi: borrowerOperationsAbi, data: tx.input });
  if (call.functionName === "openTrove") {
    const verified = await verifyTroveOpened({
      txHash: hash,
      owner,
      minCollateralWei: 1n,
      minDebtWei: 1n,
      expectedFrom: owner,
    }).catch((error: unknown) => {
      if (error instanceof Error && /not active/.test(error.message)) {
        throw new Error(
          "This transaction opened a trove that has since been closed or redeemed on Mezo Testnet. " +
            "The verifier only accepts a trove that is active right now, so re-run this against a fresh borrow.",
        );
      }
      throw error;
    });
    evidence = {
      kind: "openTrove",
      summary: `${usd(verified.collateralWei)} BTC collateral, ${usd(verified.principalWei)} MUSD minted`,
      detail: [
        ["borrower", verified.owner],
        ["collateral", `${usd(verified.collateralWei)} BTC`],
        ["principal", `${usd(verified.principalWei)} MUSD`],
        ["debt", `${usd(verified.debtWei)} MUSD`],
        ["interest owed", `${usd(verified.interestWei)} MUSD`],
        ["operation", "openTrove (0)"],
        ["block", verified.blockNumber.toString()],
      ],
    };
  } else if (call.functionName === "repayMUSD" || call.functionName === "closeTrove") {
    const verified = await verifyTroveRepaid({ txHash: hash, owner, expectedFrom: owner });
    evidence = {
      kind: verified.closed ? "closeTrove" : "repayMUSD",
      summary: `${usd(verified.repaidWei)} MUSD burned${verified.closed ? ", trove closed" : ""}`,
      detail: [
        ["borrower", verified.owner],
        ["repaid", `${usd(verified.repaidWei)} MUSD`],
        ["remaining debt", `${usd(verified.debtWei)} MUSD`],
        ["trove status", String(verified.status)],
        ["block", verified.blockNumber.toString()],
      ],
    };
  } else {
    throw new Error(`That BorrowerOperations call is ${call.functionName}, not a borrow or repay`);
  }
} else {
  const verified = await verifyNativeBtcTransfer({
    txHash: hash,
    expectedFrom: owner,
    expectedTo: tx.to as Address,
    minAmountWei: 1n,
  });
  evidence = {
    kind: sameAddress(verified.from, verified.to) ? "BTC transfer (SELF-TRANSFER)" : "BTC transfer",
    summary: `${usd(verified.amountWei)} BTC ${verified.from} → ${verified.to}`,
    detail: [
      ["from", verified.from],
      ["to", verified.to],
      ["amount", `${usd(verified.amountWei)} BTC`],
      ["block", verified.blockNumber.toString()],
      ["confirmations", String(verified.confirmations)],
    ],
  };
}

console.log(`verified on Mezo Testnet (chain ${MEZO_TESTNET_CHAIN_ID})`);
console.log(`  kind      ${evidence.kind}`);
console.log(`  summary   ${evidence.summary}`);
for (const [label, value] of evidence.detail) console.log(`  ${label.padEnd(9)} ${value}`);
console.log(`  explorer  ${explorerTxUrl(hash)}`);
console.log("");
console.log("| Flow | Transaction | Verified effect |");
console.log("| --- | --- | --- |");
console.log(
  `| ${evidence.kind} | [\`${hash.slice(0, 10)}…\`](${explorerTxUrl(hash)}) | ${evidence.summary} |`,
);
