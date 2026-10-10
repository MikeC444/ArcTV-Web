import { describe, expect, it } from "vitest";
import { downloadInfo, suggestedFilename } from "./download";

const base = { releaseTitle: "Movie.2024.1080p.WEB-DL.x264", proxyHeaders: null, infoHash: null, ytId: null };

describe("downloadInfo", () => {
  it("offers a plain https link to a video file, with a safe name and the link's own extension", () => {
    expect(downloadInfo({ ...base, url: "https://cdn.example.com/d/abc/Movie.2024.1080p.mkv" })).toEqual({
      url: "https://cdn.example.com/d/abc/Movie.2024.1080p.mkv",
      filename: "Movie.2024.1080p.WEB-DL.x264.mkv",
    });
  });

  it("offers a link with no extension too, and keeps the extension a title already has", () => {
    expect(downloadInfo({ ...base, url: "https://resolver.example.com/resolve/hash/0/file" })?.filename).toBe("Movie.2024.1080p.WEB-DL.x264");
    expect(suggestedFilename("Show S01E02.mkv", "/x/y.mp4")).toBe("Show S01E02.mkv");
  });

  it("does not offer streams that are not one file, or that a plain link cannot fetch", () => {
    expect(downloadInfo({ ...base, url: null })).toBeNull();
    expect(downloadInfo({ ...base, url: "https://cdn.example.com/master.m3u8?token=1" })).toBeNull();
    expect(downloadInfo({ ...base, url: "https://cdn.example.com/manifest.mpd" })).toBeNull();
    expect(downloadInfo({ ...base, url: "http://cdn.example.com/a.mkv" })).toBeNull(); // browsers block insecure downloads from an https page
    expect(downloadInfo({ ...base, url: "https://cdn.example.com/a.mkv", proxyHeaders: { Referer: "https://x" } })).toBeNull();
    expect(downloadInfo({ ...base, url: "https://cdn.example.com/a.mkv", ytId: "abc" })).toBeNull();
    expect(downloadInfo({ ...base, url: "not a url" })).toBeNull();
  });

  it("cleans the title into a file name", () => {
    expect(suggestedFilename('A/B: "C"?*<>|', "/f.mp4")).toBe("A B C.mp4");
    expect(suggestedFilename("   ", "/f.mkv")).toBe("video.mkv");
    expect(suggestedFilename("Line\nbreak\tname", "/f.mp4")).toBe("Line break name.mp4");
    expect(suggestedFilename("x".repeat(300), "/f.mp4").length).toBeLessThanOrEqual(124);
  });
});
