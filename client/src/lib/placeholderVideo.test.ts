import { describe, expect, it } from "vitest";
import { isPlaceholderVideo } from "./placeholderVideo";

describe("isPlaceholderVideo", () => {
  it("a few seconds for a 47 minute episode is a placeholder", () => {
    expect(isPlaceholderVideo(9, 47)).toBe(true);
    expect(isPlaceholderVideo(90, 120)).toBe(true);
  });
  it("a real file is not", () => {
    expect(isPlaceholderVideo(47 * 60, 47)).toBe(false);
    expect(isPlaceholderVideo(40 * 60, 47)).toBe(false);
  });
  it("nothing is assumed without a known runtime, for a genuinely short title or before the length is known", () => {
    expect(isPlaceholderVideo(9, null)).toBe(false);
    expect(isPlaceholderVideo(9, undefined)).toBe(false);
    expect(isPlaceholderVideo(9, 8)).toBe(false);
    expect(isPlaceholderVideo(0, 47)).toBe(false);
    expect(isPlaceholderVideo(Number.NaN, 47)).toBe(false);
    expect(isPlaceholderVideo(Number.POSITIVE_INFINITY, 47)).toBe(false);
  });
  it("must be both under two minutes and under a tenth of the runtime", () => {
    expect(isPlaceholderVideo(130, 600)).toBe(false);
    expect(isPlaceholderVideo(70, 11)).toBe(false);
    expect(isPlaceholderVideo(60, 11)).toBe(true);
  });
});
