import { describe, expect, it } from "vitest";
import { pickDefaultAudio } from "./engine";

const track = (id: string, language: string | null, selected = false) => ({ id, label: id, language, selected });

describe("pickDefaultAudio", () => {
  it("does nothing when the preference is automatic", () => {
    expect(pickDefaultAudio([track("0", "en", true), track("1", "ja")], { defaultAudioLanguage: null })).toBeNull();
  });
  it("picks the matching track when another one is playing", () => {
    expect(pickDefaultAudio([track("0", "en", true), track("1", "ja")], { defaultAudioLanguage: "ja" })).toBe("1");
  });
  it("leaves the stream alone when it already plays that language or has no match", () => {
    expect(pickDefaultAudio([track("0", "ja", true), track("1", "en")], { defaultAudioLanguage: "ja" })).toBeNull();
    expect(pickDefaultAudio([track("0", "en", true), track("1", "fr")], { defaultAudioLanguage: "ja" })).toBeNull();
  });
});
