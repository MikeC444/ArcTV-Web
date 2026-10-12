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
