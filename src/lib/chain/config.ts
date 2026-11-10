// Mezo Testnet is the only chain KinVault supports. There is deliberately no
// mainnet configuration here: the product is built for the Buildathon testnet
// and every read/write must be verifiable on chain 31611.
import { defineChain } from "viem";

export const MEZO_TESTNET_CHAIN_ID = 31611;
export const MEZO_TESTNET_HEX_CHAIN_ID = "0x7b7b";
export const MEZO_TESTNET_RPC = "https://rpc.test.mezo.org";
export const MEZO_TESTNET_WSS = "wss://rpc-ws.test.mezo.org";
export const MEZO_TESTNET_EXPLORER = "https://explorer.test.mezo.org";
export const MEZO_TESTNET_FAUCET = "https://faucet.test.mezo.org/";
export const MEZO_TESTNET_DAPP = "https://testnet.mezo.org";

export const mezoTestnet = defineChain({
  id: MEZO_TESTNET_CHAIN_ID,
  name: "Mezo Testnet",
  nativeCurrency: { name: "Bitcoin", symbol: "BTC", decimals: 18 },
  rpcUrls: {
    default: {
      http: [MEZO_TESTNET_RPC],
      webSocket: [MEZO_TESTNET_WSS],
    },
  },
  blockExplorers: {
    default: { name: "Mezo Testnet Explorer", url: MEZO_TESTNET_EXPLORER },
  },
  testnet: true,
});

/** Canonical testnet token addresses. Verified against chain 31611. */
export const TOKENS = {
  MUSD: {
    address: "0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503",
    name: "Mezo USD",
    symbol: "MUSD",
    decimals: 18,
  },
  MEZO: {
    address: "0x7B7c000000000000000000000000000000000001",
    name: "MEZO",
    symbol: "MEZO",
    decimals: 18,
  },
  /** ERC-20 representation of bridged BTC on Mezo (native BTC is the gas asset). */
  BTC: {
    address: "0x7b7C000000000000000000000000000000000000",
    name: "Bitcoin",
    symbol: "BTC",
    decimals: 18,
  },
} as const;

/** MUSD is the canonical Buildathon asset and the family payment rail. */
export const MUSD = TOKENS.MUSD;

/** Mezo MUSD protocol contracts, deployed on testnet (chain 31611). */
export const PROTOCOL = {
  borrowerOperations: "0xCdF7028ceAB81fA0C6971208e83fa7872994beE5",
  troveManager: "0xE47c80e8c23f6B4A1aE41c34837a0599D5D16bb0",
  priceFeed: "0x86bCF0841622a5dAC14A313a15f96A95421b9366",
  hintHelpers: "0x4e4cBA3779d56386ED43631b4dCD6d8EacEcBCF6",
  sortedTroves: "0x722E4D24FD6Ff8b0AC679450F3D91294607268fA",
  musd: MUSD.address,
} as const;

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

/** A transaction is only accepted once it is mined and has this many confirmations. */
export const REQUIRED_CONFIRMATIONS = 1;

/**
 * Fallbacks used only when the Mezo RPC cannot return the protocol constants.
 * The live values are always read from BorrowerOperations (`minNetDebt()` and
 * `MUSD_GAS_COMPENSATION()`); these keep the UI honest during an RPC outage.
 * On testnet both values are 1,800 MUSD and 200 MUSD respectively.
 */
export const MEZO_MIN_NET_DEBT_FALLBACK = 1_800n * 10n ** 18n;
export const MEZO_GAS_COMPENSATION_FALLBACK = 200n * 10n ** 18n;

/**
 * Demo merchant used when a family does not supply a recipient. It is a
 * deliberately burned address, so a test payment is visibly real but never
 * withdrawable by anyone.
 */
export const DEMO_MERCHANT_ADDRESS = "0x000000000000000000000000000000000000dEaD" as const;

export function explorerTxUrl(hash: string): string {
  return `${MEZO_TESTNET_EXPLORER}/tx/${hash}`;
}

export function explorerAddressUrl(address: string): string {
  return `${MEZO_TESTNET_EXPLORER}/address/${address}`;
}

export function explorerBlockUrl(block: number): string {
  return `${MEZO_TESTNET_EXPLORER}/block/${block}`;
}

export function explorerTokenUrl(address: string): string {
  return `${MEZO_TESTNET_EXPLORER}/token/${address}`;
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
