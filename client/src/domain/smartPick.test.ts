import { describe, expect, it } from "vitest";
import { detectDeviceCaps, type DeviceCaps } from "./deviceSupport";
import { smartPickingApplies, smartPickTarget } from "./smartPick";
import type { Stream } from "./types";

// A browser that plays H.264 / AAC in MP4 (and WebM) but no MKV, HEVC or Dolby audio.
const caps: DeviceCaps = detectDeviceCaps({
  canPlayType: (type) => (/avc1|mp4a|vp09|opus|mpeg/.test(type) || /^video\/(mp4|webm)/.test(type) ? "probably" : ""),
  hasMediaSource: true,
  userAgent: "Mozilla/5.0 Chrome/120",
});

const stream = (id: string, url: string, over: Partial<Stream> = {}): Stream =>
  ({ id, url, releaseTitle: id, providerLabel: "Addon", qualityBadge: "1080p", resolutionTier: "FHD_1080P", seeders: 10, ...over }) as unknown as Stream;

describe("smartPickTarget", () => {
  it("picks the recommended source when it surely plays here", () => {
    const streams = [stream("a", "https://x.test/a.1080p.h264.aac.mp4"), stream("b", "https://x.test/b.mkv")];
    expect(smartPickTarget(streams, "a", caps)?.id).toBe("a");
  });
  it("shows the list instead when there is no recommendation or it cannot play here", () => {
    expect(smartPickTarget([], null, caps)).toBeNull();
    expect(smartPickTarget([stream("a", "https://x.test/a.mp4")], "zzz", caps)).toBeNull();
    expect(smartPickTarget([stream("t", "", { infoHash: "abc" })], "t", caps)).toBeNull();
  });
});

describe("smartPickingApplies", () => {
  it("needs Plus and the switch, and steps aside for Back and for Choose a different source", () => {
    expect(smartPickingApplies({ plus: true, enabled: true, cameBack: false, skip: false })).toBe(true);
    expect(smartPickingApplies({ plus: false, enabled: true, cameBack: false, skip: false })).toBe(false);
    expect(smartPickingApplies({ plus: true, enabled: false, cameBack: false, skip: false })).toBe(false);
    expect(smartPickingApplies({ plus: true, enabled: true, cameBack: true, skip: false })).toBe(false);
    expect(smartPickingApplies({ plus: true, enabled: true, cameBack: false, skip: true })).toBe(false);
  });
});
