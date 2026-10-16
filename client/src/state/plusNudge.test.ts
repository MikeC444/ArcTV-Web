import { beforeEach, describe, expect, it } from "vitest";
import { NUDGE_GAP_MS, NUDGE_MAX_PER_TRIGGER, nudgeDue, usePlusNudge } from "./plusNudge";

const T0 = 1_700_000_000_000;

beforeEach(() => {
  localStorage.clear();
  usePlusNudge.getState().reset();
  usePlusNudge.getState().hydrate("u1");
});

describe("Plus nudge rules", () => {
  it("is due for someone who has never been nudged", () => {
    expect(nudgeDue(usePlusNudge.getState(), "watch-end", T0)).toBe(true);
  });
  it("waits a few days after any nudge", () => {
    usePlusNudge.getState().markShown("watch-end", T0);
    expect(nudgeDue(usePlusNudge.getState(), "watch-end", T0 + NUDGE_GAP_MS - 1)).toBe(false);
    expect(nudgeDue(usePlusNudge.getState(), "watch-end", T0 + NUDGE_GAP_MS)).toBe(true);
  });
  it("stops for good once a kind has been shown the maximum number of times", () => {
    let now = T0;
    for (let i = 0; i < NUDGE_MAX_PER_TRIGGER; i += 1) {
      expect(nudgeDue(usePlusNudge.getState(), "watch-end", now)).toBe(true);
      usePlusNudge.getState().markShown("watch-end", now);
      now += NUDGE_GAP_MS;
    }
    expect(nudgeDue(usePlusNudge.getState(), "watch-end", now + 365 * 86_400_000)).toBe(false);
  });
  it("is remembered per account and survives a restart", () => {
    usePlusNudge.getState().markShown("watch-end", T0);
    usePlusNudge.getState().reset();
    usePlusNudge.getState().hydrate("u1");
    expect(usePlusNudge.getState().lastShownAt).toBe(T0);
    usePlusNudge.getState().hydrate("u2");
    expect(nudgeDue(usePlusNudge.getState(), "watch-end", T0 + 1)).toBe(true);
  });
});
