import { describe, expect, it } from "vitest";
import type { Stream } from "../domain/types";
import { matchLastSource } from "./lastSource";

const stream = (id: string, releaseTitle: string, providerLabel = "Torrentio", infoHash: string | null = null): Stream =>
  ({ id, providerId: "p", providerLabel, resolutionTier: "FHD_1080P", qualityBadge: "1080p", releaseTitle, infoHash }) as Stream;

describe("matchLastSource", () => {
  it("prefers the same id", () => {
    const streams = [stream("a", "Movie 1080p"), stream("b", "Movie 4K")];
    expect(matchLastSource(streams, { streamId: "b", releaseTitle: "Movie 1080p" })?.id).toBe("b");
  });

  it("finds a source whose id changed by its info hash", () => {
    const streams = [stream("x1", "Other", "Torrentio", "AAA"), stream("x2", "Movie 1080p", "Torrentio", "BBB")];
    expect(matchLastSource(streams, { streamId: "old", releaseTitle: "Movie 1080p", infoHash: "bbb" })?.id).toBe("x2");
  });

  it("falls back to the same release from the same addon, then from any addon", () => {
    const streams = [stream("c", "Movie 1080p", "Other"), stream("d", "Movie 1080p", "Torrentio")];
    expect(matchLastSource(streams, { streamId: "old", providerLabel: "Torrentio", releaseTitle: "Movie 1080p" })?.id).toBe("d");
    expect(matchLastSource(streams, { streamId: "old", providerLabel: "Gone", releaseTitle: "Movie 1080p" })?.id).toBe("c");
  });

  it("guesses nothing when the source is gone or only its id was kept", () => {
    const streams = [stream("e", "Something else")];
    expect(matchLastSource(streams, { streamId: "old", releaseTitle: "Movie 1080p" })).toBeNull();
    expect(matchLastSource(streams, { streamId: "old" })).toBeNull();
    expect(matchLastSource(streams, null)).toBeNull();
  });
});
