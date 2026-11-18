// KinVault's Mezo participation policy.
//
// Mezo's BorrowerOperations does not require MEZO. KinVault adds its own policy
// on top: a family treasury must hold at least 1 MEZO before it can borrow
// through KinVault. That gives the MEZO token a real function in the product —
// holding it is what unlocks the borrow flow — without pretending the protocol
// itself demands it. It is checked in the browser before the wallet is asked to
// sign, and again on the server before the ledger records the trove.

/** 1 MEZO, in wei. Deliberately symbolic: participation, not a paywall. */
export const MIN_MEZO_TREASURY_WEI = 10n ** 18n;

export function meetsMezoParticipation(balanceWei: bigint): boolean {
  return balanceWei >= MIN_MEZO_TREASURY_WEI;
}

/** How much more MEZO the treasury needs before it can borrow (0n when it can). */
export function mezoShortfallWei(balanceWei: bigint): bigint {
  return balanceWei >= MIN_MEZO_TREASURY_WEI ? 0n : MIN_MEZO_TREASURY_WEI - balanceWei;
}
