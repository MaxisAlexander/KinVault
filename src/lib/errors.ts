/**
 * Every user-facing error toast goes through here.
 *
 * Wallet, RPC and server errors are long and technical ("Transaction receipt with
 * hash 0x36e4... could not be found. The Transaction may not be processed on a
 * block yet."). The person using the app gets one short sentence instead, and the
 * untouched error stays in the console for whoever is debugging.
 */

import { toast } from "sonner";

export type FriendlyError = { title: string; description?: string };

type Rule = { match: RegExp; title: string; description?: string };

const RULES: Rule[] = [
  {
    match: /TransactionReceiptNotFoundError|receipt with hash|could not be found/i,
    title: "Still confirming on Mezo",
    description: "The transaction is mined but not indexed yet. Check the explorer in a moment.",
  },
  {
    match: /user rejected|user denied|rejected the request|action_rejected|\b4001\b/i,
    title: "Cancelled in your wallet",
    description: "Nothing was sent and the ledger is unchanged.",
  },
  {
    match: /insufficient funds|exceeds balance|insufficient balance|exceeds the balance/i,
    title: "Not enough test assets",
    description: "Top up from the Mezo faucet and try again.",
  },
  {
    match: /revert|execution reverted|status !== "success"/i,
    title: "The transaction failed on Mezo",
    description: "The ledger was not changed.",
  },
  {
    match: /failed to fetch|fetch failed|network ?error|econnreset|etimedout|timed out|timeout/i,
    title: "Couldn't reach Mezo Testnet",
    description: "Check your connection and try again.",
  },
  {
    match: /no browser wallet|connect a browser wallet|wallet not (found|installed)/i,
    title: "No wallet found",
    description: "Install a browser wallet such as MetaMask to sign on Mezo Testnet.",
  },
  {
    match: /invalid login credentials/i,
    title: "Wrong email or password",
    description: "Check them and try again, or reset your password.",
  },
  {
    match: /email not confirmed/i,
    title: "Confirm your email first",
    description: "Open the link we sent you, then sign in.",
  },
  {
    match: /rate limit|too many requests|email rate limit/i,
    title: "Too many attempts",
    description: "Wait a minute before trying again.",
  },
  {
    match: /already (belongs? to|in) a family/i,
    title: "You're already in a family vault",
    description: "Leave that one before creating another.",
  },
  {
    match: /invite code/i,
    title: "That invite code didn't work",
    description: "It may have been used already, or replaced by the admin.",
  },
];

/** Strip the noise a server function or library adds before we show any of it. */
function rawMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const maybe = error as { message?: unknown; shortMessage?: unknown };
    if (typeof maybe.shortMessage === "string") return maybe.shortMessage;
    if (typeof maybe.message === "string") return maybe.message;
  }
  return "";
}

/** Server functions can serialise validation results, e.g. `[{"message":"..."}]`. */
function unwrap(message: string): string {
  const trimmed = message.trim();
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      const first = Array.isArray(parsed) ? parsed[0] : parsed;
      const inner = (first as { message?: unknown } | undefined)?.message;
      if (typeof inner === "string" && inner.trim()) return inner;
    } catch {
      /* not JSON, use it as-is */
    }
  }
  return message;
}

/** First line, no stack, no `Error:` prefix, capped at a readable length. */
function shorten(message: string, max = 110): string {
  const line = message
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  if (!line) return "";
  const clean = line
    .replace(/^error:\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > 40 ? cut.slice(0, space) : cut).replace(/[.,;:]$/, "")}…`;
}

/**
 * Turn anything thrown into a two-line toast. `fallback` is used when the error
 * carries no message at all.
 */
export function friendlyError(error: unknown, fallback = "Something went wrong"): FriendlyError {
  const message = unwrap(rawMessage(error));
  // Keep the full detail available for debugging without showing it to the user.
  console.error("[KinVault]", error);

  // EIP-1193 rejection. Wallets word this differently, the code is the reliable part.
  if (typeof error === "object" && error !== null && (error as { code?: unknown }).code === 4001) {
    return {
      title: "Cancelled in your wallet",
      description: "Nothing was sent and the ledger is unchanged.",
    };
  }

  for (const rule of RULES) {
    if (!rule.match.test(message)) continue;
    return rule.description
      ? { title: rule.title, description: rule.description }
      : { title: rule.title };
  }

  const short = shorten(message);
  return { title: short || fallback };
}

/** Convenience for `catch` blocks: short toast, full error in the console. */
export function errorToast(
  error: unknown,
  fallback = "Something went wrong",
): { title: string; description?: string } {
  return friendlyError(error, fallback);
}

/** Short error toast. Use this in every `catch` that talks to the user. */
export function toastError(error: unknown, fallback?: string) {
  const { title, description } = friendlyError(error, fallback);
  toast.error(title, description ? { description } : undefined);
}
