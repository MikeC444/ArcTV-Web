import { describe, expect, it } from "vitest";
import { offerNextEpisode, shouldOfferResume } from "./progress";

describe("next episode offer", () => {
  it("shows for the last minute of an episode that has a next one, and after it ends", () => {
    expect(offerNextEpisode(2400, 2700, true)).toBe(false); // 5 minutes left
    expect(offerNextEpisode(2640, 2700, true)).toBe(true); // 60 seconds left
    expect(offerNextEpisode(2700, 2700, true)).toBe(true); // ended
  });
  it("never shows without a next episode or before playback has a length and a position", () => {
    expect(offerNextEpisode(2690, 2700, false)).toBe(false);
    expect(offerNextEpisode(0, 0, true)).toBe(false);
    expect(offerNextEpisode(0, 30, true)).toBe(false); // a very short clip not yet started
  });
});

describe("resume offer", () => {
  it("is made for a saved position well before the end", () => {
    expect(shouldOfferResume(32 * 60_000 + 10_000, 6000)).toBe(true);
  });
  it("is not made for nothing saved, or a position within 10 seconds of the end", () => {
    expect(shouldOfferResume(null, 6000)).toBe(false);
    expect(shouldOfferResume(0, 6000)).toBe(false);
    expect(shouldOfferResume(5995_000, 6000)).toBe(false);
    expect(shouldOfferResume(1000, Number.NaN)).toBe(false);
  });
});
