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

  it("orders cached before not cached, then the sharpest, then the biggest", () => {
    const options = downloadOptions([
      stream("slow4k", { resolutionTier: "UHD_4K", qualityBadge: "4K", debrid: { service: "TB", cached: false } }),
      stream("small1080", { sizeBytes: 1_000 }),
      stream("big1080", { sizeBytes: 9_000 }),
      stream("cached4k", { resolutionTier: "UHD_4K", qualityBadge: "4K" }),
    ]);
    expect(options.map((o) => o.stream.id)).toEqual(["cached4k", "big1080", "small1080", "slow4k"]);
  });

  it("lists the same link once", () => {
    const options = downloadOptions([stream("a"), stream("a2", { url: "https://cdn.example.com/a.mkv" })]);
    expect(options).toHaveLength(1);
  });
});
