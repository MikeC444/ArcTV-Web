import { describe, expect, it } from "vitest";
import { hdrLabel, sourceLabel } from "./downloadLabels";

const s = (releaseTitle: string, resolutionTier: "UHD_4K" | "FHD_1080P" | "HD_720P" = "FHD_1080P", sourceTag: string | null = null) => ({ releaseTitle, resolutionTier, sourceTag, qualityBadge: resolutionTier === "UHD_4K" ? "4K" : "1080p" });

describe("sourceLabel", () => {
  it("names the kind of release", () => {
    expect(sourceLabel(s("The.Conjuring.2013.2160p.UHD.BluRay.REMUX.HEVC", "UHD_4K"))).toBe("UHD Blu-ray REMUX");
    expect(sourceLabel(s("The.Conjuring.2013.2160p.UHD.BluRay.x265", "UHD_4K"))).toBe("UHD Blu-ray");
    expect(sourceLabel(s("The.Conjuring.2013.1080p.BluRay.x264"))).toBe("Blu-ray");
    expect(sourceLabel(s("The.Conjuring.2013.2160p.WEB-DL.DDP5.1", "UHD_4K"))).toBe("4K WEB-DL");
    expect(sourceLabel(s("Movie 1080p WEBRip"))).toBe("WEB-DL");
    expect(sourceLabel(s("Movie 720p HDTV", "HD_720P"))).toBe("HDTV");
    expect(sourceLabel(s("Movie 1080p DVDRip"))).toBe("DVD");
    expect(sourceLabel(s("Movie.2024.HDCAM"))).toBe("Camera recording");
  });
  it("falls back to the quality when the name says nothing", () => {
    expect(sourceLabel(s("Movie 2013 file", "UHD_4K"))).toBe("4K");
    expect(sourceLabel(s("Movie 2013 file"))).toBe("1080p");
  });
  it("uses the source tag the addon gave when the title does not say", () => {
    expect(sourceLabel(s("Movie 2013", "FHD_1080P", "BluRay"))).toBe("Blu-ray");
  });
});

describe("hdrLabel", () => {
  it("spots Dolby Vision and HDR, Dolby Vision first", () => {
    expect(hdrLabel({ releaseTitle: "Movie.2160p.DV.HDR10.HEVC", descriptor: null })).toBe("Dolby Vision");
    expect(hdrLabel({ releaseTitle: "Movie 2160p HDR10+ x265", descriptor: null })).toBe("HDR");
    expect(hdrLabel({ releaseTitle: "Movie 2160p", descriptor: "Dolby Vision profile 5" })).toBe("Dolby Vision");
    expect(hdrLabel({ releaseTitle: "Movie 1080p x264", descriptor: null })).toBeNull();
  });
});
