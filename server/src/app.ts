import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { type ErrorRequestHandler, type Express, type NextFunction, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { addonProxyHandler, createAddonFetcher } from "./addonProxy.js";
import { createBackendClient, type BackendFetch } from "./backend.js";
import type { AppConfig } from "./config.js";
import type { AppContext } from "./context.js";
import { ApiError, sendError } from "./errors.js";
import { createAuthRouter } from "./routes/auth.js";
import { createUserRouter } from "./routes/user.js";
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

function noStore(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader("Cache-Control", "no-store");
  next();
}

function findStaticDir(config: AppConfig): string | undefined {
  const candidates = [config.staticDir, path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../client/dist")];
  return candidates.find((dir): dir is string => !!dir && fs.existsSync(path.join(dir, "index.html")));
}

export interface CreateAppOptions {
  backend?: BackendFetch;
}

export function createApp(config: AppConfig, options: CreateAppOptions = {}): Express {
  const backend = options.backend ?? createBackendClient(config.apiUrl);
  const ctx: AppContext = { config, backend, sessions: new SessionManager(config, backend) };

  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", config.trustProxy ? 1 : false);

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
      referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    }),
  );

  // ── API ──────────────────────────────────────────────────────────────────────
  const api = express.Router();
  api.use(noStore);
  api.get("/health", (_req, res) => {
    res.json({ status: "ok" });
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
  api.use("/user", perClient(240), createUserRouter(ctx));

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

  api.use((_req, _res, next) => next(new ApiError(404, "not_found", "Not found")));
  app.use("/api", api);

  // ── Static SPA (production) ─────────────────────────────────────────────────
  const staticDir = findStaticDir(config);
  if (staticDir) {
    app.use("/assets", express.static(path.join(staticDir, "assets"), { immutable: true, maxAge: "1y", index: false }));
    app.use(express.static(staticDir, { index: false, maxAge: "1h" }));
    app.get(/^(?!\/api\/).*/, (req, res, next) => {
      if (!req.accepts("html")) return next();
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
