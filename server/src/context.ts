import type { Request, Response } from "express";
import type { AppConfig } from "./config.js";
import type { BackendFetch, BackendRequest, BackendResponse } from "./backend.js";
import { ApiError } from "./errors.js";
import type { SessionManager } from "./session.js";

export interface AppContext {
  config: AppConfig;
  backend: BackendFetch;
  sessions: SessionManager;
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
