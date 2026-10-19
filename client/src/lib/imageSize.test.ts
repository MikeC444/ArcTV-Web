import { describe, expect, it } from "vitest";
import { sharpBackdrop } from "./imageSize";

describe("sharpBackdrop", () => {
  it("asks Metahub and TMDB for their biggest size", () => {
    expect(sharpBackdrop("https://images.metahub.space/background/medium/tt0111161/img")).toBe("https://images.metahub.space/background/large/tt0111161/img");
    expect(sharpBackdrop("https://images.metahub.space/background/small/tt0111161/img")).toBe("https://images.metahub.space/background/large/tt0111161/img");
    expect(sharpBackdrop("https://image.tmdb.org/t/p/w780/abc.jpg")).toBe("https://image.tmdb.org/t/p/original/abc.jpg");
    expect(sharpBackdrop("https://image.tmdb.org/t/p/w1280/abc.jpg")).toBe("https://image.tmdb.org/t/p/original/abc.jpg");
  });
  it("leaves everything else alone", () => {
    expect(sharpBackdrop("https://images.metahub.space/background/large/tt1/img")).toBe("https://images.metahub.space/background/large/tt1/img");
    expect(sharpBackdrop("https://image.tmdb.org/t/p/original/abc.jpg")).toBe("https://image.tmdb.org/t/p/original/abc.jpg");
    expect(sharpBackdrop("https://example.com/poster/medium/x.jpg")).toBe("https://example.com/poster/medium/x.jpg");
    expect(sharpBackdrop(null)).toBeNull();
    expect(sharpBackdrop("")).toBeNull();
  });
});
