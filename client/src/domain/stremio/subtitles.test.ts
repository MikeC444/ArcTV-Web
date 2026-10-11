import { describe, expect, it } from "vitest";
import { languageDisplayName, languageKey, offersSubtitles, parseSubtitleCues, rankSubtitles, toAddonSubtitles } from "./subtitles";

const manifest = (resources: unknown[], extra: { types?: string[]; idPrefixes?: string[] } = {}) => ({ resources, types: extra.types ?? [], idPrefixes: extra.idPrefixes ?? [] });

describe("offersSubtitles", () => {
  it("only asks addons that list the subtitles resource", () => {
    expect(offersSubtitles(manifest(["catalog", "meta"]), "movie", "tt1")).toBe(false);
    expect(offersSubtitles(manifest(["stream", "subtitles"]), "movie", "tt1")).toBe(true);
  });
  it("honours the resource's own types and id prefixes, then the manifest's", () => {
    expect(offersSubtitles(manifest([{ name: "subtitles", types: ["series"], idPrefixes: ["tt"] }]), "movie", "tt1")).toBe(false);
    expect(offersSubtitles(manifest([{ name: "subtitles", types: ["movie"], idPrefixes: ["kitsu"] }]), "movie", "tt1")).toBe(false);
    expect(offersSubtitles(manifest([{ name: "subtitles" }], { types: ["movie"], idPrefixes: ["tt"] }), "movie", "tt1")).toBe(true);
    expect(offersSubtitles(manifest([{ name: "subtitles" }], { types: ["series"] }), "movie", "tt1")).toBe(false);
  });
});

describe("languages", () => {
  it("gives one two-letter key for the many ways an addon writes a language", () => {
    for (const raw of ["eng", "en", "en-US", "English", "ENG"]) expect(languageKey(raw)).toBe("en");
    expect(languageKey("fre")).toBe("fr");
    expect(languageKey("pt-BR")).toBe("pt");
    for (const [raw, key] of [["srp", "sr"], ["hrv", "hr"], ["bos", "bs"], ["mkd", "mk"], ["mac", "mk"], ["Serbian", "sr"], ["Croatian", "hr"], ["Bosnian", "bs"], ["Macedonian", "mk"], ["hr-HR", "hr"]]) expect(languageKey(raw)).toBe(key);
    expect(languageKey("zzz")).toBeNull();
  });
  it("shows a readable name, or the code when it is unknown", () => {
    expect(languageDisplayName("spa")).toBe("Spanish");
    expect(languageDisplayName("zzz")).toBe("ZZZ");
    expect(languageDisplayName("")).toBe("Unknown");
  });
});

describe("toAddonSubtitles and rankSubtitles", () => {
  const found = toAddonSubtitles(
    [{ url: "https://a/1.srt", lang: "fre" }, { url: "ftp://a/2.srt", lang: "eng" }, { url: "https://a/1.srt", lang: "fre" }, { url: "https://a/3.srt", lang: "eng" }, { url: "https://a/4.srt", lang: "eng" }, { lang: "eng" }],
    "Subs",
  );
  it("keeps only web addresses, once each", () => {
    expect(found.map((s) => s.url)).toEqual(["https://a/1.srt", "https://a/3.srt", "https://a/4.srt"]);
    expect(toAddonSubtitles(undefined, "Subs")).toEqual([]);
  });
  it("puts the preferred language first, then the rest by name", () => {
    expect(rankSubtitles(found, "en").map((s) => s.languageName)).toEqual(["English", "English", "French"]);
    expect(rankSubtitles(found, null).map((s) => s.languageName)).toEqual(["English", "English", "French"]);
    expect(rankSubtitles(found, "fr").map((s) => s.languageName)).toEqual(["French", "English", "English"]);
  });
  it("caps the files per language", () => {
    expect(rankSubtitles(found, "en", 1).map((s) => s.url)).toEqual(["https://a/3.srt", "https://a/1.srt"]);
  });
});

describe("parseSubtitleCues", () => {
  it("reads SubRip", () => {
    const cues = parseSubtitleCues("﻿1\r\n00:00:01,500 --> 00:00:03,000\r\nHello\r\n<i>there</i>\r\n\r\n2\r\n01:00:00,000 --> 01:00:01,250\r\n{\\an8}Later\r\n");
    expect(cues).toEqual([
      { start: 1.5, end: 3, text: "Hello\n<i>there</i>" },
      { start: 3600, end: 3601.25, text: "Later" },
    ]);
  });
  it("reads WebVTT, with or without hours, and skips the header and notes", () => {
    const cues = parseSubtitleCues("WEBVTT\n\nNOTE a note\n\ncue1\n00:01.000 --> 00:02.500 align:start\nHi\n");
    expect(cues).toEqual([{ start: 1, end: 2.5, text: "Hi" }]);
  });
  it("ignores text that is not subtitles", () => {
    expect(parseSubtitleCues("<html>Not found</html>")).toEqual([]);
  });
});
