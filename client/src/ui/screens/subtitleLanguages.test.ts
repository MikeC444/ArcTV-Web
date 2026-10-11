import { describe, expect, it } from "vitest";
import { SUBTITLE_LANGUAGES } from "./Settings";

describe("SUBTITLE_LANGUAGES", () => {
  it("has System Default first, English second and the rest A to Z", () => {
    expect(SUBTITLE_LANGUAGES[0]).toEqual({ code: null, label: "System Default" });
    expect(SUBTITLE_LANGUAGES[1]).toEqual({ code: "en", label: "English" });
    const rest = SUBTITLE_LANGUAGES.slice(2).map((l) => l.label);
    expect(rest).toEqual([...rest].sort((a, b) => a.localeCompare(b)));
    expect(rest[0]).toBe("Arabic");
    expect(rest).toContain("Macedonian");
    expect(new Set(SUBTITLE_LANGUAGES.map((l) => l.code)).size).toBe(SUBTITLE_LANGUAGES.length);
  });
});
