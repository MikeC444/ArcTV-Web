import { isIP } from "node:net";
import { pipeline } from "node:stream/promises";
import type { Request, Response } from "express";
import { Agent, request as undiciRequest } from "undici";
import type { AppConfig } from "./config.js";
import { ApiError } from "./errors.js";
import { guardedLookup, isPrivateAddress } from "./netGuard.js";

/**
 * Stream relay — the web counterpart of the Stremio streaming server's `/proxy/` route.
 *
 * Some stream hosts can't be played straight from a browser: they need request headers a page may not set (the addon's
 * `behaviorHints.proxyHeaders`), they're plain `http://` behind our https page (mixed content), or they simply don't deliver
 * bytes to a browser-style request. The web server fetches such a stream itself — like a native player would — and passes
 * the bytes through, honouring Range so seeking works.
 *
 * URL scheme (same shape as Stremio's, so relative paths inside HLS playlists stay on the relay):
 *   /api/relay/d=<origin>&h=<Header:Value>&r=<Header:Value>/<path>?<query>
 *
 * This is deliberately NOT an open proxy:
 *  · signed-in sessions only, same-origin requests only (Sec-Fetch-Site), GET/HEAD only, http(s) only, no credentials in the URL
 *  · destination checked at connect time (DNS-rebinding safe) and on every redirect hop; private / loopback / metadata
 *    ranges are refused, and so is this server itself
 *  · only media is relayed — anything that isn't video/audio/octet-stream/HLS/DASH/WebVTT is refused, and what is relayed
 *    is served `nosniff` under a sandboxing CSP, so a hostile host can't get a page to run in our origin
 *  · addon-supplied request headers go to the first origin only (never to a redirect target), hop-by-hop headers are dropped
 *  · the upstream's cookies, disposition and caching headers are never passed on; the link is never logged
 *  · a few concurrent streams per account, and the whole feature can be switched off with STREAM_RELAY=0
 */

const RELAY_PREFIX = "/api/relay/";
const MAX_REDIRECTS = 6;
const MAX_TARGET_LENGTH = 4096;
const MAX_CUSTOM_HEADERS = 16;
const MAX_CONCURRENT_PER_USER = 6;
const USER_AGENT = "MangoTV-Web/0.1 (stream relay)";

const TOKEN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const FORBIDDEN_REQUEST_HEADERS = new Set([
  "host", "content-length", "transfer-encoding", "connection", "keep-alive", "upgrade", "te", "trailer", "expect", "proxy-authorization",
  "proxy-connection", "range", "if-range", "accept-encoding", "forwarded", "via", "x-forwarded-for", "x-forwarded-host", "x-forwarded-proto", "x-real-ip",
]);
const ALLOWED_RESPONSE_OVERRIDES = new Set(["content-type"]);
const MEDIA_TYPE = /^(video|audio)\//;
const MEDIA_TYPES = new Set([
  "application/octet-stream", "binary/octet-stream", "application/vnd.apple.mpegurl", "application/x-mpegurl", "audio/mpegurl", "application/dash+xml",
  "application/mp4", "application/ogg", "application/x-matroska", "text/vtt", "application/force-download",
]);
const EXTENSION_TYPES: Record<string, string> = { mkv: "video/x-matroska", mp4: "video/mp4", m4v: "video/mp4", webm: "video/webm", mov: "video/quicktime", avi: "video/x-msvideo", ts: "video/mp2t", m3u8: "application/vnd.apple.mpegurl", mpd: "application/dash+xml", vtt: "text/vtt", m4s: "video/mp4" };

export interface RelayTarget {
  url: URL;
  requestHeaders: Array<[string, string]>;
  responseHeaders: Array<[string, string]>;
}

export function validateUrl(url: URL, allowPrivate: boolean, ownHost: string | undefined): URL {
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new ApiError(400, "bad_request", "Only http(s) streams can be relayed.");
  if (url.username || url.password) throw new ApiError(400, "bad_request", "Stream URLs must not contain credentials.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (!allowPrivate && isIP(host) && isPrivateAddress(host)) throw new ApiError(400, "bad_request", "That address isn't reachable from the web server.");
  if (ownHost && url.host.toLowerCase() === ownHost.toLowerCase()) throw new ApiError(400, "bad_request", "A stream can't be relayed from this site to itself.");
  return url;
}

/** Turns the request path back into the upstream URL plus the addon-requested headers. Exported for tests. */
export function parseRelayPath(originalUrl: string, options: { allowPrivateHosts: boolean; ownHost?: string }): RelayTarget {
  if (!originalUrl.startsWith(RELAY_PREFIX) || originalUrl.length > MAX_TARGET_LENGTH) throw new ApiError(400, "bad_request", "Not a valid relay address.");
  const afterPrefix = originalUrl.slice(RELAY_PREFIX.length);
  const queryStart = afterPrefix.indexOf("?");
  const pathPart = queryStart === -1 ? afterPrefix : afterPrefix.slice(0, queryStart);
  const search = queryStart === -1 ? "" : afterPrefix.slice(queryStart);
  const slash = pathPart.indexOf("/");
  const optionsSegment = slash === -1 ? pathPart : pathPart.slice(0, slash);
  const rest = slash === -1 ? "/" : pathPart.slice(slash);

  const params = new URLSearchParams(optionsSegment);
  const origin = params.get("d");
  if (!origin) throw new ApiError(400, "bad_request", "Not a valid relay address.");
  let originUrl: URL;
  try {
    originUrl = new URL(origin);
  } catch {
    throw new ApiError(400, "bad_request", "That doesn't look like a valid stream address.");
  }
  if (originUrl.origin !== origin && `${originUrl.origin}/` !== origin) throw new ApiError(400, "bad_request", "Not a valid relay address.");

  // string concatenation, not URL resolution, so a path like "//evil.example/x" can never change the host
  let url: URL;
  try {
    url = new URL(`${originUrl.origin}${rest}${search}`);
  } catch {
    throw new ApiError(400, "bad_request", "That doesn't look like a valid stream address.");
  }
  if (url.origin !== originUrl.origin) throw new ApiError(400, "bad_request", "Not a valid relay address.");
  validateUrl(url, options.allowPrivateHosts, options.ownHost);

  const pairs = (name: string): Array<[string, string]> =>
    params.getAll(name).map((entry) => {
      const colon = entry.indexOf(":");
      if (colon < 1) throw new ApiError(400, "bad_request", "Bad relay header.");
      return [entry.slice(0, colon).trim().toLowerCase(), entry.slice(colon + 1).trim()] as [string, string];
    });
  const requestHeaders = pairs("h");
  const responseHeaders = pairs("r");
  if (requestHeaders.length > MAX_CUSTOM_HEADERS || responseHeaders.length > MAX_CUSTOM_HEADERS) throw new ApiError(400, "bad_request", "Too many relay headers.");
  for (const [name, value] of requestHeaders) {
    if (!TOKEN.test(name) || FORBIDDEN_REQUEST_HEADERS.has(name) || name.startsWith("proxy-") || name.startsWith("sec-") || /[\r\n]/.test(value) || value.length > 2048) {
      throw new ApiError(400, "bad_request", `The header "${name}" can't be relayed.`);
    }
  }
  for (const [name, value] of responseHeaders) {
    if (!ALLOWED_RESPONSE_OVERRIDES.has(name) || /[\r\n]/.test(value) || value.length > 256) throw new ApiError(400, "bad_request", `The response header "${name}" can't be overridden.`);
  }
  return { url, requestHeaders, responseHeaders };
}

function mediaTypeOf(contentType: string | undefined, url: URL): string | null {
  const declared = (contentType ?? "").split(";")[0]!.trim().toLowerCase();
  if (declared && (MEDIA_TYPE.test(declared) || MEDIA_TYPES.has(declared))) return declared;
  if (declared) return null; // text/html, application/json … are not media
  const ext = /\.([a-z0-9]{2,4})$/i.exec(url.pathname)?.[1]?.toLowerCase();
  return (ext && EXTENSION_TYPES[ext]) || "application/octet-stream";
}

const SAFE_RANGE = /^bytes=\d*-\d*$/;
const header = (value: string | string[] | undefined): string | undefined => (Array.isArray(value) ? value[0] : value);

/**
 * When the stream host refuses the relay, say WHO refused and how — the signed-in viewer is the one trying to play it, and "HTTP 403"
 * alone can't tell a debrid service's IP rule from a CDN's bot protection from a dead link. Host name only (never the path, which can
 * carry keys), a few well-known headers, and the first words of a text/JSON error body with any link in it removed.
 */
async function describeRefusal(upstream: Awaited<ReturnType<typeof undiciRequest>>, url: URL, hops: number, status: number): Promise<string> {
  const facts: string[] = [`from ${url.host}${hops ? ` after ${hops} redirect${hops > 1 ? "s" : ""}` : ""}`];
  const server = header(upstream.headers.server)?.replace(/[^\w ./()-]/g, "").slice(0, 40).trim();
  if (server) facts.push(`server: ${server}`);
  if (/challenge/i.test(header(upstream.headers["cf-mitigated"]) ?? "")) facts.push("a bot check was demanded");
  const type = header(upstream.headers["content-type"]) ?? "";
  let said = "";
  if (/^(text\/|application\/(json|problem\+json|xml))/i.test(type)) {
    let timer: NodeJS.Timeout | undefined;
    const chunks: Buffer[] = [];
    let size = 0;
    const read = (async () => {
      for await (const chunk of upstream.body) {
        chunks.push(chunk as Buffer);
        size += (chunk as Buffer).length;
        if (size >= 400) break;
      }
    })().catch(() => undefined);
    await Promise.race([read, new Promise<void>((resolve) => (timer = setTimeout(resolve, 2_000)))]);
    clearTimeout(timer);
    upstream.body.destroy();
    said = Buffer.concat(chunks).toString("utf8").replace(/<[^>]*>/g, " ").replace(/https?:\/\/\S+/gi, "<link>").replace(/[^\x20-\x7e]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
  } else {
    void upstream.body.dump?.().catch(() => undefined);
  }
  if (said) facts.push(`it said: "${said}"`);
  return `The stream host answered HTTP ${status} (${facts.join("; ")}).`;
}

export function createStreamRelay(config: Pick<AppConfig, "allowPrivateAddonHosts" | "streamRelay">) {
  const agent = new Agent({
    connect: { lookup: guardedLookup(config.allowPrivateAddonHosts) as never, timeout: 10_000 },
    headersTimeout: 30_000, // a debrid link can take a while to prepare before it answers
    bodyTimeout: 60_000, // idle time between chunks
  });
  const active = new Map<string, number>();

  return async function relay(req: Request, res: Response, userId: string): Promise<void> {
    if (!config.streamRelay) throw new ApiError(404, "relay_disabled", "Stream relaying is turned off on this server.");
    if (req.method !== "GET" && req.method !== "HEAD") throw new ApiError(405, "bad_request", "Method not allowed.");
    // A <video>, hls.js or fetch from this site is "same-origin"; a link on another site (which would make this server download
    // something on a signed-in visitor's behalf) is not. Clients that send no Fetch Metadata at all (curl, tests) are unaffected.
    const site = header(req.headers["sec-fetch-site"]);
    if (site && site !== "same-origin") throw new ApiError(403, "forbidden", "Stream relay addresses only work from this site.");
    const target = parseRelayPath(req.originalUrl, { allowPrivateHosts: config.allowPrivateAddonHosts, ownHost: req.headers.host });

    const count = active.get(userId) ?? 0;
    if (count >= MAX_CONCURRENT_PER_USER) throw new ApiError(429, "rate_limited", "Too many streams are open at once. Close one and try again.", 10);
    active.set(userId, count + 1);
    const controller = new AbortController();
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      const left = (active.get(userId) ?? 1) - 1;
      if (left <= 0) active.delete(userId);
      else active.set(userId, left);
    };
    res.on("close", () => {
      controller.abort(); // the player went away → stop downloading
      release();
    });

    try {
      const range = header(req.headers.range);
      if (range && !SAFE_RANGE.test(range)) throw new ApiError(416, "bad_request", "Unsupported Range header.");
      const ifRange = header(req.headers["if-range"]);

      let url = target.url;
      let hops = 0;
      let sendCustom = true;
      let upstream: Awaited<ReturnType<typeof undiciRequest>> | null = null;
      for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
        const headers: Record<string, string> = { "user-agent": USER_AGENT, accept: "*/*", "accept-encoding": "identity" };
        if (sendCustom) for (const [name, value] of target.requestHeaders) headers[name] = value;
        if (range) headers.range = range;
        if (range && ifRange) headers["if-range"] = ifRange;
        let response: Awaited<ReturnType<typeof undiciRequest>>;
        try {
          response = await undiciRequest(url, { method: req.method === "HEAD" ? "HEAD" : "GET", headers, dispatcher: agent, signal: controller.signal });
        } catch {
          throw new ApiError(502, "upstream_error", "The stream host couldn't be reached from the web server.");
        }
        const location = header(response.headers.location);
        if (response.statusCode >= 300 && response.statusCode < 400 && location) {
          void response.body.dump?.().catch(() => undefined);
          let next: URL;
          try {
            next = new URL(location, url);
          } catch {
            throw new ApiError(502, "upstream_error", "The stream host sent a bad redirect.");
          }
          validateUrl(next, config.allowPrivateAddonHosts, req.headers.host);
          if (next.origin !== url.origin) sendCustom = false; // never hand the addon's headers to a different site
          url = next;
          hops = hop + 1;
          continue;
        }
        upstream = response;
        break;
      }
      if (!upstream) throw new ApiError(502, "upstream_error", "The stream host redirected too many times.");

      const status = upstream.statusCode;
      if (status === 304 || status === 416) {
        res.status(status);
        res.setHeader("Cache-Control", "private, no-store");
        const contentRange = header(upstream.headers["content-range"]);
        if (contentRange) res.setHeader("Content-Range", contentRange);
        void upstream.body.dump?.().catch(() => undefined);
        res.end();
        return;
      }
      if (status < 200 || status >= 300) {
        throw new ApiError(502, "upstream_error", await describeRefusal(upstream, url, hops, status));
      }

      const override = target.responseHeaders.find(([name]) => name === "content-type")?.[1];
      const contentType = mediaTypeOf(override ?? header(upstream.headers["content-type"]), url);
      if (!contentType) {
        void upstream.body.dump?.().catch(() => undefined);
        throw new ApiError(502, "upstream_error", "The stream host sent something that isn't video.");
      }

      res.status(status);
      res.setHeader("Content-Type", override ? contentType : (header(upstream.headers["content-type"]) ?? contentType));
      for (const name of ["content-length", "content-range", "last-modified", "etag"] as const) {
        const value = header(upstream.headers[name]);
        if (value) res.setHeader(name, value);
      }
      res.setHeader("Accept-Ranges", status === 206 || /bytes/i.test(header(upstream.headers["accept-ranges"]) ?? "") ? "bytes" : "none");
      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
      res.setHeader("Content-Disposition", "inline");

      if (req.method === "HEAD") {
        void upstream.body.dump?.().catch(() => undefined);
        res.end();
        return;
      }
      await pipeline(upstream.body, res);
    } catch (error) {
      if (res.headersSent) {
        res.destroy(); // mid-stream failure: the player sees a dropped connection and can retry
        return;
      }
      throw error;
    } finally {
      release();
    }
  };
}
