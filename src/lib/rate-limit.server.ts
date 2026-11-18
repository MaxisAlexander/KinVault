// A tiny fixed-window rate limiter for the server functions that can be called
// cheaply but cost something real: invite-code probing, family creation and
// ledger writes.
//
// This is intentionally in-process. On Vercel every instance keeps its own
// window, so the effective limit scales with the number of warm instances. That
// is fine for a testnet buildathon: it stops a single client from hammering an
// endpoint, and it is honest about not being a distributed limiter. A
// production deployment would move this to Upstash/Redis behind the same
// function signature.
type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
const MAX_KEYS = 5_000;

/** Throws a short, user-facing error when `key` has used up its window. */
export function rateLimit(key: string, limit: number, windowMs: number): void {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    if (buckets.size > MAX_KEYS) {
      for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
    }
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }

  if (existing.count >= limit) {
    const seconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
    throw new Error(`Too many requests — try again in ${seconds}s`);
  }

  existing.count += 1;
}

/** Test helper: forget every window. */
export function resetRateLimits(): void {
  buckets.clear();
}
