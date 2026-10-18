import { createHash } from "node:crypto";
import type { Request, Response } from "express";
import type { AppConfig } from "./config.js";
import type { BackendFetch, BackendRequest, BackendResponse } from "./backend.js";
import { ApiError } from "./errors.js";
import type { SessionData, SessionManager } from "./session.js";

export interface AppContext {
  config: AppConfig;
  backend: BackendFetch;
  sessions: SessionManager;
  /** Sessions the backend confirmed are still signed in: refresh-token hash → until when (ms epoch). See [requireLiveSession]. */
  confirmed: Map<string, number>;
}

/** How long a confirmed session is trusted before the backend is asked again: a session signed out elsewhere stops working within this long. */
export const LIVE_CHECK_MS = 60_000;
const LIVE_CHECK_MAX = 10_000;

export const sessionKey = (session: Pick<SessionData, "rt">): string => createHash("sha256").update(session.rt).digest("hex");

/**
 * For the routes this server answers itself (stream relay, addon proxy, TV guide, cached TMDB lookups): a cookie that opens is not
 * enough, because a signed-out or remotely revoked session's cookie still opens for up to 30 days. The backend is asked at most once a
 * minute per session whether it is still signed in. A confirmed sign-out ends it (401, cookie cleared); a backend that can't be
 * reached does not, so an outage never stops someone mid-film.
 */
export async function requireLiveSession(ctx: AppContext, req: Request, res: Response): Promise<SessionData> {
  const session = ctx.sessions.read(req);
  if (!session) throw new ApiError(401, "unauthorized", "Sign in to continue.");
  const key = sessionKey(session);
  const now = Date.now();
  if ((ctx.confirmed.get(key) ?? 0) > now) return session;

  let response: BackendResponse;
  try {
    response = await authedBackendRequest(ctx, req, res, { method: "GET", path: "/user/me" });
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) throw error;
    return session; // backend unavailable: carry on, and ask again next time
  }
  if (response.status !== 200) return session;

  if (ctx.confirmed.size >= LIVE_CHECK_MAX) {
    for (const [k, until] of ctx.confirmed) if (until <= now) ctx.confirmed.delete(k);
    if (ctx.confirmed.size >= LIVE_CHECK_MAX) ctx.confirmed.delete(ctx.confirmed.keys().next().value as string);
  }
  // If the check rotated the tokens, the browser's next request carries the new refresh token and is checked once more.
  ctx.confirmed.set(key, now + LIVE_CHECK_MS);
  return session;
}

/**
 * Calls the existing API on behalf of the signed-in user. The bearer token comes
 * ONLY from the sealed cookie — never from anything the browser sends — which,
 * together with the backend resolving "who is asking" from that token, is what
 * makes "user A cannot read user B's data" true by construction.
 */
/** Account-level calls: who the account is, whether it has Plus, and the profile list itself. Everything else belongs to one profile. */
const ACCOUNT_LEVEL = /^\/(?:user\/(?:me|plus|profiles)|admin)(?:\/|$)/;

export async function authedBackendRequest(
  ctx: AppContext,
  req: Request,
  res: Response,
  request: Omit<BackendRequest, "bearer" | "clientIp">,
): Promise<BackendResponse> {
  let session = await ctx.sessions.ensureFresh(req, res);
  if (!session) throw new ApiError(401, "unauthorized", "Sign in to continue.");

  // The profile comes from the sealed cookie only (never from anything the browser sends), like the bearer token, so a PIN-locked
  // profile can't be reached by naming it in a request.
  const scoped = (s: { pf?: string }) => ({ ...request, profileId: ACCOUNT_LEVEL.test(request.path) ? undefined : s.pf });
  let response = await ctx.backend({ ...scoped(session), bearer: session.at, clientIp: req.ip });
  if (response.status === 401) {
    // The access token was rejected although we believed it valid (session revoked remotely, clock skew…).
    // Try exactly one forced rotation; if that fails too the session is over.
    session = await ctx.sessions.ensureFresh(req, res, { force: true });
    if (!session) throw new ApiError(401, "session_expired", "Your session has expired. Please sign in again.");
    response = await ctx.backend({ ...scoped(session), bearer: session.at, clientIp: req.ip });
    if (response.status === 401) {
      ctx.sessions.clear(res);
      throw new ApiError(401, "session_expired", "Your session has expired. Please sign in again.");
    }
  }
  return response;
}
