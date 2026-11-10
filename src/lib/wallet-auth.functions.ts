import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";

import { checkWalletSignInMessage, walletAccountEmail } from "./wallet-auth";

const inputSchema = z.object({
  message: z.string().min(50).max(2000),
  signature: z
    .string()
    .regex(/^0x[0-9a-fA-F]+$/)
    .max(1000),
});

/**
 * Sign-In with Ethereum. Verifies the wallet signature, records the nonce (single use),
 * finds or creates the wallet's account and returns a one-time token the browser
 * exchanges for a normal session.
 */
export const walletSignIn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data }) => {
    const origin = getRequestHeader("origin");
    if (!origin) throw new Error("Missing origin");

    const check = checkWalletSignInMessage(data.message, { origin, now: new Date() });
    if (!check.ok) throw new Error(check.reason);

    const { recoverMessageAddress, getAddress } = await import("viem");
    let signer: string;
    try {
      signer = await recoverMessageAddress({
        message: data.message,
        signature: data.signature as `0x${string}`,
      });
    } catch {
      throw new Error("Signature could not be verified");
    }
    if (getAddress(signer) !== check.address)
      throw new Error("Signature does not match this wallet");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Single-use nonce: a replayed signature fails on the primary key.
    const { error: nonceErr } = await supabaseAdmin
      .from("wallet_login_nonces")
      .insert({ nonce: check.nonce, address: check.address.toLowerCase() });
    if (nonceErr) {
      if (nonceErr.code === "23505")
        throw new Error("This sign-in request was already used, please try again");
      throw new Error("Could not start a wallet session");
    }
    void supabaseAdmin
      .from("wallet_login_nonces")
      .delete()
      .lt("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    const email = walletAccountEmail(check.address);
    const short = `${check.address.slice(0, 6)}…${check.address.slice(-4)}`;
    const { error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      email_confirm: true,
      app_metadata: { wallet_address: check.address.toLowerCase(), sign_in_method: "wallet" },
      user_metadata: { display_name: short, wallet_address: check.address },
    });
    if (createErr && createErr.code !== "email_exists" && !/already/i.test(createErr.message)) {
      throw new Error("Could not create your wallet account");
    }

    const { data: link, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    if (linkErr || !link.properties?.hashed_token)
      throw new Error("Could not start a wallet session");

    // Only hand out a session for accounts the server itself created for this wallet.
    const owner = (link.user.app_metadata as { wallet_address?: string } | undefined)
      ?.wallet_address;
    if (owner !== check.address.toLowerCase())
      throw new Error("This wallet can't be used to sign in here");

    return { tokenHash: link.properties.hashed_token, address: check.address };
  });
