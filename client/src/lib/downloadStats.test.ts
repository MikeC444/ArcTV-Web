import { describe, expect, it } from "vitest";
import { describeEvent, percent, personStatus, STATUS_LABEL } from "./downloadStats";

describe("download stats helpers", () => {
  it("says what happened in plain words", () => {
    expect(describeEvent({ kind: "popup", contentType: "MOVIE", episode: false, resolution: null, cached: null })).toBe("Saw the Plus popup for a movie");
    expect(describeEvent({ kind: "opened", contentType: "TV_SHOW", episode: false, resolution: null, cached: null })).toBe("Opened the file list for a show");
    expect(describeEvent({ kind: "file", contentType: "TV_SHOW", episode: true, resolution: "4K", cached: false })).toBe("Pressed a 4K file for an episode (not cached)");
    expect(describeEvent({ kind: "file", contentType: "MOVIE", episode: false, resolution: null, cached: true })).toBe("Pressed a file for a movie (cached)");
  });
  it("sorts a person by how far they got", () => {
    expect(personStatus({ files: 1, opens: 2 })).toBe("downloaded");
    expect(personStatus({ files: 0, opens: 1 })).toBe("opened");
    expect(personStatus({ files: 0, opens: 0 })).toBe("blocked");
    expect(STATUS_LABEL.blocked).toBe("Stopped by the Plus popup");
  });
  it("rounds a share and copes with nothing to divide by", () => {
    expect(percent(1, 3)).toBe(33);
    expect(percent(5, 0)).toBe(0);
  });
});
