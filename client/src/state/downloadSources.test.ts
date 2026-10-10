import { describe, expect, it } from "vitest";
import type { Stream } from "../domain/types";
import { downloadOptions } from "./downloadSources";

const stream = (id: string, over: Partial<Stream> = {}): Stream => ({
  id, providerId: "p", providerLabel: "Addon", resolutionTier: "FHD_1080P", qualityBadge: "1080p", releaseTitle: `Release ${id}`,
  url: `https://cdn.example.com/${id}.mkv`, sizeBytes: 1_000, debrid: { service: "TB", cached: true }, ...over,
});

describe("downloadOptions", () => {
  it("keeps only the sources that are a plain file", () => {
    const options = downloadOptions([stream("a"), stream("b", { url: "https://cdn.example.com/b.m3u8" }), stream("c", { url: null, infoHash: "abc" }), stream("d", { url: "http://cdn.example.com/d.mkv" })]);
    expect(options.map((o) => o.stream.id)).toEqual(["a"]);
    expect(options[0]!.download.filename).toBe("Release a.mkv");
  });

  it("puts the highest quality first and, within a quality, the smallest file first", () => {
    const options = downloadOptions([
      stream("big1080", { sizeBytes: 9_000 }),
      stream("4kBig", { resolutionTier: "UHD_4K", qualityBadge: "4K", sizeBytes: 30_000 }),
      stream("small1080", { sizeBytes: 1_000 }),
      stream("4kSmall", { resolutionTier: "UHD_4K", qualityBadge: "4K", sizeBytes: 12_000 }),
      stream("mid720", { resolutionTier: "HD_720P", qualityBadge: "720p", sizeBytes: 500 }),
    ]);
    expect(options.map((o) => o.stream.id)).toEqual(["4kSmall", "4kBig", "small1080", "big1080", "mid720"]);
  });

  it("puts a file with no listed size last in its quality", () => {
    const options = downloadOptions([stream("unknown", { sizeBytes: null }), stream("known", { sizeBytes: 5_000 })]);
    expect(options.map((o) => o.stream.id)).toEqual(["known", "unknown"]);
  });

  it("keeps files that are already stored at the debrid service above ones it still has to fetch, whatever the quality", () => {
    const options = downloadOptions([
      stream("slow4k", { resolutionTier: "UHD_4K", qualityBadge: "4K", debrid: { service: "TB", cached: false } }),
      stream("cached1080", { sizeBytes: 3_000 }),
    ]);
    expect(options.map((o) => o.stream.id)).toEqual(["cached1080", "slow4k"]);
  });

  it("sends camera recordings to the bottom instead of letting their tiny size win", () => {
    const options = downloadOptions([
      stream("cam", { sourceTag: "CAM", sizeBytes: 100 }),
      stream("web", { sourceTag: "WEB-DL", sizeBytes: 4_000 }),
    ]);
    expect(options.map((o) => o.stream.id)).toEqual(["web", "cam"]);
  });

  it("lists the same link once", () => {
    const options = downloadOptions([stream("a"), stream("a2", { url: "https://cdn.example.com/a.mkv" })]);
    expect(options).toHaveLength(1);
  });
});
