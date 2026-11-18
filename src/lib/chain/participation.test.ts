import { describe, expect, it } from "vitest";

import { MIN_MEZO_TREASURY_WEI, meetsMezoParticipation, mezoShortfallWei } from "./participation";

const MEZO = 10n ** 18n;

describe("Mezo participation policy", () => {
  it("sets the treasury threshold at exactly 1 MEZO", () => {
    expect(MIN_MEZO_TREASURY_WEI).toBe(MEZO);
  });

  it("allows a treasury holding 1 MEZO or more", () => {
    expect(meetsMezoParticipation(MEZO)).toBe(true);
    expect(meetsMezoParticipation(200n * MEZO)).toBe(true);
  });

  it("blocks a treasury holding less than 1 MEZO", () => {
    expect(meetsMezoParticipation(0n)).toBe(false);
    expect(meetsMezoParticipation(MEZO - 1n)).toBe(false);
  });

  it("reports the shortfall in wei", () => {
    expect(mezoShortfallWei(0n)).toBe(MEZO);
    expect(mezoShortfallWei(MEZO / 2n)).toBe(MEZO / 2n);
    expect(mezoShortfallWei(5n * MEZO)).toBe(0n);
  });
});
