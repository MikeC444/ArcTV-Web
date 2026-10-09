import { describe, expect, it } from "vitest";
import { timeAgo } from "../lib/format";
import { adminUsersQuery, filtersActive, newestVersion, NO_FILTERS, platformSplit, windowLabel } from "./admin";

describe("newestVersion", () => {
  it("compares dotted numbers properly and ignores web / unknown", () => {
    expect(newestVersion(["0.1.9", "0.1.10", "0.1.7"])).toBe("0.1.10");
    expect(newestVersion(["0.2", "0.1.9"])).toBe("0.2");
    expect(newestVersion(["web", "unknown"])).toBeNull();
    expect(newestVersion(["unknown", "0.1.6", "web"])).toBe("0.1.6");
    expect(newestVersion([])).toBeNull();
  });
});

describe("timeAgo", () => {
  const now = Date.parse("2026-10-04T12:00:00Z");
  it("reads naturally", () => {
    expect(timeAgo(null, now)).toBe("never");
    expect(timeAgo("2026-10-04T11:59:40Z", now)).toBe("just now");
    expect(timeAgo("2026-10-04T11:55:00Z", now)).toBe("5 min ago");
    expect(timeAgo("2026-10-04T09:00:00Z", now)).toBe("3 h ago");
    expect(timeAgo("2026-10-02T12:00:00Z", now)).toBe("2 d ago");
    expect(timeAgo("garbage", now)).toBe("never");
  });
});

describe("user list filters", () => {
  it("send only what is set, and know when any is on", () => {
    expect(filtersActive(NO_FILTERS)).toBe(false);
    expect(adminUsersQuery(NO_FILTERS, 50, 0)).toBe("limit=50&offset=0");
    const f = { ...NO_FILTERS, q: "sam", plan: "free" as const, device: "fire_tv|0.1.7", seen: "7d" as const };
    expect(filtersActive(f)).toBe(true);
    expect(adminUsersQuery(f, 50, 100)).toBe("q=sam&plan=free&device=fire_tv%7C0.1.7&seen=7d&limit=50&offset=100");
  });
});

describe("live counts", () => {
  it("writes a platform split biggest first, and nothing when nobody", () => {
    const name = (p: string) => (p === "fire_tv" ? "Fire TV" : p === "web" ? "Web" : p);
    expect(platformSplit({ web: 1, fire_tv: 3 }, name)).toBe("Fire TV 3 · Web 1");
    expect(platformSplit({ web: 0 }, name)).toBe("");
    expect(platformSplit({}, name)).toBe("");
  });
  it("names the windows plainly", () => {
    expect(windowLabel(300)).toBe("5 minutes");
    expect(windowLabel(45)).toBe("45 seconds");
    expect(windowLabel(60)).toBe("1 minute");
  });
});
