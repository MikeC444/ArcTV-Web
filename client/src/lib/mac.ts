/** True for a Mac browser. An iPad asks for the desktop site with a "Macintosh" user agent, so a touch screen rules it out. */
export function isMacBrowser(userAgent: string, maxTouchPoints = 0): boolean {
  return /Macintosh|Mac OS X/.test(userAgent) && !/iPhone|iPad|iPod/.test(userAgent) && maxTouchPoints <= 1;
}

/** Whether this browser is on a Mac. */
export function onMac(): boolean {
  return typeof navigator !== "undefined" && isMacBrowser(navigator.userAgent, navigator.maxTouchPoints ?? 0);
}

/** Where the Mac app is downloaded (the disk image is named per version, so this is the release page). */
export const MAC_APP_URL = "https://github.com/MikeC444/ArcTV-Mac/releases/latest";

const MAC_DOWNLOAD_PREFIX = "https://github.com/MikeC444/ArcTV-Mac/releases/download/";

/** The disk image's address in a GitHub "latest release" answer, or null if it has none (or it points anywhere but the Mac app's own releases). */
export function macDmgUrl(release: unknown): string | null {
  const assets = (release as { assets?: Array<{ name?: unknown; browser_download_url?: unknown }> } | null)?.assets;
  if (!Array.isArray(assets)) return null;
  for (const a of assets) {
    if (typeof a?.name === "string" && /\.dmg$/i.test(a.name) && typeof a.browser_download_url === "string" && a.browser_download_url.startsWith(MAC_DOWNLOAD_PREFIX)) {
      return a.browser_download_url;
    }
  }
  return null;
}

/** Looks up the newest Mac app's disk image. Null when it can't be found (offline, rate limited), so callers fall back to the release page. */
export async function fetchMacDmgUrl(): Promise<string | null> {
  try {
    const res = await fetch("https://api.github.com/repos/MikeC444/ArcTV-Mac/releases/latest", { headers: { Accept: "application/vnd.github+json" } });
    return res.ok ? macDmgUrl(await res.json()) : null;
  } catch {
    return null;
  }
}
