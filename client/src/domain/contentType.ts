/*
 * getContentType() is adapted from stremio-video — src/HTMLVideo/getContentType.js (MIT, Copyright (c) Smart Code OOD).
 * The licence text is in THIRD_PARTY_NOTICES.md. The wait limit, abort handling and engineForContentType() are ours.
 */
import type { EngineKind } from "./playability";
import type { Stream } from "./types";

const HLS_TYPES = new Set(["application/vnd.apple.mpegurl", "application/x-mpegurl", "audio/mpegurl", "audio/x-mpegurl"]);
const DASH_TYPES = new Set(["application/dash+xml"]);

/** Bare, lower-case media type: "Video/MP4; charset=x" → "video/mp4". */
const bare = (contentType: string | null | undefined): string | null => {
  const value = (contentType ?? "").split(";")[0]?.trim().toLowerCase();
  return value && value.length <= 100 && /^[\w.+-]+\/[\w.+-]+$/.test(value) ? value : null;
};

/**
 * What the stream really is, as its server says — not what its address looks like. A debrid "resolve" link ends in `.mkv` and
 * then redirects to an HLS playlist for browsers, so the address alone picks the wrong player. Stremio Web asks first (a HEAD
 * request, redirects followed) and only then hands the address to the video element; it also uses the addon's own
 * `proxyHeaders.response["content-type"]` when there is one. Returns null when the server can't be read (CORS, HEAD not
 * allowed, too slow) — the caller then falls back to the address, exactly as Stremio does.
 */
export async function getContentType(
  stream: Pick<Stream, "proxyResponseHeaders">,
  url: string,
  options: { timeoutMs?: number; signal?: AbortSignal; fetchImpl?: typeof fetch } = {},
): Promise<string | null> {
  const declared = Object.entries(stream.proxyResponseHeaders ?? {}).find(([name]) => name.toLowerCase() === "content-type")?.[1];
  if (declared) return bare(declared);

  const doFetch = options.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  options.signal?.addEventListener("abort", onAbort);
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 5_000);
  try {
    const response = await doFetch(url, { method: "HEAD", credentials: "omit", signal: controller.signal });
    return response.ok ? bare(response.headers.get("content-type")) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", onAbort);
  }
}

/** The address decides first (.m3u8, .mpd); otherwise the server's content type can reveal HLS / DASH behind a file-like address. */
export function engineForContentType(contentType: string | null, fromAddress: EngineKind): EngineKind {
  if (fromAddress !== "native" || !contentType) return fromAddress;
  if (HLS_TYPES.has(contentType)) return "hls";
  if (DASH_TYPES.has(contentType)) return "dash";
  return fromAddress;
}

/** For the technical details: the type as reported, nothing else (never the address). */
export const describeContentType = (contentType: string | null): string => `content-type ${contentType ?? "not readable"}`;
