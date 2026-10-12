import { describe, expect, it } from "vitest";
import { isMacBrowser } from "./mac";

const SAFARI_MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
const CHROME_MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const CHROME_WIN = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

describe("isMacBrowser", () => {
  it("is true for Safari and Chrome on a Mac", () => {
    expect(isMacBrowser(SAFARI_MAC)).toBe(true);
    expect(isMacBrowser(CHROME_MAC)).toBe(true);
  });
  it("is false for Windows and for an iPhone", () => {
    expect(isMacBrowser(CHROME_WIN)).toBe(false);
    expect(isMacBrowser(IPHONE)).toBe(false);
  });
  it("is false for an iPad asking for the desktop site (a Mac user agent with a touch screen)", () => {
    expect(isMacBrowser(SAFARI_MAC, 5)).toBe(false);
  });
});

import { macDmgUrl } from "./mac";

describe("macDmgUrl", () => {
  const ok = "https://github.com/MikeC444/ArcTV-Mac/releases/download/v0.2.0/ArcTV-0.2.0.dmg";
  it("picks the disk image from the latest release", () => {
    expect(macDmgUrl({ assets: [{ name: "notes.txt", browser_download_url: "https://x/y.txt" }, { name: "ArcTV-0.2.0.dmg", browser_download_url: ok }] })).toBe(ok);
  });
  it("is null with no disk image, a bad answer, or an address outside the Mac app's releases", () => {
    expect(macDmgUrl({ assets: [] })).toBeNull();
    expect(macDmgUrl(null)).toBeNull();
    expect(macDmgUrl({ assets: [{ name: "a.dmg", browser_download_url: "https://evil.example/a.dmg" }] })).toBeNull();
  });
});
