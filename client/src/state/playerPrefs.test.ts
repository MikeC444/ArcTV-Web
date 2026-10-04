import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_PLAYER_PREFS, readPlayerPrefs, writePlayerPrefs } from "./playerPrefs";

beforeEach(() => localStorage.clear());

describe("player preferences", () => {
  it("start at the defaults and remember volume, speed and the time display", () => {
    expect(readPlayerPrefs()).toEqual(DEFAULT_PLAYER_PREFS);
    writePlayerPrefs({ volume: 0.4 });
    writePlayerPrefs({ speed: 1.5 });
    writePlayerPrefs({ showRemaining: false });
    expect(readPlayerPrefs()).toEqual({ volume: 0.4, speed: 1.5, showRemaining: false });
  });
  it("ignore values that make no sense", () => {
    localStorage.setItem("mtv:v1:playerPrefs", JSON.stringify({ volume: 7, speed: "fast", showRemaining: "yes" }));
    expect(readPlayerPrefs()).toEqual(DEFAULT_PLAYER_PREFS);
  });
});
