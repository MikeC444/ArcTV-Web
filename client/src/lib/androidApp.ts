/** True for a browser on an Android phone or tablet. Android TV and Fire TV browsers are left out: the phone app is not for a television. */
export function isAndroidPhoneBrowser(userAgent: string): boolean {
  return /Android/.test(userAgent) && !/\bAFT[A-Z0-9]*\b|Android TV|SMART-TV|SmartTV|BRAVIA|; TV\b/i.test(userAgent);
}

/** Whether this browser is on an Android phone or tablet. */
export function onAndroidPhone(): boolean {
  return typeof navigator !== "undefined" && isAndroidPhoneBrowser(navigator.userAgent);
}

/** Where the Android app is downloaded when the file itself can't be found (the release page). */
export const ANDROID_APP_URL = "https://github.com/MikeC444/ArcTV-MobileAPK/releases/latest";

const ANDROID_DOWNLOAD_PREFIX = "https://github.com/MikeC444/ArcTV-MobileAPK/releases/download/";

/** The app file's address in a GitHub "latest release" answer, or null if it has none (or it points anywhere but the Android app's own releases). */
export function androidApkUrl(release: unknown): string | null {
  const assets = (release as { assets?: Array<{ name?: unknown; browser_download_url?: unknown }> } | null)?.assets;
  if (!Array.isArray(assets)) return null;
  for (const a of assets) {
    if (typeof a?.name === "string" && /\.apk$/i.test(a.name) && typeof a.browser_download_url === "string" && a.browser_download_url.startsWith(ANDROID_DOWNLOAD_PREFIX)) {
      return a.browser_download_url;
    }
  }
  return null;
}

/** Looks up the newest Android app file. Null when it can't be found (offline, rate limited), so callers fall back to the release page. */
export async function fetchAndroidApkUrl(): Promise<string | null> {
  try {
    const res = await fetch("https://api.github.com/repos/MikeC444/ArcTV-MobileAPK/releases/latest", { headers: { Accept: "application/vnd.github+json" } });
    return res.ok ? androidApkUrl(await res.json()) : null;
  } catch {
    return null;
  }
}
