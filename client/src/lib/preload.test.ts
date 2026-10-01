import { describe, expect, it } from "vitest";
import { heroImageAddresses } from "./preload";

describe("heroImageAddresses", () => {
  it("lists each title's backdrop (the sharper address) then its logo, in order, once each", () => {
    const list = heroImageAddresses([
      { backdropUrl: "https://images.metahub.space/background/medium/tt1/img", logoUrl: "https://images.metahub.space/logo/medium/tt1/img" },
      { backdropUrl: "https://images.metahub.space/background/medium/tt1/img" },
      { backdropUrl: null, logoUrl: null },
      { backdropUrl: "https://example.com/b.jpg" },
    ]);
    expect(list).toEqual([
      { url: "https://images.metahub.space/background/large/tt1/img", fallback: "https://images.metahub.space/background/medium/tt1/img" },
      { url: "https://images.metahub.space/logo/medium/tt1/img", fallback: "https://images.metahub.space/logo/medium/tt1/img" },
      { url: "https://example.com/b.jpg", fallback: "https://example.com/b.jpg" },
    ]);
  });
});
