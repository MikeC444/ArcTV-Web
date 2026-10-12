import { describe, expect, it } from "vitest";
import { androidApkUrl, isAndroidPhoneBrowser } from "./androidApp";

const PIXEL = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";
const TABLET = "Mozilla/5.0 (Linux; Android 13; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const FIRE_TV = "Mozilla/5.0 (Linux; Android 9; AFTMM Build/PS7233) AppleWebKit/537.36 (KHTML, like Gecko) Silk/118.0 like Chrome/118.0.0.0 Safari/537.36";
const ANDROID_TV = "Mozilla/5.0 (Linux; Android 12; Android TV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";

describe("isAndroidPhoneBrowser", () => {
  it("is true for an Android phone and tablet", () => {
    expect(isAndroidPhoneBrowser(PIXEL)).toBe(true);
    expect(isAndroidPhoneBrowser(TABLET)).toBe(true);
  });
  it("is false for Fire TV, Android TV and a Mac", () => {
    expect(isAndroidPhoneBrowser(FIRE_TV)).toBe(false);
    expect(isAndroidPhoneBrowser(ANDROID_TV)).toBe(false);
    expect(isAndroidPhoneBrowser(MAC)).toBe(false);
  });
});

describe("androidApkUrl", () => {
  const ok = "https://github.com/MikeC444/ArcTV-MobileAPK/releases/download/v0.5.1/ArcTV-Mobile.apk";
  it("picks the app file from the latest release", () => {
    expect(androidApkUrl({ assets: [{ name: "notes.txt", browser_download_url: "https://x/y.txt" }, { name: "ArcTV-Mobile.apk", browser_download_url: ok }] })).toBe(ok);
  });
  it("is null with no app file, a bad answer, or an address outside the Android app's releases", () => {
    expect(androidApkUrl({ assets: [] })).toBeNull();
    expect(androidApkUrl(undefined)).toBeNull();
    expect(androidApkUrl({ assets: [{ name: "a.apk", browser_download_url: "https://evil.example/a.apk" }] })).toBeNull();
  });
});
