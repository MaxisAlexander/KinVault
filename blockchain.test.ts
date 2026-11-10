/**
 * Root blockchain test suite for KinVault.
 *
 * Run with: bun run test
 * These tests never touch the network. The live Mezo RPC checks are documented
 * in TESTING.md and can be run with `bun run test:live` (read-only).
 */
import { describe, expect, it } from "vitest";
import {
  encodeAbiParameters,
  encodeEventTopics,
  encodeFunctionData,
  type Address,
  type Hash,
} from "viem";

import { borrowerOperationsAbi, erc20Abi } from "./src/lib/chain/abis";
import {
  collateralHealth,
  formatMusd,
  formatPrice,
  formatTokenAmount,
  parseBtcAmount,
  parseTokenAmount,
} from "./src/lib/chain/amounts";
import {
  MEZO_TESTNET_CHAIN_ID,
  MUSD,
  PROTOCOL,
  TOKENS,
  ZERO_ADDRESS,
  explorerTxUrl,
  MEZO_TESTNET_EXPLORER,
} from "./src/lib/chain/config";
import {
  attachExpenseSettlement,
  creditBtcDeposit,
  creditMusdDeposit,
  recordTroveOpen,
  recordTroveRepay,
  recordWithdrawal,
} from "./src/lib/chain/ledger";
import { planTrove, summarizeTrove } from "./src/lib/chain/protocol";
import {
  verifyMusdTransfer,
  verifyNativeBtcTransfer,
  verifyTroveOpened,
  verifyTroveRepaid,
  type VerifyClient,
} from "./src/lib/chain/verify.server";
import { verifyChain } from "./src/lib/ledger-chain";
import {
  applyAction,
  emptyLedger,
  type EngineCtx,
  type Expense,
  type Ledger,
  type Member,
  type OnchainRef,
} from "./src/lib/vault-engine";

const HASH = `0x${"a".repeat(64)}` as Hash;
const FROM = "0x1111111111111111111111111111111111111111" as Address;
const TO = "0x2222222222222222222222222222222222222222" as Address;
const OTHER = "0x3333333333333333333333333333333333333333" as Address;

const E18 = 10n ** 18n;

function transferLog(params: { from: Address; to: Address; value: bigint }) {
  return {
    address: MUSD.address,
    topics: encodeEventTopics({
      abi: erc20Abi,
      eventName: "Transfer",
      args: { from: params.from, to: params.to },
    }),
    data: encodeAbiParameters([{ type: "uint256" }], [params.value]),
    blockNumber: 100n,
    logIndex: 0,
    transactionHash: HASH,
    transactionIndex: 0,
    blockHash: `0x${"b".repeat(64)}` as Hash,
    removed: false,
  };
}

/**
 * Builds the `TroveUpdated` log BorrowerOperations emits. The verifier anchors
 * every trove confirmation to this event, so the tests encode it exactly the
 * way the contract does (one indexed borrower, seven data words).
 */
function troveUpdatedLog(params: {
  owner: Address;
  principal: bigint;
  coll: bigint;
  operation: number;
  interest?: bigint;
  stake?: bigint;
  interestRate?: number;
  lastInterestUpdateTime?: bigint;
}) {
  return {
    address: PROTOCOL.borrowerOperations,
    topics: encodeEventTopics({
      abi: borrowerOperationsAbi,
      eventName: "TroveUpdated",
      args: { _borrower: params.owner },
    }),
    data: encodeAbiParameters(
      [
        { type: "uint256" },
        { type: "uint256" },
        { type: "uint256" },
        { type: "uint256" },
        { type: "uint16" },
        { type: "uint256" },
        { type: "uint8" },
      ],
      [
        params.principal,
        params.interest ?? 0n,
        params.coll,
        params.stake ?? params.coll,
        params.interestRate ?? 100,
        params.lastInterestUpdateTime ?? 0n,
        params.operation,
      ],
    ),
    blockNumber: 100n,
    logIndex: 1,
    transactionHash: HASH,
    transactionIndex: 0,
    blockHash: `0x${"b".repeat(64)}` as Hash,
    removed: false,
  };
}

function fakeClient(overrides: Partial<Record<string, unknown>> = {}): VerifyClient {
  const receipt = {
    status: "success",
    to: MUSD.address,
    from: FROM,
    blockNumber: 100n,
    transactionHash: HASH,
    logs: [transferLog({ from: FROM, to: TO, value: 1_000n })],
  };
  const client = {
    getChainId: async () => MEZO_TESTNET_CHAIN_ID,
    getBlockNumber: async () => 101n,
    getTransactionReceipt: async () => receipt,
    getTransaction: async () => ({ to: TO, from: FROM, value: 1_000n }),
    readContract: async () => 0n,
    ...overrides,
  };
  return client as unknown as VerifyClient;
}

/** A fake client whose transaction is a real encoded BorrowerOperations call. */
function troveClient(params: {
  owner: Address;
  value: bigint;
  input: `0x${string}`;
  logs: Array<ReturnType<typeof troveUpdatedLog> | ReturnType<typeof transferLog>>;
  status?: bigint;
}): VerifyClient {
  return fakeClient({
    getTransaction: async () => ({
      to: PROTOCOL.borrowerOperations,
      from: params.owner,
      value: params.value,
      input: params.input,
    }),
    getTransactionReceipt: async () => ({
      status: "success",
      to: PROTOCOL.borrowerOperations,
      from: params.owner,
      blockNumber: 100n,
      transactionHash: HASH,
      logs: params.logs,
    }),
    readContract: async () => params.status ?? 1n,
  });
}

function openTroveInput(principalWei: bigint) {
  return encodeFunctionData({
    abi: borrowerOperationsAbi,
    functionName: "openTrove",
    args: [principalWei, ZERO_ADDRESS, ZERO_ADDRESS],
  });
}

function repayMusdInput(amountWei: bigint) {
  return encodeFunctionData({
    abi: borrowerOperationsAbi,
    functionName: "repayMUSD",
    args: [amountWei, ZERO_ADDRESS, ZERO_ADDRESS],
  });
}

const protocol = {
  mcr: 1_100_000_000_000_000_000n,
  gasCompensation: 200n * E18,
  minNetDebt: 1_800n * E18,
  ccr: 1_500_000_000_000_000_000n,
  borrowingRate: 1_000_000_000_000_000n,
  borrowingRatePercent: 0.1,
};

function ref(amountWei = 1_000n): OnchainRef {
  return {
    chainId: 31611,
    txHash: HASH,
    blockNumber: 100,
    confirmations: 1,
    token: MUSD.address,
    from: FROM,
    to: TO,
    amountWei: amountWei.toString(),
  };
}

function member(id = "m1", role: Member["role"] = "admin"): Member {
  return {
    id,
    name: id === "m1" ? "Test Member" : "Second Guardian",
    role,
    age: 40,
    initials: id.toUpperCase(),
    tone: "chart-1",
    btc: 0,
    musd: 0,
    contributedBtc: 0,
    contributedMusd: 0,
  };
}

function ctx(onchain = false): EngineCtx {
  let n = 0;
  const now = new Date("2026-11-09T00:00:00Z");
  return {
    actorId: "m1",
    now,
    today: now,
    btcPrice: 73_766,
    block: 100,
    onchain,
    newId: (prefix) => `${prefix}${++n}`,
  };
}

function baseLedger(): Ledger {
  const l = emptyLedger(new Date("2026-11-09T00:00:00Z"));
  return { ...l, members: [member(), member("m2", "spouse"), member("m3", "admin")] };
}

describe("Mezo Testnet configuration", () => {
  it("uses chain 31611 and canonical testnet token addresses", () => {
    expect(MEZO_TESTNET_CHAIN_ID).toBe(31611);
    expect(MUSD.address.toLowerCase()).toBe("0x118917a40faf1cd7a13db0ef56c86de7973ac503");
    expect(MUSD.decimals).toBe(18);
    expect(TOKENS.MEZO.address.toLowerCase()).toBe("0x7b7c000000000000000000000000000000000001");
    expect(PROTOCOL.borrowerOperations).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(PROTOCOL.priceFeed).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  it("builds testnet explorer links, never mainnet", () => {
    expect(MEZO_TESTNET_EXPLORER).toBe("https://explorer.test.mezo.org");
    expect(explorerTxUrl(HASH)).toBe(`https://explorer.test.mezo.org/tx/${HASH}`);
    expect(explorerTxUrl(HASH)).not.toContain("explorer.mezo.org/tx");
  });

  it("encodes canonical ERC-20 and BorrowerOperations calls", () => {
    const transfer = encodeFunctionData({
      abi: erc20Abi,
      functionName: "transfer",
      args: [TO, 1_000n],
    });
    expect(transfer.startsWith("0xa9059cbb")).toBe(true);
    const open = openTroveInput(2_000n * E18);
    expect(open.startsWith("0x")).toBe(true);
    expect(open.length).toBeGreaterThan(10);
  });
});

describe("amount and price math", () => {
  it("parses and formats 18-decimal MUSD amounts", () => {
    expect(parseTokenAmount("1.5")).toBe(1_500_000_000_000_000_000n);
    expect(formatMusd(1_500_000_000_000_000_000n)).toBe("1.5");
    expect(formatTokenAmount(1_234_500_000_000_000_000n, 18, 2)).toBe("1.23");
  });

  it("parses native BTC amounts", () => {
    expect(parseBtcAmount("0.01")).toBe(10_000_000_000_000_000n);
  });

  it("converts the Mezo PriceFeed value to USD", () => {
    expect(formatPrice(73_766_724_930_000_000_000_000n, 18)).toBeCloseTo(73_766.72493);
  });

  it("computes health against a 110% MCR", () => {
    expect(collateralHealth(1_100_000_000_000_000_000n, 1_100_000_000_000_000_000n)).toBeCloseTo(1);
    expect(collateralHealth(2_200_000_000_000_000_000n, 1_100_000_000_000_000_000n)).toBeCloseTo(2);
  });
});

describe("protocol trove planning", () => {
  it("adds gas compensation to debt and permits a safe trove", () => {
    const plan = planTrove({
      collateralBtc: "0.1",
      borrowMusd: "2000",
      priceUsd: 73_766,
      protocol,
    });
    expect(plan.valid).toBe(true);
    expect(plan.totalDebtWei).toBe(2_200n * E18);
    expect(plan.minNetDebtWei).toBe(1_800n * E18);
    expect(plan.icr).toBeGreaterThan(1.1);
    expect(plan.maxBorrowWei).toBeGreaterThan(2_000n * E18);
  });

  it("rejects a borrow below Mezo's live minimum net debt", () => {
    const plan = planTrove({
      collateralBtc: "0.1",
      borrowMusd: "1000",
      priceUsd: 73_766,
      protocol,
    });
    expect(plan.valid).toBe(false);
    expect(plan.errors.join(" ")).toMatch(/minimum net debt/i);
  });

  it("falls back to 1,800 MUSD when the protocol read is unavailable", () => {
    const plan = planTrove({
      collateralBtc: "0.1",
      borrowMusd: "1000",
      priceUsd: 73_766,
      protocol: { mcr: protocol.mcr, gasCompensation: protocol.gasCompensation },
    });
    expect(plan.minNetDebtWei).toBe(1_800n * E18);
    expect(plan.valid).toBe(false);
  });

  it("rejects a trove below the minimum collateral ratio", () => {
    const plan = planTrove({
      collateralBtc: "0.01",
      borrowMusd: "2000",
      priceUsd: 73_766,
      protocol,
    });
    expect(plan.valid).toBe(false);
    expect(plan.errors.join(" ")).toMatch(/collateral ratio/i);
  });

  it("summarizes an active trove from protocol state", () => {
    const summary = summarizeTrove(
      {
        owner: FROM,
        status: "active",
        collateralWei: 100_000_000_000_000_000n,
        debtWei: 1_200_000_000_000_000_000_000n,
        interestWei: 0n,
        maxBorrowWei: 5_000_000_000_000_000_000_000n,
        icrWei: 6_000_000_000_000_000_000n,
        health: 5.45,
        active: true,
      },
      73_766,
    );
    expect(summary.active).toBe(true);
    expect(summary.collateralBtc).toBeCloseTo(0.1);
    expect(summary.debtMusd).toBeCloseTo(1200);
    expect(summary.liquidationPriceUsd).toBeGreaterThan(0);
  });
});

describe("server-side transaction verification", () => {
  it("accepts a successful MUSD transfer to the expected recipient", async () => {
    const result = await verifyMusdTransfer(
      { txHash: HASH, expectedFrom: FROM, expectedTo: TO, minAmountWei: 1_000n },
      fakeClient(),
    );
    expect(result.txHash).toBe(HASH);
    expect(result.amountWei).toBe(1_000n);
    expect(result.confirmations).toBe(2);
  });

  it("rejects the wrong chain", async () => {
    await expect(
      verifyMusdTransfer(
        { txHash: HASH, expectedTo: TO, minAmountWei: 1_000n },
        fakeClient({ getChainId: async () => 31612 }),
      ),
    ).rejects.toThrow(/Expected Mezo Testnet/);
  });

  it("rejects a transfer to the wrong recipient", async () => {
    await expect(
      verifyMusdTransfer({ txHash: HASH, expectedTo: OTHER, minAmountWei: 1_000n }, fakeClient()),
    ).rejects.toThrow(/No matching MUSD transfer/);
  });

  it("rejects an amount below the expected minimum", async () => {
    await expect(
      verifyMusdTransfer({ txHash: HASH, expectedTo: TO, minAmountWei: 2_000n }, fakeClient()),
    ).rejects.toThrow(/No matching MUSD transfer/);
  });

  it("rejects a reverted transaction", async () => {
    await expect(
      verifyMusdTransfer(
        { txHash: HASH, expectedTo: TO, minAmountWei: 1_000n },
        fakeClient({
          getTransactionReceipt: async () => ({
            status: "reverted",
            to: MUSD.address,
            from: FROM,
            blockNumber: 100n,
            logs: [],
          }),
        }),
      ),
    ).rejects.toThrow(/reverted/);
  });

  it("rejects a transfer with too few confirmations", async () => {
    await expect(
      verifyMusdTransfer(
        { txHash: HASH, expectedTo: TO, minAmountWei: 1_000n },
        fakeClient({ getBlockNumber: async () => 99n }),
      ),
    ).rejects.toThrow(/Waiting for/);
  });

  it("verifies native test-BTC transfers", async () => {
    const result = await verifyNativeBtcTransfer(
      { txHash: HASH, expectedTo: TO, expectedFrom: FROM, minAmountWei: 1_000n },
      fakeClient(),
    );
    expect(result.amountWei).toBe(1_000n);
  });

  it("verifies an active trove from the openTrove call and TroveUpdated event", async () => {
    const collateralWei = 100_000_000_000_000_000n;
    const principalWei = 2_000n * E18;
    const debtWei = 2_200n * E18;
    const result = await verifyTroveOpened(
      {
        txHash: HASH,
        owner: TO,
        minCollateralWei: collateralWei,
        minDebtWei: debtWei,
        expectedFrom: TO,
      },
      troveClient({
        owner: TO,
        value: collateralWei,
        input: openTroveInput(principalWei),
        logs: [
          troveUpdatedLog({ owner: TO, principal: debtWei, coll: collateralWei, operation: 0 }),
        ],
      }),
    );
    expect(result.status).toBe(1);
    expect(result.operation).toBe(0);
    expect(result.collateralWei).toBe(collateralWei);
    expect(result.debtWei).toBe(debtWei);
    // The principal is the call argument, not derived from current trove state.
    expect(result.principalWei).toBe(principalWei);
  });

  it("rejects a trove transaction that did not call openTrove", async () => {
    const collateralWei = 100_000_000_000_000_000n;
    await expect(
      verifyTroveOpened(
        { txHash: HASH, owner: TO, minCollateralWei: 0n, minDebtWei: 0n },
        troveClient({
          owner: TO,
          value: collateralWei,
          input: repayMusdInput(1n * E18),
          logs: [
            troveUpdatedLog({
              owner: TO,
              principal: 2_200n * E18,
              coll: collateralWei,
              operation: 0,
            }),
          ],
        }),
      ),
    ).rejects.toThrow(/openTrove/);
  });

  it("rejects a trove event whose collateral does not match the BTC sent", async () => {
    const collateralWei = 100_000_000_000_000_000n;
    await expect(
      verifyTroveOpened(
        { txHash: HASH, owner: TO, minCollateralWei: 0n, minDebtWei: 0n },
        troveClient({
          owner: TO,
          value: collateralWei * 2n,
          input: openTroveInput(2_000n * E18),
          logs: [
            troveUpdatedLog({
              owner: TO,
              principal: 2_200n * E18,
              coll: collateralWei,
              operation: 0,
            }),
          ],
        }),
      ),
    ).rejects.toThrow(/does not match/);
  });

  it("rejects an open transaction with no TroveUpdated event", async () => {
    await expect(
      verifyTroveOpened(
        { txHash: HASH, owner: TO, minCollateralWei: 0n, minDebtWei: 0n },
        troveClient({
          owner: TO,
          value: 100_000_000_000_000_000n,
          input: openTroveInput(2_000n * E18),
          logs: [],
        }),
      ),
    ).rejects.toThrow(/No TroveUpdated/);
  });

  it("verifies a partial repayment from the decoded call and MUSD burn logs", async () => {
    const repaidWei = 500n * E18;
    const remainingDebtWei = 1_700n * E18;
    const result = await verifyTroveRepaid(
      { txHash: HASH, owner: TO, expectedFrom: TO },
      troveClient({
        owner: TO,
        value: 0n,
        input: repayMusdInput(repaidWei),
        status: 1n,
        logs: [
          troveUpdatedLog({
            owner: TO,
            principal: remainingDebtWei,
            coll: 100_000_000_000_000_000n,
            operation: 2,
          }),
          transferLog({ from: TO, to: ZERO_ADDRESS, value: repaidWei }),
        ],
      }),
    );
    expect(result.operation).toBe(2);
    expect(result.closed).toBe(false);
    expect(result.repaidWei).toBe(repaidWei);
    expect(result.debtWei).toBe(remainingDebtWei);
  });

  it("verifies a full closeTrove repayment", async () => {
    const burnedWei = 2_200n * E18;
    const result = await verifyTroveRepaid(
      { txHash: HASH, owner: TO, expectedFrom: TO },
      troveClient({
        owner: TO,
        value: 0n,
        input: encodeFunctionData({ abi: borrowerOperationsAbi, functionName: "closeTrove" }),
        status: 2n,
        logs: [
          troveUpdatedLog({ owner: TO, principal: 0n, coll: 0n, operation: 1 }),
          transferLog({ from: TO, to: ZERO_ADDRESS, value: burnedWei }),
        ],
      }),
    );
    expect(result.closed).toBe(true);
    expect(result.debtWei).toBe(0n);
    expect(result.repaidWei).toBe(burnedWei);
  });

  it("rejects a repayment transaction with no MUSD burn", async () => {
    await expect(
      verifyTroveRepaid(
        { txHash: HASH, owner: TO },
        troveClient({
          owner: TO,
          value: 0n,
          input: repayMusdInput(500n * E18),
          status: 1n,
          logs: [
            troveUpdatedLog({
              owner: TO,
              principal: 1_700n * E18,
              coll: 100_000_000_000_000_000n,
              operation: 2,
            }),
          ],
        }),
      ),
    ).rejects.toThrow(/No MUSD repayment burn/);
  });

  it("rejects a repayment transaction that did not call BorrowerOperations repayment", async () => {
    await expect(
      verifyTroveRepaid(
        { txHash: HASH, owner: TO },
        troveClient({
          owner: TO,
          value: 0n,
          input: openTroveInput(2_000n * E18),
          status: 1n,
          logs: [transferLog({ from: TO, to: ZERO_ADDRESS, value: 1n })],
        }),
      ),
    ).rejects.toThrow(/repayMUSD or closeTrove/);
  });
});

describe("on-chain ledger bridge", () => {
  it("credits a verified MUSD deposit and keeps the hash chain valid", () => {
    const l = creditMusdDeposit(baseLedger(), ctx(), {
      memberId: "m1",
      amountMusd: 250,
      ref: ref(250n * E18),
    });
    expect(l.vault.musd).toBe(250);
    expect(l.members[0]?.contributedMusd).toBe(250);
    expect(l.activity[0]?.txHash).toBe(HASH);
    expect(verifyChain(l.activity).ok).toBe(true);
  });

  it("credits a verified BTC deposit", () => {
    const l = creditBtcDeposit(baseLedger(), ctx(), {
      memberId: "m1",
      amountBtc: 0.01,
      ref: ref(),
    });
    expect(l.vault.btc).toBeCloseTo(0.01);
    expect(l.members[0]?.contributedBtc).toBeCloseTo(0.01);
  });

  it("debits the treasury when a verified expense settlement is attached", () => {
    const expense: Expense = {
      id: "e1",
      memberId: "m1",
      category: "Groceries",
      merchant: "Test Mart",
      amount: 42,
      note: "",
      date: "2026-11-09T00:00:00Z",
      status: "approved",
      auto: true,
      approvals: [],
    };
    const start: Ledger = {
      ...baseLedger(),
      expenses: [expense],
      vault: { ...baseLedger().vault, musd: 100 },
    };
    const l = attachExpenseSettlement(start, ctx(), {
      expenseId: "e1",
      amountMusd: 42,
      ref: ref(42n * E18),
    });
    expect(l.expenses[0]?.onchain?.txHash).toBe(HASH);
    expect(l.expenses[0]?.merchantAddress).toBe(TO);
    expect(l.vault.musd).toBe(58);
    expect(verifyChain(l.activity).ok).toBe(true);
  });

  it("credits borrowed MUSD and locks collateral when a trove opens", () => {
    const opened = recordTroveOpen(baseLedger(), ctx(), {
      loanId: "l1",
      purpose: "Test trove",
      collateralBtc: 0.1,
      principalMusd: 2000,
      debtMusd: 2200,
      troveOwner: TO,
      ref: ref(2000n * E18),
    });
    expect(opened.loans[0]?.status).toBe("active");
    expect(opened.loans[0]?.troveOwner).toBe(TO.toLowerCase());
    expect(opened.vault.musd).toBe(2000);
    expect(opened.vault.btcLocked).toBeCloseTo(0.1);
    expect(verifyChain(opened.activity).ok).toBe(true);
  });

  it("debits repaid MUSD and unlocks collateral when the trove closes", () => {
    const opened = recordTroveOpen(baseLedger(), ctx(), {
      loanId: "l1",
      purpose: "Test trove",
      collateralBtc: 0.1,
      principalMusd: 2000,
      debtMusd: 2200,
      troveOwner: TO,
      ref: ref(2000n * E18),
    });
    const repaid = recordTroveRepay(opened, ctx(), {
      loanId: "l1",
      amountMusd: 2200,
      remainingDebtMusd: 0,
      ref: ref(2200n * E18),
    });
    expect(repaid.loans[0]?.status).toBe("repaid");
    expect(repaid.loans[0]?.debt).toBe(0);
    expect(repaid.vault.musd).toBe(0);
    expect(repaid.vault.btcLocked).toBe(0);
    expect(verifyChain(repaid.activity).ok).toBe(true);
  });

  it("records a verified treasury withdrawal to a member", () => {
    const start: Ledger = {
      ...baseLedger(),
      vault: { ...baseLedger().vault, btc: 1, musd: 100 },
    };
    const l = recordWithdrawal(start, ctx(), {
      memberId: "m1",
      recipientId: "m2",
      asset: "MUSD",
      amount: 40,
      ref: ref(40n * E18),
    });
    expect(l.vault.musd).toBe(60);
    expect(l.activity[0]?.kind).toBe("withdraw");
    expect(l.activity[0]?.txHash).toBe(HASH);
    expect(verifyChain(l.activity).ok).toBe(true);
  });

  it("never lets a verified withdrawal push a balance below zero", () => {
    const start: Ledger = { ...baseLedger(), vault: { ...baseLedger().vault, musd: 10 } };
    const l = recordWithdrawal(start, ctx(), {
      memberId: "m1",
      recipientId: "m2",
      asset: "MUSD",
      amount: 40,
      ref: ref(40n * E18),
    });
    expect(l.vault.musd).toBe(0);
  });
});

describe("live mode value rules", () => {
  it("refuses ledger-only deposits, withdrawals, borrowing and repayment", () => {
    const l = baseLedger();
    for (const action of [
      { type: "deposit", memberId: "m1", asset: "MUSD", amount: 10, to: "vault" },
      { type: "withdraw", memberId: "m1", asset: "MUSD", amount: 10, from: "vault" },
      { type: "openLoan", collateralBtc: 0.1, principal: 2000, purpose: "Test" },
      { type: "repayLoan", loanId: "l1", amount: 10 },
    ] as const) {
      const result = applyAction(l, action, ctx(true));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.message).toMatch(/Mezo|treasury|protocol/i);
    }
  });

  it("approves an instant expense without debiting the ledger", () => {
    const start: Ledger = { ...baseLedger(), vault: { ...baseLedger().vault, musd: 500 } };
    const result = applyAction(
      start,
      { type: "addExpense", category: "Groceries", merchant: "Test Mart", amount: 42, note: "" },
      ctx(true),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ledger.expenses[0]?.status).toBe("approved");
    expect(result.ledger.vault.musd).toBe(500);
    expect(result.message).toMatch(/settle/i);
  });

  it("records final approval without debiting until the on-chain payment", () => {
    const start: Ledger = { ...baseLedger(), vault: { ...baseLedger().vault, musd: 500 } };
    const requested = applyAction(
      start,
      { type: "addExpense", category: "Home", merchant: "Test Depot", amount: 150, note: "" },
      ctx(true),
    );
    expect(requested.ok).toBe(true);
    if (!requested.ok) return;
    const expenseId = requested.ledger.expenses[0]!.id;
    const approved = applyAction(
      requested.ledger,
      { type: "approveExpense", expenseId },
      { ...ctx(true), actorId: "m2" },
    );
    expect(approved.ok).toBe(true);
    if (!approved.ok) return;
    expect(approved.ledger.expenses[0]?.status).toBe("pending");
    expect(approved.ledger.vault.musd).toBe(500);

    const final = applyAction(
      approved.ledger,
      { type: "approveExpense", expenseId },
      { ...ctx(true), actorId: "m3" },
    );
    expect(final.ok).toBe(true);
    if (!final.ok) return;
    expect(final.ledger.expenses[0]?.status).toBe("approved");
    expect(final.ledger.vault.musd).toBe(500);
    expect(final.message).toMatch(/settle/i);
  });

  it("still pays instantly in demo mode", () => {
    const start: Ledger = { ...baseLedger(), vault: { ...baseLedger().vault, musd: 500 } };
    const result = applyAction(
      start,
      { type: "addExpense", category: "Groceries", merchant: "Test Mart", amount: 42, note: "" },
      ctx(false),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ledger.vault.musd).toBe(458);
  });
});
