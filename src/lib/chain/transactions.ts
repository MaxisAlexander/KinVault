// Browser-side Mezo Testnet writes. Every transaction is signed by the user's
// wallet; KinVault never holds a private key. The server independently verifies
// the resulting receipt before touching the family ledger.
import {
  createWalletClient,
  custom,
  parseUnits,
  type Address,
  type Hash,
  type TransactionReceipt,
} from "viem";

import { borrowerOperationsAbi, erc20Abi } from "./abis";
import { parseBtcAmount, parseTokenAmount } from "./amounts";
import {
  publicClient,
  readBtcPrice,
  readProtocolParams,
  readTrove,
  readTroveHints,
} from "./client";
import {
  MUSD,
  PROTOCOL,
  MEZO_TESTNET_CHAIN_ID,
  MEZO_TESTNET_HEX_CHAIN_ID,
  MEZO_TESTNET_RPC,
  MEZO_TESTNET_EXPLORER,
  ZERO_ADDRESS,
  mezoTestnet,
} from "./config";
import { planTrove } from "./protocol";

export type Eip1193Provider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, fn: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, fn: (...args: unknown[]) => void) => void;
};

export type TxResult = { hash: Hash; receipt: TransactionReceipt };

export function getInjectedProvider(): Eip1193Provider | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { ethereum?: Eip1193Provider }).ethereum ?? null;
}

export function chainParams() {
  return {
    chainId: MEZO_TESTNET_HEX_CHAIN_ID,
    chainName: "Mezo Testnet",
    nativeCurrency: { name: "Bitcoin", symbol: "BTC", decimals: 18 },
    rpcUrls: [MEZO_TESTNET_RPC],
    blockExplorerUrls: [MEZO_TESTNET_EXPLORER],
  };
}

/** Switches (or adds) Mezo Testnet before asking the wallet to sign. */
export async function ensureMezoTestnet(provider: Eip1193Provider): Promise<void> {
  const current = (await provider.request({ method: "eth_chainId" })) as string;
  if (parseInt(current, 16) === MEZO_TESTNET_CHAIN_ID) return;
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: MEZO_TESTNET_HEX_CHAIN_ID }],
    });
  } catch (error) {
    const code = (error as { code?: number }).code;
    if (code === 4902 || code === -32603) {
      await provider.request({ method: "wallet_addEthereumChain", params: [chainParams()] });
      return;
    }
    throw error;
  }
}

export async function requestAccount(provider: Eip1193Provider): Promise<Address> {
  const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
  const account = accounts[0];
  if (!account) throw new Error("No wallet account was returned");
  return account as Address;
}

function walletFor(provider: Eip1193Provider, account: Address) {
  return createWalletClient({
    chain: mezoTestnet,
    transport: custom(provider),
    account,
  });
}

export async function waitForSuccess(hash: Hash): Promise<TransactionReceipt> {
  const receipt = await publicClient.waitForTransactionReceipt({
    hash,
    confirmations: 1,
    timeout: 120_000,
  });
  if (receipt.status !== "success") throw new Error("The transaction reverted on Mezo Testnet");
  return receipt;
}

export async function sendMusd(params: {
  provider: Eip1193Provider;
  to: Address;
  amountMusd: string | number;
}): Promise<TxResult> {
  await ensureMezoTestnet(params.provider);
  const account = await requestAccount(params.provider);
  const value = parseTokenAmount(params.amountMusd, MUSD.decimals);
  if (value <= 0n) throw new Error("Amount must be greater than zero");
  const wallet = walletFor(params.provider, account);
  const hash = await wallet.writeContract({
    address: MUSD.address,
    abi: erc20Abi,
    functionName: "transfer",
    args: [params.to, value],
    account,
    chain: mezoTestnet,
  });
  const receipt = await waitForSuccess(hash);
  return { hash, receipt };
}

/** Native BTC transfer, used to fund a testnet treasury/trove wallet. */
export async function sendNativeBtc(params: {
  provider: Eip1193Provider;
  to: Address;
  amountBtc: string | number;
}): Promise<TxResult> {
  await ensureMezoTestnet(params.provider);
  const account = await requestAccount(params.provider);
  const value = parseBtcAmount(params.amountBtc);
  if (value <= 0n) throw new Error("Amount must be greater than zero");
  const wallet = walletFor(params.provider, account);
  const hash = await wallet.sendTransaction({ to: params.to, value, account, chain: mezoTestnet });
  const receipt = await waitForSuccess(hash);
  return { hash, receipt };
}

/**
 * Opens a real Mezo trove through BorrowerOperations. The BTC is native
 * testnet BTC; the borrowed MUSD is sent to the signing wallet by the protocol.
 */
export async function openTrove(params: {
  provider: Eip1193Provider;
  collateralBtc: string | number;
  borrowMusd: string | number;
  seed?: bigint;
}): Promise<TxResult & { plan: ReturnType<typeof planTrove> }> {
  await ensureMezoTestnet(params.provider);
  const account = await requestAccount(params.provider);
  const [price, protocol] = await Promise.all([readBtcPrice(), readProtocolParams()]);
  const plan = planTrove({
    collateralBtc: params.collateralBtc,
    borrowMusd: params.borrowMusd,
    priceUsd: price.usd,
    protocol,
  });
  if (!plan.valid) throw new Error(plan.errors[0] ?? "Invalid trove");
  const hints = await readTroveHints({
    collateralWei: plan.collateralWei,
    debtWei: plan.totalDebtWei,
    seed: params.seed,
  });
  const wallet = walletFor(params.provider, account);
  const hash = await wallet.writeContract({
    address: PROTOCOL.borrowerOperations,
    abi: borrowerOperationsAbi,
    functionName: "openTrove",
    args: [plan.borrowWei, hints.upperHint, hints.lowerHint],
    value: plan.collateralWei,
    account,
    chain: mezoTestnet,
  });
  const receipt = await waitForSuccess(hash);
  return { hash, receipt, plan };
}

/** Repays a trove. A full repayment closes it through `closeTrove()`. */
export async function repayTrove(params: {
  provider: Eip1193Provider;
  amountMusd: string | number;
}): Promise<TxResult> {
  await ensureMezoTestnet(params.provider);
  const account = await requestAccount(params.provider);
  const [protocol, trove] = await Promise.all([readProtocolParams(), readTrove(account)]);
  if (!trove.active) throw new Error("This wallet does not have an active Mezo trove");
  const requested = parseTokenAmount(params.amountMusd, MUSD.decimals);
  // The gas compensation is only returned by closeTrove(), so the largest
  // amount repayMUSD can burn is the debt minus that compensation.
  const repayable =
    trove.debtWei > protocol.gasCompensation ? trove.debtWei - protocol.gasCompensation : 0n;
  if (repayable <= 0n) throw new Error("This trove can only be closed");
  if (requested >= repayable) return closeTrove(params.provider);
  if (requested <= 0n) throw new Error("Amount must be greater than zero");

  // BorrowerOperations burns MUSD directly (it is on the token burn list), so
  // no ERC-20 approval transaction is needed.
  const wallet = walletFor(params.provider, account);
  const hints = await readTroveHints({
    collateralWei: trove.collateralWei,
    debtWei: trove.debtWei - requested,
  });
  const hash = await wallet.writeContract({
    address: PROTOCOL.borrowerOperations,
    abi: borrowerOperationsAbi,
    functionName: "repayMUSD",
    args: [requested, hints.upperHint, hints.lowerHint],
    account,
    chain: mezoTestnet,
  });
  const receipt = await waitForSuccess(hash);
  return { hash, receipt };
}

export async function closeTrove(provider: Eip1193Provider): Promise<TxResult> {
  await ensureMezoTestnet(provider);
  const account = await requestAccount(provider);
  const wallet = walletFor(provider, account);
  const hash = await wallet.writeContract({
    address: PROTOCOL.borrowerOperations,
    abi: borrowerOperationsAbi,
    functionName: "closeTrove",
    account,
    chain: mezoTestnet,
  });
  const receipt = await waitForSuccess(hash);
  return { hash, receipt };
}

/** Converts common wallet errors into a user-facing sentence. */
export function describeTxError(error: unknown): string {
  if (error instanceof Error) {
    if (/user rejected|denied|rejected the request/i.test(error.message))
      return "Transaction cancelled in your wallet";
    if (/insufficient funds/i.test(error.message))
      return "Not enough test BTC to pay gas on Mezo Testnet";
    if (/reverted/i.test(error.message)) return "The Mezo contract rejected that transaction";
    return error.message;
  }
  return "The Mezo transaction could not be completed";
}

export { parseUnits, ZERO_ADDRESS };
