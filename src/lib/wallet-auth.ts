// Wallet sign-in rules (Sign-In with Ethereum, EIP-4361). Pure and browser-safe so both
// the sign-in dialog and the server use the same message format and checks.
import { getAddress } from "viem";
import { createSiweMessage, parseSiweMessage } from "viem/siwe";

/** How long a signed sign-in message stays valid. */
export const WALLET_SIGNIN_TTL_MS = 10 * 60 * 1000;
/** Allowed clock drift for messages issued slightly "in the future". */
export const WALLET_SIGNIN_SKEW_MS = 60 * 1000;

export const WALLET_SIGNIN_STATEMENT =
  "Sign in to KinVault, your family's Bitcoin and MUSD vault. This is free and does not send a transaction.";

/** Account email used for wallet-only accounts (the .invalid domain can never receive mail). */
export function walletAccountEmail(address: string) {
  return `${address.toLowerCase()}@wallet.kinvault.invalid`;
}

export function buildWalletSignInMessage(opts: {
  address: string;
  chainId: number;
  origin: string;
  nonce: string;
  issuedAt: Date;
}) {
  const url = new URL(opts.origin);
  return createSiweMessage({
    domain: url.host,
    address: getAddress(opts.address),
    statement: WALLET_SIGNIN_STATEMENT,
    uri: url.origin,
    version: "1",
    chainId: opts.chainId,
    nonce: opts.nonce,
    issuedAt: opts.issuedAt,
    expirationTime: new Date(opts.issuedAt.getTime() + WALLET_SIGNIN_TTL_MS),
  });
}

export type WalletSignInCheck =
  { ok: true; address: `0x${string}`; nonce: string } | { ok: false; reason: string };

/** Validates a sign-in message's fields against the site it was submitted to. */
export function checkWalletSignInMessage(
  message: string,
  opts: { origin: string; now: Date },
): WalletSignInCheck {
  let parsed;
  try {
    parsed = parseSiweMessage(message);
  } catch {
    return { ok: false, reason: "Unreadable sign-in message" };
  }
  if (!parsed.address || !parsed.nonce || !parsed.domain || !parsed.uri || !parsed.issuedAt) {
    return { ok: false, reason: "Sign-in message is incomplete" };
  }
  if (parsed.version !== "1") return { ok: false, reason: "Unsupported sign-in message version" };

  let site: URL;
  try {
    site = new URL(opts.origin);
  } catch {
    return { ok: false, reason: "Unknown site" };
  }
  if (parsed.domain !== site.host)
    return { ok: false, reason: "Message was signed for a different site" };
  if (new URL(parsed.uri).origin !== site.origin)
    return { ok: false, reason: "Message was signed for a different site" };

  const now = opts.now.getTime();
  const issued = parsed.issuedAt.getTime();
  if (issued > now + WALLET_SIGNIN_SKEW_MS)
    return { ok: false, reason: "Message is dated in the future" };
  if (now - issued > WALLET_SIGNIN_TTL_MS)
    return { ok: false, reason: "Sign-in request expired, please try again" };
  if (parsed.expirationTime && parsed.expirationTime.getTime() < now) {
    return { ok: false, reason: "Sign-in request expired, please try again" };
  }
  if (!/^[a-zA-Z0-9]{8,}$/.test(parsed.nonce)) return { ok: false, reason: "Invalid nonce" };

  return { ok: true, address: getAddress(parsed.address), nonce: parsed.nonce };
}
