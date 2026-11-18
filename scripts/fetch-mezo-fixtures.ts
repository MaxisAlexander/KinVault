// Records real Mezo Testnet transactions into a fixture file so the verifier can
// be tested against genuine receipts instead of hand-written mocks.
//
//   bun scripts/fetch-mezo-fixtures.ts
//
// The script is read-only: it fetches transactions, receipts and one view call
// from the public testnet RPC and writes src/test/fixtures/mezo-receipts.json.
// Re-running it with the hashes below reproduces the same fixtures.
//
// It talks to the RPC with plain JSON-RPC over `fetch` on purpose: the public
// Mezo endpoint rejects some batched requests that viem's client issues, and a
// fixture recorder should be as boring as possible.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { decodeFunctionResult, encodeFunctionData } from "viem";

import { troveManagerAbi } from "../src/lib/chain/abis";
import { MEZO_TESTNET_CHAIN_ID, MEZO_TESTNET_RPC, PROTOCOL } from "../src/lib/chain/config";

/** Real transactions on Mezo Testnet (chain 31611). */
const HASHES = {
  /** A genuine `BorrowerOperations.openTrove` call, 0.06 BTC collateral. */
  openTrove: "0x4ea9ac261a6c6a69234e8c508fcfda6594a00ad855ff1d396aa9fa592bd90fb4",
  /** A genuine `MUSD.transfer` of 500 MUSD between two different wallets. */
  musdTransfer: "0xf027f02f4fc5e005cbfe7b2b2ca5095d8f8efbb6d7ebdc32efefda901161900c",
  /** The 100 MUSD "deposit" KinVault recorded: a wallet transferring to itself. */
  musdSelfTransfer: "0x5c61ad312481b2076adfc35a11363fe586d89e35b0cdc8310d7c1959a24fe6d6",
  /** The 0.04 BTC "deposit" KinVault recorded: a wallet transferring to itself. */
  btcSelfTransfer: "0x3d553eacbafb8a7985011c191c37fef161b7f1c86f53d5cf3385ecc00b512371",
} as const;

type Json = Record<string, unknown>;

async function rpcOnce<T>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch(MEZO_TESTNET_RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const body = (await res.json()) as { result?: T; error?: { message: string } };
  if (body.error) throw new Error(`${method}: ${body.error.message}`);
  return body.result as T;
}

/** The public endpoint occasionally drops a request; retry a few times. */
async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  let last: unknown;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const result = await rpcOnce<T>(method, params);
      if (result !== null && result !== undefined) return result;
      last = new Error(`${method} returned null for ${JSON.stringify(params)}`);
    } catch (error) {
      last = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
  }
  throw last instanceof Error ? last : new Error(`${method} failed`);
}

type RawTx = {
  hash: string;
  from: string;
  to: string | null;
  value: string;
  input: string;
  nonce: string;
  blockNumber: string;
  transactionIndex: string;
};

type RawLog = {
  address: string;
  topics: string[];
  data: string;
  blockNumber: string;
  logIndex: string;
  transactionHash: string;
  transactionIndex: string;
  removed: boolean;
};

type RawReceipt = {
  transactionHash: string;
  blockNumber: string;
  status: string;
  from: string;
  to: string | null;
  gasUsed: string;
  contractAddress: string | null;
  logs: RawLog[];
};

type Bundle = { hash: string; tx: Json; receipt: Json };

async function bundle(hash: string): Promise<Bundle> {
  const tx = await rpc<RawTx>("eth_getTransactionByHash", [hash]);
  const receipt = await rpc<RawReceipt>("eth_getTransactionReceipt", [hash]);
  return {
    hash,
    // JSON has no bigint, so every numeric field is stored as a decimal string.
    tx: {
      hash: tx.hash,
      from: tx.from,
      to: tx.to,
      value: tx.value,
      input: tx.input,
      nonce: tx.nonce,
      blockNumber: tx.blockNumber,
      transactionIndex: tx.transactionIndex,
    },
    receipt: {
      transactionHash: receipt.transactionHash,
      blockNumber: receipt.blockNumber,
      status: receipt.status === "0x1" ? "success" : "reverted",
      from: receipt.from,
      to: receipt.to,
      gasUsed: receipt.gasUsed,
      contractAddress: receipt.contractAddress,
      logs: receipt.logs.map((log) => ({
        address: log.address,
        topics: log.topics,
        data: log.data,
        blockNumber: log.blockNumber,
        logIndex: log.logIndex,
        transactionHash: log.transactionHash,
        transactionIndex: log.transactionIndex,
        removed: log.removed,
      })),
    },
  };
}

const openTrove = await bundle(HASHES.openTrove);
const musdTransfer = await bundle(HASHES.musdTransfer);
const musdSelfTransfer = await bundle(HASHES.musdSelfTransfer);
const btcSelfTransfer = await bundle(HASHES.btcSelfTransfer);

const owner = (openTrove.tx.from as string).toLowerCase();
const statusCall = encodeFunctionData({
  abi: troveManagerAbi,
  functionName: "getTroveStatus",
  args: [owner as `0x${string}`],
});
const [statusResult, latestBlockHex] = await Promise.all([
  rpc<string>("eth_call", [{ to: PROTOCOL.troveManager, data: statusCall }, "latest"]),
  rpc<string>("eth_blockNumber", []),
]);
const troveStatus = Number(
  decodeFunctionResult({
    abi: troveManagerAbi,
    functionName: "getTroveStatus",
    data: statusResult as `0x${string}`,
  }),
);
const latestBlock = BigInt(latestBlockHex);

const fixture = {
  $comment:
    "Captured from Mezo Testnet (chain 31611) by scripts/fetch-mezo-fixtures.ts. Numbers are decimal strings so the file is JSON-safe.",
  chainId: MEZO_TESTNET_CHAIN_ID,
  capturedAtBlock: latestBlock.toString(),
  openTrove: { ...openTrove, owner, troveStatusNow: Number(troveStatus) },
  musdTransfer,
  musdSelfTransfer,
  btcSelfTransfer,
};

const target = path.join(process.cwd(), "src", "test", "fixtures", "mezo-receipts.json");
await mkdir(path.dirname(target), { recursive: true });
await writeFile(target, `${JSON.stringify(fixture, null, 2)}\n`, "utf8");

console.log(`Wrote ${target}`);
console.log(
  `  openTrove        ${openTrove.hash} (owner ${owner}, trove status now ${troveStatus})`,
);
console.log(`  musdTransfer     ${musdTransfer.hash}`);
console.log(`  musdSelfTransfer ${musdSelfTransfer.hash}`);
console.log(`  btcSelfTransfer  ${btcSelfTransfer.hash}`);
console.log(`  captured at block ${latestBlock}`);
