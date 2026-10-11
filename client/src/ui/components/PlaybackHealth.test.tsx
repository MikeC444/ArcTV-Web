import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { formatStart, leftEarly, percent, standsOut, type PlaybackSummary } from "../../lib/playbackHealth";
import { PlaybackHealth } from "./PlaybackHealth";

const data: PlaybackSummary = {
  plays7d: 100,
  users7d: 40,
  short7d: 30,
  errors7d: 10,
  neverStarted7d: 5,
  medianStartMs: 2400,
  multiSource7d: 35,
  byDevice: [
    { label: "AFTMM", plays: 20, short: 9, errors: 4, neverStarted: 2 },
    { label: "Pixel 8", plays: 50, short: 8, errors: 1, neverStarted: 0 },
  ],
  byEngine: [{ label: "vlc", plays: 70, short: 20, errors: 5, neverStarted: 3 }, { label: "builtin", plays: 30, short: 10, errors: 5, neverStarted: 2 }],
  byResolution: [{ label: "4K", plays: 40, short: 18, errors: 7, neverStarted: 2 }],
};

describe("playback health numbers", () => {
  it("counts every way of leaving early and turns it into a percent", () => {
    expect(leftEarly(data.byDevice[0]!)).toBe(15);
    expect(percent(15, 20)).toBe(75);
    expect(percent(1, 0)).toBe(0);
  });
  it("writes the time to picture plainly", () => {
    expect(formatStart(2400)).toBe("2.4 s");
    expect(formatStart(850)).toBe("850 ms");
    expect(formatStart(null)).toBe("—");
  });
  it("flags a group with enough viewings and clearly more early exits than overall", () => {
    expect(standsOut(data.byDevice[0]!, data)).toBe(true); // 75% against 45% overall, 20 viewings
    expect(standsOut(data.byDevice[1]!, data)).toBe(false); // 18%
    expect(standsOut({ label: "x", plays: 4, short: 4, errors: 0, neverStarted: 0 }, data)).toBe(false); // too few to mean anything
  });
});

describe("PlaybackHealth", () => {
  it("shows the totals, the rate of early exits and the splits", () => {
    render(<PlaybackHealth data={data} />);
    expect(screen.getByText("45%")).toBeInTheDocument();
    expect(screen.getByText("2.4 s")).toBeInTheDocument();
    expect(screen.getByText("AFTMM")).toBeInTheDocument();
    expect(screen.getByText("Built-in player")).toBeInTheDocument();
    expect(screen.getByText("4K")).toBeInTheDocument();
  });
  it("says when nothing has been reported yet", () => {
    render(<PlaybackHealth data={{ ...data, plays7d: 0, byDevice: [], byEngine: [], byResolution: [] }} />);
    expect(screen.getByText(/No reports yet/)).toBeInTheDocument();
  });
});
