import { needsRelay } from "./relay";
import type { Stream } from "./types";

/**
 * What a *browser* can and can't do with a Stremio stream — the Firestick app (ExoPlayer) plays direct URLs only, and a
 * browser is stricter still. Every reason here is surfaced to the user instead of failing silently.
 */
export type Playability =
  /** `relay`: the browser can't fetch this itself (special headers / plain http), so it plays through this site's stream relay. */
  | { level: "ok"; relay?: true }
  | { level: "maybe"; reason: string }
  | { level: "no"; reason: string; kind: "torrent" | "youtube" | "external" | "unknown" };

export function assessStream(stream: Pick<Stream, "url" | "infoHash" | "ytId" | "notWebReady" | "proxyHeaders">, pageProtocol: string = typeof location === "undefined" ? "https:" : location.protocol): Playability {
  const url = stream.url ?? "";
  if (!url) {
    if (stream.infoHash) return { level: "no", kind: "torrent", reason: "This is a torrent source. Browsers can't stream torrents — use the ArcTV app, or install an addon that provides direct (debrid) links." };
    if (stream.ytId) return { level: "no", kind: "youtube", reason: "This source is a YouTube video. It can be opened on YouTube but can't be played inside ArcTV." };
    return { level: "no", kind: "unknown", reason: "This source doesn't include a playable link." };
  }
  if (/^magnet:/i.test(url)) return { level: "no", kind: "torrent", reason: "This is a magnet link. Browsers can't stream torrents — use the ArcTV app, or an addon that provides direct links." };
  if (!/^https?:\/\//i.test(url)) return { level: "no", kind: "unknown", reason: "This source uses a link type browsers can't play." };
  // Plain http behind our https page, or request headers a page may not set: Stremio sends these through its streaming server's
  // /proxy/; here the web server relays them (see relay.ts / server streamRelay.ts).
  const viaRelay = needsRelay({ url, proxyHeaders: stream.proxyHeaders }, pageProtocol);
  if (stream.notWebReady) return { level: "maybe", reason: "The addon marks this source as not ready for web players; it may not play in a browser." };
  if (/\.(mkv|avi|wmv|ts)(\?|#|$)/i.test(url)) return { level: "maybe", reason: "This container format isn't supported by every browser (Chrome and Edge usually play it, Safari and Firefox often don't)." };
  return viaRelay ? { level: "ok", relay: true } : { level: "ok" };
}

export type EngineKind = "hls" | "dash" | "native";

/** Picks the media pipeline from the URL; unknown extensions start native and fall back to HLS (see player). */
export function engineFor(url: string): EngineKind {
  const path = url.split(/[?#]/)[0]?.toLowerCase() ?? "";
  if (path.endsWith(".m3u8") || /\/hls\b|\/master\.m3u8/.test(path)) return "hls";
  if (path.endsWith(".mpd")) return "dash";
  return "native";
}
