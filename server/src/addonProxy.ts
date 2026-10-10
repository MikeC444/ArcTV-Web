import type { Request, Response } from "express";
import { Agent, fetch as undiciFetch } from "undici";
import { isIP } from "node:net";
import type { AppConfig } from "./config.js";
import { ApiError } from "./errors.js";
import { guardedLookup, isPrivateAddress } from "./netGuard.js";

/**
 * Fallback for Stremio addons that don't send CORS headers (the Stremio addon
 * SDK does by default, so this is the exception) — the browser asks us to GET
 * the manifest/catalog/meta/stream JSON instead. It is NOT a general proxy:
 *  · signed-in sessions only, GET only, JSON only, ≤ 2 MB, ≤ 15 s
 *  · http/https only, no embedded credentials
 *  · destination re-validated at connect time (DNS-rebinding safe), every redirect hop re-checked
 *  · never used for media segments
 */
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 3;

export function createAddonFetcher(config: Pick<AppConfig, "allowPrivateAddonHosts">) {
  const agent = new Agent({
    connect: { lookup: guardedLookup(config.allowPrivateAddonHosts) as never },
    headersTimeout: 15_000,
    bodyTimeout: 15_000,
  });

  function validate(raw: string): URL {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      throw new ApiError(400, "bad_request", "That doesn't look like a valid URL.");
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new ApiError(400, "bad_request", "Only http(s) addon URLs are supported.");
    if (url.username || url.password) throw new ApiError(400, "bad_request", "Addon URLs must not contain credentials.");
    const host = url.hostname.replace(/^\[|\]$/g, "");
    if (!config.allowPrivateAddonHosts && isIP(host) && isPrivateAddress(host)) {
      throw new ApiError(400, "bad_request", "That address isn't reachable from the web server.");
    }
    return url;
  }

  return async function fetchJson(raw: string): Promise<unknown> {
    let url = validate(raw);
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      let response;
      try {
        response = await undiciFetch(url, {
          method: "GET",
          redirect: "manual",
          dispatcher: agent,
          headers: { Accept: "application/json", "User-Agent": "ArcTV-Web/0.1" },
          signal: AbortSignal.timeout(15_000),
        });
      } catch {
        throw new ApiError(502, "upstream_error", "The addon server couldn't be reached from the web server.");
      }
      if (response.status >= 300 && response.status < 400 && response.headers.get("location")) {
        url = validate(new URL(response.headers.get("location") as string, url).toString());
        void response.body?.cancel();
        continue;
      }
      if (!response.ok) {
        void response.body?.cancel();
        throw new ApiError(502, "upstream_error", `The addon server answered HTTP ${response.status}.`);
      }
      const declared = Number(response.headers.get("content-length") ?? 0);
      if (declared > MAX_BYTES) throw new ApiError(502, "upstream_error", "The addon response is too large.");
      const reader = response.body?.getReader();
      if (!reader) throw new ApiError(502, "upstream_error", "The addon returned an empty response.");
      const chunks: Uint8Array[] = [];
      let total = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_BYTES) {
          void reader.cancel();
          throw new ApiError(502, "upstream_error", "The addon response is too large.");
        }
        chunks.push(value);
      }
      try {
        return JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch {
        throw new ApiError(502, "upstream_error", "The addon didn't return valid JSON.");
      }
    }
    throw new ApiError(502, "upstream_error", "The addon redirected too many times.");
  };
}

export function addonProxyHandler(fetchJson: ReturnType<typeof createAddonFetcher>) {
  return async (req: Request, res: Response): Promise<void> => {
    const target = typeof req.query.url === "string" ? req.query.url : "";
    if (!target || target.length > 2048) throw new ApiError(400, "bad_request", "Missing or oversized url.");
    const json = await fetchJson(target);
    res.setHeader("Cache-Control", "private, max-age=60");
    res.json(json);
  };
}
