// Tamper-evident ledger: every activity entry carries the SHA-256 of its own
// content plus the previous entry's hash, so editing any past entry breaks the chain.
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

export const GENESIS_HASH = `0x${"0".repeat(64)}`;

export type ChainFields = {
  hash: string;
  prevHash: string;
  /** Mezo block height observed when the entry was recorded (reference only). */
  block: number | null;
};

type Hashable = {
  id: string;
  ts: string;
  memberId: string;
  kind: string;
  text: string;
  amount?: number | undefined;
  asset?: string | undefined;
  direction?: string | undefined;
  txHash?: string | undefined;
  prevHash: string;
  block: number | null;
};

function canonical(e: Hashable): string {
  const fields = [
    e.id,
    e.ts,
    e.memberId,
    e.kind,
    e.text,
    e.amount ?? null,
    e.asset ?? null,
    e.direction ?? null,
    e.prevHash,
    e.block,
  ];
  // Backwards compatible: ledger entries written before on-chain support keep
  // their original hash. Entries with a txHash commit to it, so removing the
  // hash changes the canonical form and breaks verification.
  if (e.txHash) fields.push(e.txHash);
  return JSON.stringify(fields);
}

export function hashEntry(e: Hashable): string {
  return `0x${bytesToHex(sha256(utf8ToBytes(canonical(e))))}`;
}

export type ChainCheck = { ok: boolean; checked: number; brokenAt: string | null };

/**
 * Verify a newest-first list of entries: every hash must match its content and
 * every entry must point at the hash of the one recorded before it.
 */
export function verifyChain(entries: (Hashable & { hash: string })[]): ChainCheck {
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]!;
    if (hashEntry(e) !== e.hash) return { ok: false, checked: i, brokenAt: e.id };
    const older = entries[i + 1];
    if (older && e.prevHash !== older.hash) return { ok: false, checked: i, brokenAt: e.id };
  }
  return { ok: true, checked: entries.length, brokenAt: null };
}

/** Seal a newest-first list that has no hashes yet (used for seed data). */
export function sealEntries<T extends Omit<Hashable, "prevHash" | "block">>(
  entries: T[],
  block: number | null = null,
): (T & ChainFields)[] {
  const out: (T & ChainFields)[] = [];
  let prev = GENESIS_HASH;
  for (let i = entries.length - 1; i >= 0; i--) {
    const base = { ...entries[i]!, prevHash: prev, block };
    const hash = hashEntry(base);
    out.unshift({ ...base, hash });
    prev = hash;
  }
  return out;
}

/** Short display form, e.g. 0x3fa2…91c0 */
export function shortHash(h: string): string {
  return h.length > 14 ? `${h.slice(0, 6)}…${h.slice(-4)}` : h;
}
