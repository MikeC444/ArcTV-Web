import { beforeEach, describe, expect, it } from "vitest";
import { PROMO_SNOOZE_MS, promoDue, usePlusPromo } from "./plusPromo";

beforeEach(() => {
  localStorage.clear();
  usePlusPromo.getState().reset();
  usePlusPromo.setState({ shownThisSession: false });
  usePlusPromo.getState().hydrate("u1");
});

describe("ArcTV Plus popup rules", () => {
  it("is due for someone who has never answered it", () => {
    expect(promoDue(usePlusPromo.getState())).toBe(true);
  });
  it("is not shown twice in one visit", () => {
    usePlusPromo.getState().markShown();
    expect(promoDue(usePlusPromo.getState())).toBe(false);
  });
  it("Close snoozes it for a week, then it may come back (kept per account)", () => {
    usePlusPromo.getState().snooze(1_000);
    expect(promoDue(usePlusPromo.getState(), 1_000 + PROMO_SNOOZE_MS - 1)).toBe(false);
    expect(promoDue(usePlusPromo.getState(), 1_000 + PROMO_SNOOZE_MS)).toBe(true);
    usePlusPromo.getState().reset();
    usePlusPromo.getState().hydrate("u1");
    expect(usePlusPromo.getState().snoozedUntil).toBe(1_000 + PROMO_SNOOZE_MS);
    usePlusPromo.getState().hydrate("u2");
    expect(promoDue(usePlusPromo.getState(), 2_000)).toBe(true);
  });
  it("Don't show me again ends it for good", () => {
    usePlusPromo.getState().dismissForever();
    usePlusPromo.getState().reset();
    usePlusPromo.getState().hydrate("u1");
    expect(promoDue(usePlusPromo.getState(), Date.now() + 10 * PROMO_SNOOZE_MS)).toBe(false);
  });
});
