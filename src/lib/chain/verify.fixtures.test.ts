// Fixture tests: the verifier is exercised against receipts that really happened
// on Mezo Testnet, not against hand-written mocks.
//
// The fixtures are recorded by `bun scripts/fetch-mezo-fixtures.ts` into
// src/test/fixtures/mezo-receipts.json. Only two things are injected:
//   * the chain id / head block, so the fixture never expires, and
//   * `TroveManager.getTroveStatus`, which is read live in production seconds
//     after the open. The real value recorded at capture time is kept as
//     `troveStatusNow` and asserted separately.
import { describe, expect, it } from "vitest";
import type { TransactionReceipt } from "viem";

import { assertNotSelfTransfer, sameAddress } from "./guards";
import {
  verifyMusdTransfer,
  verifyNativeBtcTransfer,
  verifyTroveOpened,
  type VerifyClient,
} from "./verify.server";
import fixture from "@/test/fixtures/mezo-receipts.json";

type RawBundle = Omit<(typeof fixture)["openTrove"], "owner" | "troveStatusNow">;

const MUSD_500 = 500n * 10n ** 18n;
const MUSD_100 = 100n * 10n ** 18n;

/** Reads the `address` argument out of an indexed 32-byte log topic. */
function topicAddress(topic: string): `0x${string}` {
  return `0x${topic.slice(26)}`;
}

function receiptOf(bundle: RawBundle): TransactionReceipt {
  const raw = bundle.receipt;
  return {
    transactionHash: raw.transactionHash,
    blockNumber: BigInt(raw.blockNumber),
    status: raw.status as "success" | "reverted",
    from: raw.from,
    to: raw.to,
    gasUsed: BigInt(raw.gasUsed),
    contractAddress: raw.contractAddress,
    logs: raw.logs.map((log) => ({
      address: log.address,
      topics: log.topics,
      data: log.data,
      blockNumber: BigInt(log.blockNumber),
      logIndex: Number(log.logIndex),
      transactionHash: log.transactionHash,
      transactionIndex: Number(log.transactionIndex),
      blockHash: `0x${"0".repeat(64)}`,
      removed: log.removed,
    })),
  } as unknown as TransactionReceipt;
}

/**
 * A read-only client backed by one recorded transaction. `head` and
 * `troveStatus` are the only synthetic values; everything else comes from the
 * fixture file.
 */
function fixtureClient(
  bundle: RawBundle,
  troveStatus = 1n,
  chainId = fixture.chainId,
): VerifyClient {
  const tx = {
    hash: bundle.tx.hash,
    from: bundle.tx.from,
    to: bundle.tx.to,
    value: BigInt(bundle.tx.value),
    input: bundle.tx.input,
    nonce: Number(bundle.tx.nonce),
    blockNumber: BigInt(bundle.tx.blockNumber),
    transactionIndex: Number(bundle.tx.transactionIndex),
  };
  const receipt = receiptOf(bundle);
  return {
    getChainId: async () => chainId,
    getBlockNumber: async () => BigInt(fixture.capturedAtBlock),
    getTransactionReceipt: async ({ hash }: { hash: string }) =>
      hash.toLowerCase() === receipt.transactionHash.toLowerCase() ? receipt : null,
    getTransaction: async () => tx,
    readContract: async () => troveStatus,
  } as unknown as VerifyClient;
}

describe("verification against real Mezo Testnet receipts", () => {
  describe("openTrove", () => {
    const open = fixture.openTrove;
    const owner = open.owner as `0x${string}`;

    it("decodes a genuine openTrove receipt and its TroveUpdated event", async () => {
      const verified = await verifyTroveOpened(
        {
          txHash: open.hash,
          owner,
          minCollateralWei: 1n,
          minDebtWei: 1n,
          expectedFrom: owner,
        },
        fixtureClient(open),
      );

      // Collateral must equal the BTC actually sent with the call.
      expect(verified.collateralWei).toBe(BigInt(open.tx.value));
      expect(verified.collateralWei).toBeGreaterThan(0n);
      expect(verified.principalWei).toBeGreaterThan(0n);
      expect(verified.operation).toBe(0);
      expect(verified.owner.toLowerCase()).toBe(owner.toLowerCase());
      expect(verified.confirmations).toBeGreaterThanOrEqual(1);
    });

    it("rejects the same receipt when the trove belongs to someone else", async () => {
      await expect(
        verifyTroveOpened(
          {
            txHash: open.hash,
            owner: "0x0000000000000000000000000000000000000001",
            minCollateralWei: 1n,
            minDebtWei: 1n,
          },
          fixtureClient(open),
        ),
      ).rejects.toThrow(/No TroveUpdated\(openTrove\) event/);
    });

    it("rejects a debt floor higher than the event reported", async () => {
      await expect(
        verifyTroveOpened(
          { txHash: open.hash, owner, minCollateralWei: 1n, minDebtWei: 10n ** 30n },
          fixtureClient(open),
        ),
      ).rejects.toThrow(/Trove debt is lower than expected/);
    });

    it("refuses a trove that is no longer active", async () => {
      // The fixture records the live status at capture time. This trove was
      // redeemed later, which is exactly the state the verifier must reject.
      expect(open.troveStatusNow).not.toBe(1);
      await expect(
        verifyTroveOpened(
          { txHash: open.hash, owner, minCollateralWei: 1n, minDebtWei: 1n },
          fixtureClient(open, BigInt(open.troveStatusNow)),
        ),
      ).rejects.toThrow(/not active/);
    });

    it("rejects a receipt from a different chain", async () => {
      await expect(
        verifyTroveOpened(
          { txHash: open.hash, owner, minCollateralWei: 1n, minDebtWei: 1n },
          fixtureClient(open, 1n, 1),
        ),
      ).rejects.toThrow(/Expected Mezo Testnet/);
    });
  });

  describe("MUSD transfers", () => {
    const transfer = fixture.musdTransfer;
    const log = transfer.receipt.logs[0]!;
    const from = topicAddress(log.topics[1]!);
    const to = topicAddress(log.topics[2]!);

    it("accepts a real 500 MUSD transfer between two wallets", async () => {
      expect(sameAddress(from, to)).toBe(false);
      const verified = await verifyMusdTransfer(
        { txHash: transfer.hash, expectedFrom: from, expectedTo: to, minAmountWei: MUSD_500 },
        fixtureClient(transfer),
      );
      expect(verified.amountWei).toBe(MUSD_500);
      expect(verified.to.toLowerCase()).toBe(to.toLowerCase());
      expect(verified.token.toLowerCase()).toBe(log.address.toLowerCase());
    });

    it("rejects the same transfer for a different recipient", async () => {
      await expect(
        verifyMusdTransfer(
          {
            txHash: transfer.hash,
            expectedTo: "0x0000000000000000000000000000000000000001",
            minAmountWei: 1n,
          },
          fixtureClient(transfer),
        ),
      ).rejects.toThrow(/No matching MUSD transfer/);
    });

    it("rejects the same transfer when more MUSD is expected than was sent", async () => {
      await expect(
        verifyMusdTransfer(
          { txHash: transfer.hash, expectedTo: to, minAmountWei: MUSD_500 + 1n },
          fixtureClient(transfer),
        ),
      ).rejects.toThrow(/No matching MUSD transfer/);
    });

    it("would accept the recorded self-transfer, which is why the deposit guard exists", async () => {
      const self = fixture.musdSelfTransfer;
      const selfLog = self.receipt.logs[0]!;
      const selfFrom = topicAddress(selfLog.topics[1]!);
      const selfTo = topicAddress(selfLog.topics[2]!);
      expect(sameAddress(selfFrom, selfTo)).toBe(true);

      // The receipt is genuine: 100 MUSD moved from the treasury to itself.
      const verified = await verifyMusdTransfer(
        { txHash: self.hash, expectedFrom: selfFrom, expectedTo: selfTo, minAmountWei: 1n },
        fixtureClient(self),
      );
      expect(verified.amountWei).toBe(MUSD_100);

      // ...and it must never be credited to the family ledger.
      expect(() => assertNotSelfTransfer(selfFrom, selfTo, "self transfer")).toThrow(
        "self transfer",
      );
    });
  });

  describe("native BTC transfers", () => {
    const btc = fixture.btcSelfTransfer;
    const from = btc.tx.from as `0x${string}`;
    const to = btc.tx.to as `0x${string}`;

    it("accepts a real BTC transfer receipt", async () => {
      const verified = await verifyNativeBtcTransfer(
        { txHash: btc.hash, expectedFrom: from, expectedTo: to, minAmountWei: 1n },
        fixtureClient(btc),
      );
      expect(verified.amountWei).toBe(BigInt(btc.tx.value));
      expect(verified.amountWei).toBe(40n * 10n ** 15n);
    });

    it("is a self-transfer, so the deposit guard must reject it", () => {
      expect(sameAddress(from, to)).toBe(true);
      expect(() => assertNotSelfTransfer(from, to, "self transfer")).toThrow("self transfer");
    });
  });
});
