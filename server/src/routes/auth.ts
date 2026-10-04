import { Router, type Request } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { backendMessage } from "../backend.js";
import { authedBackendRequest, type AppContext } from "../context.js";
import { ApiError, fromBackendStatus, sendError } from "../errors.js";
import { sessionFromTokenResponse } from "../session.js";

const email = z.string().trim().toLowerCase().email("Enter a valid email address.").max(320);
const password = z.string().min(1, "Enter your password.").max(256);
const loginBody = z.object({ email, password }).strict();
const registerBody = z
  .object({ email, password: z.string().min(8, "Password must be at least 8 characters.").max(256), displayName: z.string().trim().min(1).max(100).optional() })
  .strict();
const qrStatusQuery = z.object({ token: z.string().min(16).max(256) });

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new ApiError(400, "validation", result.error.issues.map((i) => i.message).join(" "));
  return result.data;
}

/** "Chrome on Windows (Web)" — shown to the user under their signed-in devices. Purely cosmetic. */
export function deviceNameFromUserAgent(userAgent: string | undefined): string {
  const ua = userAgent ?? "";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera/.test(ua)
      ? "Opera"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Chrome\//.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : "Browser";
  const os = /Windows/.test(ua)
    ? "Windows"
    : /Android/.test(ua)
      ? "Android"
      : /iPhone|iPad|iPod/.test(ua)
        ? "iOS"
        : /Mac OS X|Macintosh/.test(ua)
          ? "macOS"
          : /CrOS/.test(ua)
            ? "ChromeOS"
            : /Linux/.test(ua)
              ? "Linux"
              : "";
  return `${browser}${os ? ` on ${os}` : ""} (Web)`;
}

/** At most one line per 30 s per kind, so a flood can't flood the log. No address or account is ever written. */
const lastNoted = new Map<string, number>();
function note(kind: string, message: string): void {
  const now = Date.now();
  if (now - (lastNoted.get(kind) ?? 0) < 30_000) return;
  lastNoted.set(kind, now);
  console.warn(`[auth] ${message}`);
}

const limiter = (limit: number) =>
  rateLimit({
    windowMs: 60_000,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
      note("own-limit", `This server's own limit was reached: one visitor address made more than ${limit} attempts in a minute.`);
      sendError(res, new ApiError(429, "rate_limited", "Too many attempts. Please wait a minute and try again.", 60));
    },
  });

export function createAuthRouter(ctx: AppContext): Router {
  const router = Router();
  const credentialLimiter = limiter(10);
  const pollLimiter = limiter(40);

  const identity = (req: Request, res: Parameters<typeof ctx.sessions.deviceId>[1]) => ({
    deviceId: ctx.sessions.deviceId(req, res),
    deviceName: deviceNameFromUserAgent(req.headers["user-agent"]),
    platform: "web",
  });

  async function credentials(path: "/auth/login" | "/auth/register", req: Request, res: Parameters<typeof ctx.sessions.deviceId>[1], body: object) {
    const response = await ctx.backend({ method: "POST", path, body: { ...body, ...identity(req, res) }, clientIp: req.ip });
    if (response.status !== 200 && response.status !== 201) {
      if (response.status === 429) note("backend-limit", `The ArcTV service refused a ${path === "/auth/login" ? "sign-in" : "sign-up"} with HTTP 429 (Retry-After: ${response.retryAfter ?? "none"}). Its limit on /auth/* is per address, and to it this whole site may be one address.`);
      throw fromBackendStatus(response.status, backendMessage(response.json), response.retryAfter);
    }
    const session = sessionFromTokenResponse(response.json);
    if (!session) throw new ApiError(502, "upstream_error", "The ArcTV service returned an unexpected response.");
    ctx.sessions.write(res, session);
    return session;
  }

  router.post("/login", credentialLimiter, async (req, res) => {
    const body = parse(loginBody, req.body);
    const session = await credentials("/auth/login", req, res, body);
    res.json({ user: session.user });
  });

  router.post("/register", credentialLimiter, async (req, res) => {
    const body = parse(registerBody, req.body);
    const session = await credentials("/auth/register", req, res, body);
    res.status(201).json({ user: session.user });
  });

  /** Validates the cookie against the backend (catches remote revocation) and returns the user. */
  router.get("/session", async (req, res) => {
    const response = await authedBackendRequest(ctx, req, res, { method: "GET", path: "/user/me" });
    if (response.status !== 200 || typeof response.json !== "object" || response.json === null) {
      throw fromBackendStatus(response.status, backendMessage(response.json), response.retryAfter);
    }
    const { id, email: mail, displayName, isAdmin } = response.json as { id: string; email: string; displayName: string | null; isAdmin?: boolean };
    res.json({ user: { id, email: mail, displayName: displayName ?? null, isAdmin: isAdmin === true } });
  });

  router.post("/logout", async (req, res) => {
    const session = ctx.sessions.read(req);
    // Revoke server-side best-effort, but ALWAYS clear the cookie — a backend outage must not trap someone in a session.
    if (session) {
      try {
        await ctx.backend({ method: "POST", path: "/auth/logout", bearer: session.at, clientIp: req.ip, timeoutMs: 5_000 });
      } catch {
        /* cookie cleared below regardless */
      }
    }
    ctx.sessions.clear(res);
    res.status(204).end();
  });

  // QR sign-in: this browser shows a QR code; a phone opens the backend's own /activate page and signs in / creates the account.
  router.post("/qr/create", credentialLimiter, async (req, res) => {
    const response = await ctx.backend({ method: "POST", path: "/auth/qr/create", body: identity(req, res), clientIp: req.ip });
    if (response.status !== 201 || typeof response.json !== "object" || response.json === null) {
      throw fromBackendStatus(response.status, backendMessage(response.json), response.retryAfter);
    }
    const { token, activationUrl, expiresAt } = response.json as Record<string, unknown>;
    res.status(201).json({ token, activationUrl, expiresAt });
  });

  router.get("/qr/status", pollLimiter, async (req, res) => {
    const { token } = parse(qrStatusQuery, req.query);
    const response = await ctx.backend({ method: "GET", path: "/auth/qr/status", query: `token=${encodeURIComponent(token)}`, clientIp: req.ip });
    if (response.status !== 200 || typeof response.json !== "object" || response.json === null) {
      throw fromBackendStatus(response.status, backendMessage(response.json), response.retryAfter);
    }
    const body = response.json as { status?: string };
    if (body.status === "completed") {
      const session = sessionFromTokenResponse(response.json);
      if (!session) throw new ApiError(502, "upstream_error", "The ArcTV service returned an unexpected response.");
      ctx.sessions.write(res, session);
      res.json({ status: "completed", user: session.user });
      return;
    }
    res.json({ status: body.status ?? "pending" });
  });

  return router;
}
