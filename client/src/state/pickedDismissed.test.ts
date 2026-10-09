import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { activeRemovals, usePickedDismissed } from "./pickedDismissed";
import { profileKey } from "./profile";
import { readJson, writeJson } from "./persist";

const DAY = 24 * 60 * 60 * 1000;
const key = profileKey("u1", "main", "picked-dismissed");

describe("titles removed from Picked for you", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-10T12:00:00Z"));
    usePickedDismissed.getState().hydrate("u1", "main");
  });
  afterEach(() => vi.useRealTimers());

  it("keeps a removed title out, and it survives a refresh", () => {
    usePickedDismissed.getState().dismiss("tt1");
    expect(usePickedDismissed.getState().ids).toEqual(["tt1"]);
    usePickedDismissed.getState().reset();
    usePickedDismissed.getState().hydrate("u1", "main"); // a refresh
    expect(usePickedDismissed.getState().ids).toEqual(["tt1"]);
  });

  it("lets the title back after 5 days, and not a moment before", () => {
    usePickedDismissed.getState().dismiss("tt1");
    vi.setSystemTime(Date.now() + 5 * DAY - 60_000);
    usePickedDismissed.getState().hydrate("u1", "main");
    expect(usePickedDismissed.getState().ids).toEqual(["tt1"]);
    vi.setSystemTime(Date.now() + 2 * 60_000);
    usePickedDismissed.getState().hydrate("u1", "main");
    expect(usePickedDismissed.getState().ids).toEqual([]);
    expect(readJson(key, null)).toEqual({}); // the expired one is forgotten for good
  });

  it("removing it again after it came back starts a new 5 days", () => {
    usePickedDismissed.getState().dismiss("tt1");
    vi.setSystemTime(Date.now() + 6 * DAY);
    usePickedDismissed.getState().hydrate("u1", "main");
    usePickedDismissed.getState().dismiss("tt1");
    vi.setSystemTime(Date.now() + 4 * DAY);
    usePickedDismissed.getState().hydrate("u1", "main");
    expect(usePickedDismissed.getState().ids).toEqual(["tt1"]);
  });

  it("an older saved list of ids is kept, with its 5 days starting now", () => {
    expect(activeRemovals(["a", "b"], 1000)).toEqual({ a: 1000, b: 1000 });
    writeJson(key, ["tt9"]);
    usePickedDismissed.getState().hydrate("u1", "main");
    expect(usePickedDismissed.getState().ids).toEqual(["tt9"]);
  });
});
