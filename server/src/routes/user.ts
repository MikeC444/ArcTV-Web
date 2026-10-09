import { Router } from "express";
import { authedBackendRequest, type AppContext } from "../context.js";
import { ApiError, fromBackendStatus } from "../errors.js";
import { backendMessage } from "../backend.js";

/**
 * The ONLY paths of the existing API that the web client may reach. Anything not
 * listed here (e.g. /auth/sessions, /activate, /health, future admin routes) is
 * a 404 — the proxy is an allow-list, not a pass-through.
 */
const ALLOWED: ReadonlyArray<readonly [method: string, path: RegExp]> = [
  ["GET", /^\/me$/],
  ["GET", /^\/settings$/],
  ["PUT", /^\/settings$/],
  ["GET", /^\/watchlist$/],
  ["POST", /^\/watchlist$/],
  ["DELETE", /^\/watchlist$/],
  ["GET", /^\/feedback$/],
  ["POST", /^\/feedback$/],
  ["DELETE", /^\/feedback$/],
  // titles removed from "Picked for you", so a removal follows the account to every device
  ["GET", /^\/picked-dismissals$/],
  ["POST", /^\/picked-dismissals$/],
  ["POST", /^\/watch-progress$/],
  ["GET", /^\/continue-watching$/],
  ["DELETE", /^\/continue-watching$/], // taking a title out of Continue Watching without marking it watched
  ["GET", /^\/history$/],
  ["GET", /^\/addons$/],
  ["POST", /^\/addons$/],
  ["DELETE", /^\/addons$/],
  ["GET", /^\/trailer$/],
  ["GET", /^\/release-date$/],
  // ArcTV Plus: whether this account has it, starting a Stripe checkout for a plan, and cancelling a subscription at the end of its period.
  ["GET", /^\/plus$/],
  ["POST", /^\/plus\/checkout$/],
  ["POST", /^\/plus\/cancel$/],
];

/** Lookups against TMDB are not user-specific, so one answer can serve everyone and spare the shared rate limit. */
const CACHEABLE = /^\/(trailer|release-date)$/;
const CACHE_TTL_MS = 24 * 3600_000;
const CACHE_MAX = 2000;

export function createUserRouter(ctx: AppContext): Router {
  const router = Router();
  const cache = new Map<string, { until: number; json: unknown }>();

  router.use(async (req, res) => {
    const method = req.method.toUpperCase();
    if (!ALLOWED.some(([m, re]) => m === method && re.test(req.path))) {
      throw new ApiError(404, "not_found", "Not found");
    }
    const query = req.url.includes("?") ? req.url.slice(req.url.indexOf("?") + 1) : "";
    if (query.length > 4096) throw new ApiError(400, "bad_request", "Query too long.");
    if ((method === "POST" || method === "PUT") && (typeof req.body !== "object" || req.body === null || Array.isArray(req.body))) {
      throw new ApiError(400, "bad_request", "Expected a JSON object body.");
    }

    const cacheKey = CACHEABLE.test(req.path) ? `${req.path}?${query}` : null;
    if (cacheKey) {
      // Still requires a valid session — the cache only skips the *upstream* call.
      if (!ctx.sessions.read(req)) throw new ApiError(401, "unauthorized", "Sign in to continue.");
      const hit = cache.get(cacheKey);
      if (hit && hit.until > Date.now()) {
        res.json(hit.json);
        return;
      }
    }

    const response = await authedBackendRequest(ctx, req, res, {
      method: method as "GET" | "POST" | "PUT" | "DELETE",
      path: `/user${req.path}`,
      query,
      body: method === "POST" || method === "PUT" ? req.body : undefined,
    });

    if (response.status >= 400) throw fromBackendStatus(response.status, backendMessage(response.json), response.retryAfter);
    if (cacheKey && response.status === 200) {
      if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
      cache.set(cacheKey, { until: Date.now() + CACHE_TTL_MS, json: response.json });
    }
    res.status(response.status);
    if (response.json === undefined) res.end();
    else res.json(response.json);
  });

  return router;
}
