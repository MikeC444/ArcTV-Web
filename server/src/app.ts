import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { type ErrorRequestHandler, type Express, type NextFunction, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { z } from "zod";
import { addonProxyHandler, createAddonFetcher } from "./addonProxy.js";
import { createBackendClient, type BackendFetch } from "./backend.js";
import { createEpgService, EPG_SOURCES, type EpgService } from "./epg/epgService.js";
import type { AppConfig } from "./config.js";
import type { AppContext } from "./context.js";
import { ApiError, sendError } from "./errors.js";
import { createAuthRouter } from "./routes/auth.js";
import { createAdminRouter } from "./routes/admin.js";
import { createProfilesRouter } from "./routes/profiles.js";
import { createStreamRelay } from "./streamRelay.js";
import { createUserRouter } from "./routes/user.js";
import { createTmdbCast, IMDB_ID } from "./tmdbCast.js";
import { SessionManager } from "./session.js";

/**
 * Non-idempotent /api requests must (a) carry a custom header — which a cross-site
 * <form> or <img> cannot add, and which a cross-site fetch can only add after a CORS
 * preflight we never grant — and (b) come from our own origin. With SameSite=Lax
 * cookies this closes CSRF for the cookie-authenticated API.
 */
function csrfGuard(req: Request, _res: Response, next: NextFunction): void {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return next();
  if (req.headers["x-mangotv-client"] !== "web") return next(new ApiError(403, "forbidden", "Missing client header."));
  const site = req.headers["sec-fetch-site"];
  if (typeof site === "string" && site !== "same-origin" && site !== "none") return next(new ApiError(403, "forbidden", "Cross-site request blocked."));
  const origin = req.headers.origin;
  if (typeof origin === "string" && origin !== "null") {
    try {
      if (new URL(origin).host !== req.headers.host) return next(new ApiError(403, "forbidden", "Cross-site request blocked."));
    } catch {
      return next(new ApiError(403, "forbidden", "Bad origin."));
    }
  }
  next();
}

export interface PublicSupporter {
  name: string;
  /** A picture id (letters, digits and dashes) or null. */
  avatar: string | null;
  /** The month they joined, "2026-10", or null. */
  since: string | null;
}

/**
 * What the landing page is given: each supporter's display name (at most 24 characters), the picture id of their profile and the month they joined, at
 * most 500 of them. Anything else in the answer is dropped, and a picture id or month that is not the expected shape becomes null.
 */
export function cleanSupporters(json: unknown): { supporters: PublicSupporter[]; total: number } | null {
  const list = (json as { supporters?: unknown } | null)?.supporters;
  if (!Array.isArray(list)) return null;
  const supporters: PublicSupporter[] = [];
  for (const entry of list.slice(0, 500)) {
    const e = (entry ?? {}) as { name?: unknown; avatar?: unknown; since?: unknown };
    if (typeof e.name !== "string" || e.name.trim() === "") continue;
    supporters.push({
      name: e.name.trim().slice(0, 24),
      avatar: typeof e.avatar === "string" && /^[a-z0-9-]{1,32}$/.test(e.avatar) ? e.avatar : null,
      since: typeof e.since === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(e.since) ? e.since : null,
    });
  }
  const total = (json as { total?: unknown }).total;
  return { supporters, total: typeof total === "number" && total >= supporters.length ? Math.floor(total) : supporters.length };
}

function noStore(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader("Cache-Control", "no-store");
  next();
}

/**
 * A path that ends in one of these is a file (a missing one must 404). Anything else is a page address for the app — including player
 * links, whose ids contain dots ("/player/com.linvo.cinemeta/MOVIE/tt1/-1/-1/com.stremio.torrentio.addon%3A-123").
 */
const FILE_EXTENSION = /\.(?:m?js|css|map|json|webmanifest|txt|xml|ico|png|jpe?g|gif|webp|avif|svg|woff2?|ttf|otf|eot|mp[34]|webm|wasm)$/i;

function findStaticDir(config: AppConfig): string | undefined {
  const candidates = [config.staticDir, path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../client/dist")];
  return candidates.find((dir): dir is string => !!dir && fs.existsSync(path.join(dir, "index.html")));
}

export interface CreateAppOptions {
  backend?: BackendFetch;
  /** The TV-guide listings; tests pass one that reads from memory instead of the internet. */
  epg?: EpgService;
}

export function createApp(config: AppConfig, options: CreateAppOptions = {}): Express {
  const backend = options.backend ?? createBackendClient(config.apiUrl);
  const ctx: AppContext = { config, backend, sessions: new SessionManager(config, backend) };

  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", config.trustProxy > 0 ? config.trustProxy : false);
  // Once, on the first request that passed through a proxy: say whether TRUST_PROXY matches the proxies actually in front. A platform that puts a
  // CDN in front of its own proxy (Render does) sends TWO addresses; with TRUST_PROXY=1 the right-most — the CDN's, shared by many visitors — would
  // be taken for the visitor, and every rate limit (including "too many sign-in attempts") would be shared between strangers.
  let proxyChecked = false;
  app.use((req, _res, next) => {
    const forwarded = req.headers["x-forwarded-for"];
    if (!proxyChecked && typeof forwarded === "string" && forwarded.trim() !== "") {
      proxyChecked = true;
      const seen = forwarded.split(",").length;
      if (seen > config.trustProxy) {
        console.warn(`[proxy] A request arrived with ${seen} X-Forwarded-For address${seen === 1 ? "" : "es"} but TRUST_PROXY=${config.trustProxy}, so the address used for rate limits is probably not the visitor's (it may be a proxy's, shared by many visitors). If people are told "too many attempts" without doing anything, set TRUST_PROXY=${Math.min(seen, 3)}.`);
      } else {
        console.log(`[proxy] X-Forwarded-For has ${seen} address${seen === 1 ? "" : "es"} and TRUST_PROXY=${config.trustProxy}: visitor addresses are read correctly.`);
      }
    }
    next();
  });

  app.use(
    helmet({
      // Posters, backdrops, addon JSON and media legitimately come from arbitrary third-party hosts.
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          "default-src": ["'self'"],
          "base-uri": ["'self'"],
          "object-src": ["'none'"],
          "frame-ancestors": ["'none'"],
          "form-action": ["'self'"],
          "script-src": ["'self'"],
          "style-src": ["'self'", "'unsafe-inline'"],
          "img-src": ["'self'", "data:", "blob:", "https:", "http:"],
          "media-src": ["'self'", "blob:", "https:", "http:"],
          "connect-src": ["'self'", "https:", "http:", ...config.extraConnectSrc],
          "font-src": ["'self'", "data:"],
          "worker-src": ["'self'", "blob:"],
          "manifest-src": ["'self'"],
          ...(config.isProduction ? { "upgrade-insecure-requests": [] } : {}),
        },
      },
      hsts: config.isProduction ? { maxAge: 31_536_000, includeSubDomains: true } : false,
      crossOriginEmbedderPolicy: false, // would block cross-origin posters/media that don't send CORP
      // cross-origin requests (video, images, addons) carry no Referer at all — like the TV app, and hosts that dislike embedding never see our address.
      // (Sending the origin like Stremio Web does was tried for a stream that wouldn't start and made no difference, so the stricter setting stays.)
      referrerPolicy: { policy: "same-origin" },
    }),
  );

  // ── API ──────────────────────────────────────────────────────────────────────
  const api = express.Router();
  api.use(noStore);
  // `GET /api/health` answers for this server alone. `GET /api/health?deep=1` also asks the Arc TV service (which in turn wakes its database),
  // so ONE uptime monitor pinging it keeps a free-tier backend awake as well. It always answers 200 (this server is up); the body says how the
  // backend is. The backend is asked at most once a minute however often this is called, so it can't be used to hammer it.
  let backendCheck: { at: number; state: "up" | "down" } | null = null;
  api.get("/health", async (req, res) => {
    if (req.query.deep === undefined) {
      res.json({ status: "ok" });
      return;
    }
    if (!backendCheck || Date.now() - backendCheck.at > 60_000) {
      let state: "up" | "down" = "down";
      try {
        const answer = await backend({ method: "GET", path: "/health", timeoutMs: 25_000 }); // a sleeping free-tier backend can take most of a minute to wake
        state = answer.status === 200 ? "up" : "down";
      } catch {
        /* unreachable → down */
      }
      backendCheck = { at: Date.now(), state };
    }
    res.json({ status: "ok", backend: backendCheck.state });
  });
  // The supporters board, for the landing page (another site, so the answer is open to any origin: it is public and read-only). Asked of the Arc TV
  // service at most once a minute (so a member who switches it on shows up within about a minute), and the last good answer is kept if it can't be reached; with none yet it answers 503 so the page can say it couldn't load.
  const SUPPORTERS_TTL_MS = 60_000;
  let supporters: { at: number; body: { supporters: PublicSupporter[]; total: number } } | null = null;
  api.get("/supporters", async (_req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Cache-Control", "public, max-age=60");
    if (!supporters || Date.now() - supporters.at > SUPPORTERS_TTL_MS) {
      try {
        const answer = await backend({ method: "GET", path: "/supporters", timeoutMs: 25_000 });
        const clean = answer.status === 200 ? cleanSupporters(answer.json) : null;
        if (clean) supporters = { at: Date.now(), body: clean };
      } catch {
        /* unreachable: keep what we have */
      }
    }
    if (!supporters) {
      res.set("Cache-Control", "no-store");
      res.status(503).json({ supporters: [], total: 0 });
      return;
    }
    res.json(supporters.body);
  });
  api.use(csrfGuard);
  api.use(express.json({ limit: "100kb" }));

  const perClient = (limit: number) =>
    rateLimit({
      windowMs: 60_000,
      limit,
      standardHeaders: true,
      legacyHeaders: false,
      handler: (_req, res) => sendError(res, new ApiError(429, "rate_limited", "Too many requests. Please slow down.", 30)),
    });

  api.use("/auth", createAuthRouter(ctx));
  api.use("/profiles", perClient(60), createProfilesRouter(ctx));
  api.use("/user", perClient(240), createUserRouter(ctx));
  api.use("/admin", perClient(120), createAdminRouter(ctx));

  // Cast photos / characters from TMDB for titles whose addon sends names only. Open to visitors (browsing is); off without TMDB_API_KEY.
  const tmdbCast = createTmdbCast(config.tmdbKey);
  api.get("/cast", perClient(120), async (req, res) => {
    const imdbId = String(req.query.imdbId ?? "");
    const type = req.query.type === "TV_SHOW" ? "TV_SHOW" : "MOVIE";
    if (!tmdbCast.enabled || !IMDB_ID.test(imdbId)) {
      res.json({ cast: [] });
      return;
    }
    try {
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.json({ cast: await tmdbCast.cast(imdbId, type) });
    } catch {
      res.removeHeader("Cache-Control");
      res.json({ cast: [] }); // a failed lookup just means no photos this time
    }
  });

  // TV guide for the Live TV tab: public XMLTV listings per country, matched to the addon's channel names (see epg/epgService.ts).
  const epg = options.epg ?? createEpgService();
  api.get("/epg/sources", perClient(120), (_req, res) => {
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.json({ sources: EPG_SOURCES });
  });
  const guideBody = z.object({
    source: z.string().regex(/^[A-Z0-9_]{2,16}$/),
    channels: z.array(z.object({ key: z.string().min(1).max(300), name: z.string().min(1).max(200) })).min(1).max(300),
    from: z.number().int().optional(),
    to: z.number().int().optional(),
  });
  api.post("/epg/guide", perClient(60), async (req, res, next) => {
    try {
      if (!ctx.sessions.read(req)) throw new ApiError(401, "unauthorized", "Sign in to continue.");
      const parsed = guideBody.safeParse(req.body);
      if (!parsed.success || !EPG_SOURCES.some((s) => s.id === parsed.data.source)) throw new ApiError(400, "bad_request", "That guide request isn't valid.");
      res.removeHeader("Cache-Control");
      try {
        res.json(await epg.guide(parsed.data.source, parsed.data.channels, parsed.data.from, parsed.data.to));
      } catch {
        throw new ApiError(502, "upstream_error", "The TV guide couldn't be loaded right now. Try again in a little while.");
      }
    } catch (error) {
      next(error);
    }
  });

  const fetchAddonJson = createAddonFetcher(config);
  api.get("/addon-proxy", perClient(120), async (req, res, next) => {
    try {
      if (!ctx.sessions.read(req)) throw new ApiError(401, "unauthorized", "Sign in to continue.");
      res.removeHeader("Cache-Control");
      await addonProxyHandler(fetchAddonJson)(req, res);
    } catch (error) {
      next(error);
    }
  });

  // Stream relay: media elements and hls.js fetch these same-origin, so the session cookie authenticates them.
  const relayStream = createStreamRelay(config);
  api.get("/relay/*rest", perClient(1200), async (req, res, next) => {
    try {
      const session = ctx.sessions.read(req);
      if (!session) throw new ApiError(401, "unauthorized", "Sign in to continue.");
      await relayStream(req, res, session.user.id);
    } catch (error) {
      next(error);
    }
  });

  api.use((_req, _res, next) => next(new ApiError(404, "not_found", "Not found")));
  app.use("/api", api);

  // ── Static SPA (production) ─────────────────────────────────────────────────
  const staticDir = findStaticDir(config);
  if (staticDir) {
    // The profile pictures are public, and the landing page (another site) shows them on the supporters page, so they may be used from anywhere;
    // helmet's default would keep them to this site only.
    app.use("/avatars", (_req, res, next) => {
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      next();
    });
    app.use("/assets", express.static(path.join(staticDir, "assets"), { immutable: true, maxAge: "1y", index: false }));
    app.use(express.static(staticDir, { index: false, maxAge: "1h" }));
    app.get(/^(?!\/api\/).*/, (req, res, next) => {
      // client-side routes only: a missing asset / file must 404 (never HTML posing as a script or image)
      if (!req.accepts("html") || req.path.startsWith("/assets/") || FILE_EXTENSION.test(req.path)) return next();
      res.setHeader("Cache-Control", "no-cache");
      res.sendFile(path.join(staticDir, "index.html"));
    });
  }

  const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
    if (res.headersSent) return;
    if (error instanceof ApiError) return sendError(res, error);
    const status = (error as { status?: number }).status;
    if (status === 400 || (error as { type?: string }).type === "entity.parse.failed") {
      return sendError(res, new ApiError(400, "bad_request", "The request body was not valid JSON."));
    }
    if (status === 413) return sendError(res, new ApiError(413, "bad_request", "The request body is too large."));
    console.error(`[${req.method} ${req.path}]`, error);
    sendError(res, new ApiError(500, "upstream_error", "Something went wrong on our side."));
  };
  app.use(errorHandler);

  return app;
}
