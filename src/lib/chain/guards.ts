/**
 * Small, testable guards for value-moving server functions.
 *
 * A deposit is only a deposit if value actually arrives. When the sending wallet
 * and the family treasury are the same address, the transaction succeeds on
 * Mezo but the balance does not change — crediting the ledger would invent money.
 * Withdrawals already refuse to pay the treasury itself; deposits must refuse to
 * come from it.
 */

export function sameAddress(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return a.toLowerCase() === b.toLowerCase();
}

/** Throws when a transfer would be from an address to itself. */
export function assertNotSelfTransfer(from: string, to: string, message: string): void {
  if (sameAddress(from, to)) throw new Error(message);
}
