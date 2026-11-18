import { beforeEach, describe, expect, it, vi } from "vitest";

import { rateLimit, resetRateLimits } from "./rate-limit.server";

beforeEach(() => {
  resetRateLimits();
  vi.useRealTimers();
});

describe("rateLimit", () => {
  it("allows requests up to the limit and rejects the next one", () => {
    for (let i = 0; i < 3; i++) expect(() => rateLimit("k", 3, 1_000)).not.toThrow();
    expect(() => rateLimit("k", 3, 1_000)).toThrow(/Too many requests/);
  });

  it("keeps separate counters per key", () => {
    rateLimit("a", 1, 1_000);
    expect(() => rateLimit("b", 1, 1_000)).not.toThrow();
    expect(() => rateLimit("a", 1, 1_000)).toThrow(/Too many requests/);
  });

  it("reports how long to wait", () => {
    rateLimit("k", 1, 5_000);
    expect(() => rateLimit("k", 1, 5_000)).toThrow(/try again in [1-5]s/);
  });

  it("opens a fresh window once the old one expires", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-18T00:00:00Z"));
    rateLimit("k", 1, 1_000);
    expect(() => rateLimit("k", 1, 1_000)).toThrow();

    vi.setSystemTime(new Date("2026-11-18T00:00:02Z"));
    expect(() => rateLimit("k", 1, 1_000)).not.toThrow();
  });
});
