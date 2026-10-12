import { describe, expect, it } from "vitest";
import type { AdminSummary } from "../state/admin";
import { attentionAlerts, donutSlices, isOldVersion, platformName, sparkPath, versionsByPlatform, weekOverWeek } from "./dash";

const base = (over: Partial<AdminSummary> = {}): AdminSummary => ({ users: 100, newLast7Days: 5, activeLast7Days: 40, plus: { monthly: 0, yearly: 0, lifetime: 0 }, versions: [], ...over });
const group = (label: string, plays: number, early: number) => ({ label, plays, short: early, errors: 0, neverStarted: 0 });
const playback = (over: Partial<NonNullable<AdminSummary["playback"]>> = {}): NonNullable<AdminSummary["playback"]> => ({ plays7d: 100, users7d: 20, short7d: 5, errors7d: 0, neverStarted7d: 0, medianStartMs: 2000, multiSource7d: 5, byDevice: [], byEngine: [], byResolution: [], ...over });

describe("versionsByPlatform", () => {
  const versions = [
    { version: "0.5.1", platform: "fire_tv", devices: 3 },
    { version: "0.5.0", platform: "fire_tv", devices: 5 },
    { version: "0.1.8", platform: "fire_tv", devices: 10 },
    { version: "0.5.0", platform: "android_mobile", devices: 2 },
    { version: "web", platform: "web", devices: 9 },
  ];
  it("compares each app with its own newest version", () => {
    const p = versionsByPlatform(versions);
    const fire = p.find((x) => x.platform === "fire_tv")!;
    expect(fire.newest).toBe("0.5.1");
    expect(fire.behind).toBe(15);
    const phone = p.find((x) => x.platform === "android_mobile")!;
    expect(phone.newest).toBe("0.5.0");
    expect(phone.behind).toBe(0);
  });
  it("the web app has no version to be behind", () => {
    const web = versionsByPlatform(versions).find((x) => x.platform === "web")!;
    expect(web.newest).toBeNull();
    expect(web.behind).toBe(0);
  });
  it("lists the biggest app first and flags old versions", () => {
    const p = versionsByPlatform(versions);
    expect(p[0]!.platform).toBe("fire_tv");
    expect(isOldVersion(p, "fire_tv", "0.1.8")).toBe(true);
    expect(isOldVersion(p, "fire_tv", "0.5.1")).toBe(false);
    expect(isOldVersion(p, "web", "web")).toBe(false);
  });
});

describe("attentionAlerts", () => {
  it("says nothing needs attention when nothing is wrong", () => {
    const a = attentionAlerts(base({ playback: playback() }));
    expect(a).toHaveLength(1);
    expect(a[0]!.level).toBe("ok");
    expect(a[0]!.detail).toContain("5%");
  });
  it("raises a red alert when many viewings end early, and it is gone when they do not", () => {
    const bad = attentionAlerts(base({ playback: playback({ short7d: 30, errors7d: 15 }) }));
    expect(bad[0]!.level).toBe("bad");
    expect(bad[0]!.title).toContain("45%");
    expect(attentionAlerts(base({ playback: playback({ short7d: 10 }) })).every((x) => x.level === "ok")).toBe(true);
  });
  it("flags a device that people leave more than the rest", () => {
    const a = attentionAlerts(base({ playback: playback({ byDevice: [group("Mi Box", 20, 12), group("Pixel", 50, 2)] }) }));
    expect(a.map((x) => x.title)).toContain("Device Mi Box: people leave early");
    expect(a.map((x) => x.title)).not.toContain("Device Pixel: people leave early");
  });
  it("flags old versions only when a fifth of devices are behind", () => {
    const some = attentionAlerts(base({ versions: [{ version: "0.5.1", platform: "fire_tv", devices: 90 }, { version: "0.5.0", platform: "fire_tv", devices: 5 }] }));
    expect(some.every((x) => x.level === "ok")).toBe(true);
    const many = attentionAlerts(base({ versions: [{ version: "0.5.1", platform: "fire_tv", devices: 6 }, { version: "0.1.8", platform: "fire_tv", devices: 4 }] }));
    expect(many[0]!.id).toBe("old-versions");
    expect(many[0]!.detail).toContain("Fire TV");
  });
  it("flags a sign-up spike against the usual day", () => {
    const quiet = Array.from({ length: 20 }, (_, i) => ({ date: `2026-09-${String(i + 1).padStart(2, "0")}`, newUsers: 1, total: i + 1 }));
    const spike = [...quiet, { date: "2026-09-21", newUsers: 9, total: 30 }];
    expect(attentionAlerts(base({ userGrowth: spike })).some((x) => x.id === "signup-spike")).toBe(true);
    expect(attentionAlerts(base({ userGrowth: quiet })).some((x) => x.id === "signup-spike")).toBe(false);
  });
  it("lists the worst first", () => {
    const a = attentionAlerts(base({ playback: playback({ short7d: 60 }), versions: [{ version: "0.5.1", platform: "fire_tv", devices: 1 }, { version: "0.1.8", platform: "fire_tv", devices: 9 }] }));
    expect(a.map((x) => x.level)).toEqual(["bad", "warn"]);
  });
  it("counts people with an addon that returns nothing", () => {
    const addons = { usersWithAddons: 10, usersWithDebrid: 2, flaggedUsers: 3, hosts: [], debrid: [] };
    expect(attentionAlerts(base({ addons })).some((x) => x.id === "addons-empty")).toBe(true);
  });
});

describe("chart helpers", () => {
  it("names platforms", () => {
    expect(platformName("fire_tv")).toBe("Fire TV");
    expect(platformName("android_mobile")).toBe("Phone");
  });
  it("draws a sparkline from low to high", () => {
    expect(sparkPath([1, 2, 3], 100, 10)).toBe("M0.0 10.0 L50.0 5.0 L100.0 0.0");
    expect(sparkPath([5], 100, 10)).toBe("M0 5 L100 5");
  });
  it("splits a donut into arcs that add to one circle, biggest first", () => {
    const s = donutSlices([{ key: "a", value: 1, color: "x" }, { key: "b", value: 3, color: "y" }, { key: "c", value: 0, color: "z" }]);
    expect(s.map((x) => x.key)).toEqual(["b", "a"]);
    expect(s[1]!.to).toBeCloseTo(1);
    expect(donutSlices([])).toEqual([]);
  });
  it("compares a week with the week before", () => {
    expect(weekOverWeek([1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2])).toEqual({ last: 14, previous: 7, delta: 7 });
  });
});
