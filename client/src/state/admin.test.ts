import { describe, expect, it } from "vitest";
import { timeAgo } from "../lib/format";
import { newestVersion } from "./admin";

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
