import { createHash, randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import { parse, serialize } from "cookie";
import type { AppConfig } from "./config.js";
import { ApiError } from "./errors.js";
import type { BackendFetch } from "./backend.js";
import { deriveKey, seal, unseal } from "./seal.js";

export interface SessionUser {
  id: string;
  email: string;
  displayName: string | null;
}

/** What lives (sealed) in the httpOnly cookie. Page scripts can never read it. */
export interface SessionData {
  /** access token + expiry (ms epoch) */
  at: string;
  ate: number;
  /** refresh token + expiry (ms epoch) */
  rt: string;
  rte: number;
  user: SessionUser;
}

/** Shape of the existing API's token responses (login / register / refresh / QR status). */
interface TokenResponse {
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
  user?: SessionUser;
}

const REFRESH_SKEW_MS = 60_000;
const GRACE_MS = 60_000;
/**
 * After a refresh the backend couldn't answer, stop asking for a moment. The backend limits /auth/* per IP address and every
 * visitor of this site arrives from ours, so a retry on each incoming request would use up the allowance that sign-in needs.
 * A 429 is honoured for as long as the backend says (capped); a timeout or 5xx only pauses briefly.
 */
const REFRESH_RETRY_PAUSE_MS = 5_000;
const REFRESH_RATE_LIMIT_MAX_PAUSE_MS = 60_000;

function isTokenResponse(json: unknown): json is TokenResponse {
  if (!json || typeof json !== "object") return false;
  const value = json as Record<string, unknown>;
  return (
    typeof value.accessToken === "string" &&
    typeof value.accessTokenExpiresAt === "string" &&
    typeof value.refreshToken === "string" &&
    typeof value.refreshTokenExpiresAt === "string"
  );
}

export function sessionFromTokenResponse(json: unknown, fallbackUser?: SessionUser): SessionData | null {
  if (!isTokenResponse(json)) return null;
  const user = json.user ?? fallbackUser;
  if (!user || typeof user.id !== "string" || typeof user.email !== "string") return null;
  const ate = Date.parse(json.accessTokenExpiresAt);
  const rte = Date.parse(json.refreshTokenExpiresAt);
  if (Number.isNaN(ate) || Number.isNaN(rte)) return null;
  return {
    at: json.accessToken,
    ate,
    rt: json.refreshToken,
    rte,
    user: { id: user.id, email: user.email, displayName: user.displayName ?? null },
  };
}

type RefreshOutcome = { kind: "ok"; session: SessionData } | { kind: "rejected" } | { kind: "unavailable"; retryAfterMs?: number };

export class SessionManager {
  private readonly key: Buffer;
  private readonly sessionCookie: string;
  private readonly deviceCookie: string;
  /** Concurrent requests carrying the same (old) refresh token share one rotation. */
  private readonly inflight = new Map<string, Promise<RefreshOutcome>>();
  /** …and for a short grace window after it, so parallel requests already in flight don't sign the user out. */
  private readonly recent = new Map<string, { outcome: RefreshOutcome; until: number }>();
  /** No refresh is sent to the backend before this time (ms epoch) — see REFRESH_RETRY_PAUSE_MS. */
  private refreshPausedUntil = 0;

  constructor(
    private readonly config: AppConfig,
    private readonly backend: BackendFetch,
  ) {
    this.key = deriveKey(config.sessionSecret);
    // __Host- prefix (Secure, Path=/, no Domain) in production — the browser then
    // refuses to let any sibling subdomain overwrite the cookie.
    const prefix = config.isProduction ? "__Host-" : "";
    this.sessionCookie = `${prefix}mtv_session`;
    this.deviceCookie = `${prefix}mtv_device`;
  }

  // ── cookies ────────────────────────────────────────────────────────────────

  read(req: Request): SessionData | null {
    const header = req.headers.cookie;
    if (!header) return null;
    const raw = parse(header)[this.sessionCookie];
    if (!raw) return null;
    const data = unseal<SessionData>(this.key, raw, "session");
    if (!data || typeof data.at !== "string" || typeof data.rt !== "string" || !data.user?.id) return null;
    if (data.rte <= Date.now()) return null; // refresh token expired → the session is over
    return data;
  }

  write(res: Response, session: SessionData): void {
    const maxAge = Math.max(0, Math.floor((session.rte - Date.now()) / 1000));
    this.appendCookie(res, this.sessionCookie, seal(this.key, session, "session"), maxAge);
  }

  clear(res: Response): void {
    this.appendCookie(res, this.sessionCookie, "", 0);
  }

  /** A stable per-browser UUID, sent as `deviceId` so the browser shows up as ONE device per account. */
  deviceId(req: Request, res: Response): string {
    const header = req.headers.cookie;
    const raw = header ? parse(header)[this.deviceCookie] : undefined;
    const existing = raw ? unseal<{ id: string }>(this.key, raw, "device") : null;
    if (existing && /^[0-9a-f-]{36}$/i.test(existing.id)) return existing.id;
    const id = randomUUID();
    this.appendCookie(res, this.deviceCookie, seal(this.key, { id }, "device"), 400 * 24 * 3600);
    return id;
  }

  private appendCookie(res: Response, name: string, value: string, maxAgeSeconds: number): void {
    res.append(
      "Set-Cookie",
      serialize(name, value, {
        httpOnly: true,
        secure: this.config.isProduction,
        sameSite: "lax",
        path: "/",
        maxAge: maxAgeSeconds,
      }),
    );
  }

  // ── token lifecycle ────────────────────────────────────────────────────────

  /**
   * Returns a session whose access token is valid for at least a minute, rotating
   * it via /auth/refresh when needed. A *confirmed* 401 from refresh ends the
   * session (cookie cleared → null). A network failure or 5xx never signs anyone
   * out — same rule the Fire TV app follows (AuthRepository.ensureFreshSession).
   */
  async ensureFresh(req: Request, res: Response, options: { force?: boolean } = {}): Promise<SessionData | null> {
    const session = this.read(req);
    if (!session) return null;
    const stale = session.ate - Date.now() < REFRESH_SKEW_MS;
    if (!stale && !options.force) return session;

    const outcome = await this.rotate(session.rt, session.user, req.ip);
    if (outcome.kind === "ok") {
      this.write(res, outcome.session);
      return outcome.session;
    }
    if (outcome.kind === "rejected") {
      this.clear(res);
      return null;
    }
    // unavailable: keep the old session if its access token can still be used
    if (session.ate > Date.now()) return session;
    throw new ApiError(502, "backend_unavailable", "Can't reach the MangoTV service right now.");
  }

  private rotate(refreshToken: string, user: SessionUser, clientIp: string | undefined): Promise<RefreshOutcome> {
    const id = createHash("sha256").update(refreshToken).digest("hex");
    const now = Date.now();
    for (const [key, value] of this.recent) if (value.until <= now) this.recent.delete(key);

    const cached = this.recent.get(id);
    if (cached) return Promise.resolve(cached.outcome);
    const running = this.inflight.get(id);
    if (running) return running;
    if (this.refreshPausedUntil > now) return Promise.resolve({ kind: "unavailable" });

    const promise = this.doRefresh(refreshToken, user, clientIp)
      .then((outcome) => {
        if (outcome.kind === "unavailable") this.refreshPausedUntil = Date.now() + (outcome.retryAfterMs ?? REFRESH_RETRY_PAUSE_MS);
        else this.recent.set(id, { outcome, until: Date.now() + GRACE_MS });
        return outcome;
      })
      .finally(() => this.inflight.delete(id));
    this.inflight.set(id, promise);
    return promise;
  }

  private async doRefresh(refreshToken: string, user: SessionUser, clientIp: string | undefined): Promise<RefreshOutcome> {
    try {
      const response = await this.backend({ method: "POST", path: "/auth/refresh", body: { refreshToken }, clientIp });
      if (response.status === 401) return { kind: "rejected" };
      if (response.status === 200) {
        const session = sessionFromTokenResponse(response.json, user);
        return session ? { kind: "ok", session } : { kind: "unavailable" };
      }
      if (response.status === 429) {
        const seconds = Number(response.retryAfter);
        return { kind: "unavailable", retryAfterMs: Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds * 1000, REFRESH_RATE_LIMIT_MAX_PAUSE_MS) : REFRESH_RATE_LIMIT_MAX_PAUSE_MS / 2 };
      }
      return { kind: "unavailable" };
    } catch {
      return { kind: "unavailable" };
    }
  }
}
