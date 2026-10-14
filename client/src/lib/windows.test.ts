import { describe, expect, it } from "vitest";
import { isWindowsBrowser, windowsInstallerUrl } from "./windows";

const CHROME_WIN = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const EDGE_WIN = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0";
const SAFARI_MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";
const WINDOWS_PHONE = "Mozilla/5.0 (Windows Phone 10.0; Android 6.0.1; Microsoft; Lumia 950) AppleWebKit/537.36 Chrome/52.0 Mobile Safari/537.36 Edge/15.15254";

describe("isWindowsBrowser", () => {
  it("is true for Chrome and Edge on Windows", () => {
    expect(isWindowsBrowser(CHROME_WIN)).toBe(true);
    expect(isWindowsBrowser(EDGE_WIN)).toBe(true);
  });
  it("is false for a Mac, an Android phone and a Windows Phone", () => {
    expect(isWindowsBrowser(SAFARI_MAC)).toBe(false);
    expect(isWindowsBrowser(ANDROID)).toBe(false);
    expect(isWindowsBrowser(WINDOWS_PHONE)).toBe(false);
  });
});

describe("windowsInstallerUrl", () => {
  const ok = "https://github.com/MikeC444/ArcTV-Windows/releases/download/v0.1.0/ArcTV-Setup-0.1.0.exe";
  it("picks the installer from the latest release, not the zip", () => {
    expect(windowsInstallerUrl({ assets: [{ name: "ArcTV-win-x64-0.1.0.zip", browser_download_url: "https://github.com/MikeC444/ArcTV-Windows/releases/download/v0.1.0/ArcTV-win-x64-0.1.0.zip" }, { name: "ArcTV-Setup-0.1.0.exe", browser_download_url: ok }] })).toBe(ok);
  });
  it("is null with no installer, a bad answer, or an address outside the Windows app's releases", () => {
    expect(windowsInstallerUrl({ assets: [] })).toBeNull();
    expect(windowsInstallerUrl(null)).toBeNull();
    expect(windowsInstallerUrl({ assets: [{ name: "a.exe", browser_download_url: "https://evil.example/a.exe" }] })).toBeNull();
  });
});
