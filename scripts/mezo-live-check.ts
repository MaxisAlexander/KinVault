/**
 * Read-only Mezo Testnet smoke test. Safe to run against the public RPC.
 *
 *   bun run test:live
 *
 * Set MEZO_TEST_ADDRESS=0x... to also print treasury/trove state.
 */
import { formatUnits } from "viem";

import {
  readBtcPrice,
  readChainStatus,
  readProtocolParams,
  readTokenMetadata,
  readTreasurySnapshot,
} from "../src/lib/chain/client";
import { MEZO_TESTNET_CHAIN_ID, MUSD, PROTOCOL, TOKENS } from "../src/lib/chain/config";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const status = await readChainStatus();
assert(
  status.chainId === MEZO_TESTNET_CHAIN_ID,
  `Expected chain ${MEZO_TESTNET_CHAIN_ID}, got ${status.chainId}`,
);
console.log(`chain: ${status.chainId}`);
console.log(`block: ${status.blockNumber}`);
console.log(`gas: ${formatUnits(status.gasPriceWei, 9)} gwei`);

const [musd, mezo, price, params] = await Promise.all([
  readTokenMetadata(MUSD.address),
  readTokenMetadata(TOKENS.MEZO.address),
  readBtcPrice(),
  readProtocolParams(),
]);
assert(musd.symbol === "MUSD", `Expected MUSD, got ${musd.symbol}`);
assert(musd.decimals === 18, `Expected 18 decimals, got ${musd.decimals}`);
assert(mezo.symbol === "MEZO", `Expected MEZO, got ${mezo.symbol}`);
assert(price.usd > 0, "Mezo PriceFeed returned a zero BTC price");
assert(params.mcr === 1_100_000_000_000_000_000n, "Unexpected MCR");
assert(params.gasCompensation === 200_000_000_000_000_000_000n, "Unexpected MUSD gas compensation");
assert(params.minNetDebt === 1_800_000_000_000_000_000_000n, "Unexpected minimum net debt");
assert(params.minNetDebtFloor === 50_000_000_000_000_000_000n, "Unexpected MIN_NET_DEBT_MIN");

console.log(`MUSD: ${musd.address} (${musd.decimals})`);
console.log(`MEZO: ${mezo.address} (${mezo.decimals})`);
console.log(`BTC/USD from Mezo PriceFeed: $${price.usd.toFixed(2)}`);
console.log(
  `MCR: ${Number(params.mcr) / 1e18}; gas compensation: ${formatUnits(params.gasCompensation, 18)} MUSD`,
);
console.log(`Minimum net debt: ${formatUnits(params.minNetDebt, 18)} MUSD`);
console.log(`BorrowerOperations: ${PROTOCOL.borrowerOperations}`);

const address = process.env["MEZO_TEST_ADDRESS"];
if (address) {
  const snapshot = await readTreasurySnapshot(address as `0x${string}`, price.raw);
  console.log(`treasury ${address}`);
  console.log(`  BTC: ${formatUnits(snapshot.nativeBtcWei, 18)}`);
  console.log(`  MUSD: ${formatUnits(snapshot.musdWei, 18)}`);
  console.log(`  MEZO: ${formatUnits(snapshot.mezoWei, 18)}`);
  console.log(
    `  trove: ${snapshot.trove.status} (${snapshot.trove.active ? "active" : "inactive"})`,
  );
}
console.log("mezo live check: ok");
