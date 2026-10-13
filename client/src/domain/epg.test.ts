import { describe, expect, it } from "vitest";
import { defaultGuideSource, formatRange, gridWidthPx, guideWindow, layoutRow, offsetPx, PX_PER_MINUTE, programmeAt, progressOf, timeTicks, type GuideProgramme } from "./epg";

const NOW_MS = Date.UTC(2026, 9, 12, 12, 20, 0); // 12:20 UTC
const p = (s: number, e: number, t = "x"): GuideProgramme => ({ s, e, t });
const win = guideWindow(NOW_MS);

describe("the guide's window", () => {
  it("starts on a half hour, an hour or so before now, and spans a day", () => {
    expect(win.from).toBe(Date.UTC(2026, 9, 12, 11, 0, 0) / 1000);
    expect(win.to - win.from).toBe(24 * 3600);
    expect(win.from % 1800).toBe(0);
    expect(gridWidthPx(win)).toBe(24 * 60 * PX_PER_MINUTE);
  });
  it("places a time by its minutes from the left edge, clamped to the window", () => {
    expect(offsetPx(win.from + 3600, win)).toBe(60 * PX_PER_MINUTE);
    expect(offsetPx(win.from - 999, win)).toBe(0);
    expect(offsetPx(win.to + 999, win)).toBe(gridWidthPx(win));
  });
  it("marks every half hour, with the hours standing out", () => {
    const ticks = timeTicks(win, "en-GB");
    expect(ticks).toHaveLength(48);
    expect(ticks[0]).toMatchObject({ left: 0, major: true });
    expect(ticks[1]!.major).toBe(false);
    expect(ticks[1]!.left).toBe(30 * PX_PER_MINUTE);
  });
});

describe("laying a row out", () => {
  it("sizes each programme by its length and clips the ones that spill over the edges", () => {
    const rows = layoutRow([p(win.from - 1800, win.from + 1800, "cut at the start"), p(win.from + 1800, win.from + 5400, "whole"), p(win.to - 600, win.to + 3600, "cut at the end"), p(win.to + 100, win.to + 200, "outside")], win);
    expect(rows.map((b) => b.programme.t)).toEqual(["cut at the start", "whole", "cut at the end"]);
    expect(rows[0]).toMatchObject({ left: 0, width: 30 * PX_PER_MINUTE });
    expect(rows[1]).toMatchObject({ left: 30 * PX_PER_MINUTE, width: 60 * PX_PER_MINUTE });
    expect(rows[2]!.left + rows[2]!.width).toBe(gridWidthPx(win));
  });
  it("never lets two programmes overlap, and tolerates them out of order", () => {
    const rows = layoutRow([p(win.from + 3600, win.from + 7200, "b"), p(win.from, win.from + 4200, "a")], win);
    expect(rows.map((b) => b.programme.t)).toEqual(["a", "b"]);
    expect(rows[1]!.left).toBe(rows[0]!.left + rows[0]!.width);
  });
  it("drops a programme that would have no width", () => {
    expect(layoutRow([p(win.from, win.from + 3600, "a"), p(win.from + 600, win.from + 3000, "inside a")], win)).toHaveLength(1);
  });
});

describe("what is on now", () => {
  const list = [p(100, 200, "one"), p(200, 300, "two")];
  it("finds the programme on at a moment, and how far through it is", () => {
    expect(programmeAt(list, 150)?.t).toBe("one");
    expect(programmeAt(list, 200)?.t).toBe("two");
    expect(programmeAt(list, 300)).toBeNull();
    expect(progressOf(list[0]!, 150)).toBe(0.5);
    expect(progressOf(list[0]!, 50)).toBe(0);
    expect(progressOf(list[0]!, 999)).toBe(1);
  });
  it("writes a time range", () => {
    expect(formatRange({ s: Date.UTC(2026, 9, 12, 20, 0) / 1000, e: Date.UTC(2026, 9, 12, 21, 30) / 1000 }, "en-GB")).toMatch(/–/);
  });
});

describe("the country to start on", () => {
  it("follows the browser's region, then its language", () => {
    expect(defaultGuideSource("en-GB")).toBe("UK1");
    expect(defaultGuideSource("en-US")).toBe("US2");
    expect(defaultGuideSource("de-AT")).toBe("AT1");
    expect(defaultGuideSource("fr")).toBe("FR1");
    expect(defaultGuideSource("xx-ZZ")).toBeNull();
    expect(defaultGuideSource(undefined)).toBeNull();
  });
});
