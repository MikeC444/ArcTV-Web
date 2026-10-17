import { describe, expect, it } from "vitest";
import { orderServices, serviceOfCatalog, serviceRowId, visibleServices } from "./streamingServices";

describe("serviceOfCatalog", () => {
  it("finds a service from the catalogue's name", () => {
    expect(serviceOfCatalog({ id: "x", name: "Netflix" })).toBe("netflix");
    expect(serviceOfCatalog({ id: "x", name: "Disney+ Movies" })).toBe("disney");
    expect(serviceOfCatalog({ id: "x", name: "Amazon Prime" })).toBe("prime");
    expect(serviceOfCatalog({ id: "x", name: "HBO Max" })).toBe("max");
    expect(serviceOfCatalog({ id: "x", name: "Apple TV+" })).toBe("apple");
    expect(serviceOfCatalog({ id: "x", name: "Paramount+" })).toBe("paramount");
    expect(serviceOfCatalog({ id: "x", name: "Hulu" })).toBe("hulu");
  });
  it("finds a service from the short ids some addons use", () => {
    expect(serviceOfCatalog({ id: "nfx", name: null })).toBe("netflix");
    expect(serviceOfCatalog({ id: "streaming.dnp", name: "" })).toBe("disney");
    expect(serviceOfCatalog({ id: "amp" })).toBe("prime");
  });
  it("knows the other services, and picks the most specific one", () => {
    expect(serviceOfCatalog({ id: "x", name: "Peacock" })).toBe("peacock");
    expect(serviceOfCatalog({ id: "x", name: "Sky Showtime" })).toBe("skyshowtime");
    expect(serviceOfCatalog({ id: "x", name: "Sky Cinema" })).toBe("sky");
    expect(serviceOfCatalog({ id: "x", name: "Netflix Kids" })).toBe("netflixkids");
    expect(serviceOfCatalog({ id: "x", name: "Netflix" })).toBe("netflix");
    expect(serviceOfCatalog({ id: "x", name: "BBC iPlayer" })).toBe("iplayer");
    expect(serviceOfCatalog({ id: "x", name: "Crunchyroll" })).toBe("crunchyroll");
  });
  it("leaves other catalogues alone", () => {
    expect(serviceOfCatalog({ id: "top", name: "Popular" })).toBeNull();
    expect(serviceOfCatalog({ id: "year", name: "New" })).toBeNull();
    expect(serviceOfCatalog({ id: "imdbRating", name: "Top rated" })).toBeNull();
    expect(serviceOfCatalog({ id: "maximum", name: "Maximum Overdrive" })).toBeNull();
  });
});

describe("orderServices / visibleServices", () => {
  it("puts services in tile order, once each, and drops unknown ones", () => {
    expect(orderServices(["hulu", "netflix", "hulu", "nope", "prime"])).toEqual(["netflix", "prime", "hulu"]);
  });
  it("hides the ones the person turned off in Home Rows", () => {
    expect(visibleServices(["netflix", "disney"], [serviceRowId("disney")])).toEqual(["netflix"]);
    expect(visibleServices(["netflix"], ["something-else"])).toEqual(["netflix"]);
  });
});
