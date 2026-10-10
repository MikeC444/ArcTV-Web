import type { Stream } from "../domain/types";

/** What a Download button needs: the file's address and a name to suggest for it. */
export interface DownloadInfo {
  url: string;
  filename: string;
}

const STREAMING_MANIFEST = /\.(m3u8|mpd)$/i;
const VIDEO_EXTENSION = /\.(mp4|mkv|m4v|mov|avi|webm|ts)$/i;

/**
 * The file behind a source, when the browser can simply download it: a plain https link to one video file. Not offered for
 * streaming manifests (HLS and DASH are many small pieces, not a file), for sources that need request headers a plain link can't send,
 * for torrent-only or YouTube sources, or for http links (browsers block insecure downloads from an https page).
 */
export function downloadInfo(stream: Pick<Stream, "url" | "releaseTitle" | "proxyHeaders" | "infoHash" | "ytId">): DownloadInfo | null {
  if (!stream.url || stream.ytId) return null;
  if (stream.proxyHeaders && Object.keys(stream.proxyHeaders).length > 0) return null;
  let parsed: URL;
  try {
    parsed = new URL(stream.url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  if (STREAMING_MANIFEST.test(parsed.pathname)) return null;
  return { url: parsed.toString(), filename: suggestedFilename(stream.releaseTitle, parsed.pathname) };
}

/** A safe file name from the release's title, ending in the link's own video extension when it has one. */
export function suggestedFilename(releaseTitle: string, pathname: string): string {
  const base = Array.from(releaseTitle, (ch) => (ch.charCodeAt(0) < 32 ? " " : ch))
    .join("")
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "")
    .slice(0, 120)
    .trim();
  const name = base || "video";
  if (VIDEO_EXTENSION.test(name)) return name;
  const ext = VIDEO_EXTENSION.exec(decodeURIComponentSafe(pathname))?.[0] ?? "";
  return `${name}${ext}`;
}

function decodeURIComponentSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
