import { describe, expect, it } from "vitest";
import { inUserOrder, isServiceRowId, isServiceVisible, moveService, orderServices, serviceOfCatalog, serviceRowId, STREAMING_SERVICES, visibleServices, withServiceOrder, withServiceVisible } from "./streamingServices";

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

describe("the person's own order of services", () => {
  it("puts placed services first in their order, then the rest in tile order", () => {
    const all = ["netflix", "disney", "prime", "hulu"];
    expect(inUserOrder(all, [])).toEqual(all);
    expect(inUserOrder(all, ["streaming:hulu", "some_row", "streaming:netflix"])).toEqual(["hulu", "netflix", "disney", "prime"]);
    expect(inUserOrder(["netflix"], ["streaming:hulu", "streaming:netflix"])).toEqual(["netflix"]);
  });
  it("moves a service up or down, and not past the ends", () => {
    expect(moveService(["a", "b", "c"], "c", -1)).toEqual(["a", "c", "b"]);
    expect(moveService(["a", "b", "c"], "a", 1)).toEqual(["b", "a", "c"]);
    expect(moveService(["a", "b", "c"], "a", -1)).toBeNull();
    expect(moveService(["a", "b", "c"], "c", 1)).toBeNull();
    expect(moveService(["a"], "zzz", 1)).toBeNull();
  });
  it("keeps ordinary rows' entries when the services' order is written", () => {
    expect(withServiceOrder(["row1", "streaming:a", "row2"], ["b", "a"])).toEqual(["row1", "row2", "streaming:b", "streaming:a"]);
    expect(isServiceRowId("streaming:a")).toBe(true);
    expect(isServiceRowId("row1")).toBe(false);
  });
});

describe("services that are off until the person turns them on", () => {
  it("shows the default ones, and hides the others, until the person decides", () => {
    expect(isServiceVisible("netflix", [])).toBe(true);
    expect(isServiceVisible("shudder", [])).toBe(true);
    expect(isServiceVisible("crunchyroll", [])).toBe(false);
    expect(isServiceVisible("starz", [])).toBe(false);
  });
  it("turning one on or off is remembered, and turning a default one off wins", () => {
    const on = withServiceVisible([], "crunchyroll", true);
    expect(isServiceVisible("crunchyroll", on)).toBe(true);
    expect(isServiceVisible("crunchyroll", withServiceVisible(on, "crunchyroll", false))).toBe(false);
    expect(withServiceVisible(withServiceVisible(on, "crunchyroll", false), "crunchyroll", true)).toEqual(on);
    const off = withServiceVisible(["row_x"], "netflix", false);
    expect(off).toEqual(["row_x", "streaming:netflix"]);
    expect(isServiceVisible("netflix", off)).toBe(false);
    expect(withServiceVisible(off, "netflix", true)).toEqual(["row_x"]);
  });
  it("keeps the default order with Shudder well back, and every service listed once", () => {
    const ids = STREAMING_SERVICES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.slice(0, 10)).toEqual(["netflix", "prime", "apple", "max", "disney", "paramount", "hulu", "peacock", "iplayer", "shudder"]);
    expect(STREAMING_SERVICES.filter((s) => !s.off).map((s) => s.id)).toEqual(ids.slice(0, 10));
  });
  it("knows the services in the real addon's full platform list", () => {
    const names = ["Netflix", "Disney+", "Prime Video", "Apple TV+", "HBO Max", "Paramount+", "Hulu", "Peacock", "Crunchyroll", "MagellanTV", "Curiosity Stream", "Netflix Kids", "Hayu", "Clarovideo", "Globoplay", "JioHotstar", "SkyShowtime", "Videoland", "NLZIET", "Zee5", "Starz", "Discovery+", "Mubi", "Sky Go", "Sony Liv", "Movistar+", "Rakuten Viki", "Canal+", "BritBox", "Shudder", "BBC iPlayer", "Channel 4", "Criterion Channel", "iQIYI", "ITVX", "Acorn TV"];
    for (const name of names) expect(serviceOfCatalog({ id: "x", name }), name).not.toBeNull();
  });
});
