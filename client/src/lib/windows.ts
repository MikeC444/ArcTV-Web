/** True for a Windows desktop browser (Windows Phone and other touch-only "Windows" user agents are left out). */
export function isWindowsBrowser(userAgent: string): boolean {
  return /Windows NT/.test(userAgent) && !/Windows Phone|IEMobile|Xbox/.test(userAgent);
}

/** Whether this browser is on Windows. */
export function onWindows(): boolean {
  return typeof navigator !== "undefined" && isWindowsBrowser(navigator.userAgent);
}

/** Where the Windows app is downloaded (the installer is named per version, so this is the release page). */
export const WINDOWS_APP_URL = "https://github.com/MikeC444/ArcTV-Windows/releases/latest";

const WINDOWS_DOWNLOAD_PREFIX = "https://github.com/MikeC444/ArcTV-Windows/releases/download/";

/** The installer's address in a GitHub "latest release" answer, or null if it has none (or it points anywhere but the Windows app's own releases). */
export function windowsInstallerUrl(release: unknown): string | null {
  const assets = (release as { assets?: Array<{ name?: unknown; browser_download_url?: unknown }> } | null)?.assets;
  if (!Array.isArray(assets)) return null;
  for (const a of assets) {
    if (typeof a?.name === "string" && /\.exe$/i.test(a.name) && typeof a.browser_download_url === "string" && a.browser_download_url.startsWith(WINDOWS_DOWNLOAD_PREFIX)) {
      return a.browser_download_url;
    }
  }
  return null;
}

/** Looks up the newest Windows app's installer. Null when it can't be found (none published yet, offline, rate limited), so callers fall back to the release page. */
export async function fetchWindowsInstallerUrl(): Promise<string | null> {
  try {
    const res = await fetch("https://api.github.com/repos/MikeC444/ArcTV-Windows/releases/latest", { headers: { Accept: "application/vnd.github+json" } });
    return res.ok ? windowsInstallerUrl(await res.json()) : null;
  } catch {
    return null;
  }
}
