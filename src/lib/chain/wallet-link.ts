import { getAddress } from "viem";

/** Message format accepted by the `linkWallet` server function. */
export function buildWalletLinkMessage(params: {
  memberId: string;
  address: string;
  issuedAt: Date;
}): string {
  return [
    "KinVault wallet link",
    `Member: ${params.memberId}`,
    `Address: ${getAddress(params.address)}`,
    `Issued: ${params.issuedAt.toISOString()}`,
  ].join("\n");
}
