import type { Stream } from "./types";

/**
 * Stream relay addresses — the web counterpart of Stremio's streaming-server `/proxy/` URLs.
 *
 * `buildRelayUrl` is adapted from `buildProxyUrl` in @stremio/stremio-video
 * (src/withStreamingServer/buildProxyUrl.js, https://github.com/Stremio/stremio-video, MIT License,
 * Copyright (c) Smart Code OOD — the full notice is in THIRD_PARTY_NOTICES.md).
 * What was kept: the URL shape `<base>d=<origin>&h=<Header:Value>&r=<Header:Value>/<pathname><search>`, so relative paths
 * inside an HLS playlist keep resolving against the relay. What changed: it targets this site's own `/api/relay/` (which
 * requires the signed-in session cookie) instead of a local streaming server, and it is written in TypeScript.
 */
export const RELAY_BASE = "/api/relay/";

export function buildRelayUrl(streamUrl: string, requestHeaders: Record<string, string> = {}, responseHeaders: Record<string, string> = {}, base: string = RELAY_BASE): string {
  const parsed = new URL(streamUrl);
  const options = new URLSearchParams();
  options.set("d", parsed.origin);
  Object.entries(requestHeaders).forEach(([name, value]) => options.append("h", `${name}:${value}`));
  Object.entries(responseHeaders).forEach(([name, value]) => options.append("r", `${name}:${value}`));
  return `${base}${options.toString()}${parsed.pathname}${parsed.search}`;
}

export const isRelayUrl = (url: string): boolean => url.startsWith(RELAY_BASE);

/**
 * Streams a browser can't fetch itself, so the relay must: the addon asks for request headers a page may not set
 * (`behaviorHints.proxyHeaders`, which Stremio also routes through its proxy), or the link is plain http behind our https page.
 */
export function needsRelay(stream: Pick<Stream, "url" | "proxyHeaders">, pageProtocol: string = typeof location === "undefined" ? "https:" : location.protocol): boolean {
  if (!stream.url || !/^https?:\/\//i.test(stream.url)) return false;
  if (stream.proxyHeaders && Object.keys(stream.proxyHeaders).length > 0) return true;
  return pageProtocol === "https:" && /^http:\/\//i.test(stream.url);
}

/** The address the player should load for a stream, on the chosen route. */
export function playbackUrl(stream: Pick<Stream, "url" | "proxyHeaders" | "proxyResponseHeaders">, route: "direct" | "relay"): string {
  const url = stream.url as string;
  return route === "relay" ? buildRelayUrl(url, stream.proxyHeaders ?? {}, stream.proxyResponseHeaders ?? {}) : url;
}
