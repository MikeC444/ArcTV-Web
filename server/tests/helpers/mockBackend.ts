import { randomUUID } from "node:crypto";
import type { BackendFetch, BackendRequest, BackendResponse } from "../../src/backend.js";
import { ApiError } from "../../src/errors.js";

/**
 * An in-memory stand-in for the existing MangoTV API that implements just the
 * contract the web server relies on (opaque tokens, rotation on refresh, a
 * `requireAuth`-style bearer lookup, per-user data). It exists so the web
 * server's session/proxy logic can be unit-tested fast; the real backend is
 * exercised by tests/integration against a real Postgres.
 */
export interface MockUser {
  id: string;
  email: string;
  password: string;
  displayName: string | null;
}

export function createMockBackend(options: { accessTtlMs?: number } = {}) {
  const users = new Map<string, MockUser>();
  const access = new Map<string, { userId: string; expires: number }>();
  const refresh = new Map<string, { userId: string; used: boolean }>();
  const data = new Map<string, Map<string, unknown>>(); // userId → key → value
  const calls: BackendRequest[] = [];
  /** `refreshRateLimit`: answer /auth/refresh with 429 and this Retry-After (seconds), like the backend's per-IP limiter. */
  const state = { down: false, refreshCalls: 0, refreshRateLimit: null as number | null, rejectAllTokens: false, tokenSeq: 0 };
  const accessTtl = options.accessTtlMs ?? 3_600_000;

  function issue(userId: string) {
    const accessToken = `at_${++state.tokenSeq}_${randomUUID()}`;
    const refreshToken = `rt_${state.tokenSeq}_${randomUUID()}`;
    access.set(accessToken, { userId, expires: Date.now() + accessTtl });
    refresh.set(refreshToken, { userId, used: false });
    const user = users.get(userId)!;
    return {
      accessToken,
      accessTokenExpiresAt: new Date(Date.now() + accessTtl).toISOString(),
      refreshToken,
      refreshTokenExpiresAt: new Date(Date.now() + 30 * 24 * 3600_000).toISOString(),
      user: { id: user.id, email: user.email, displayName: user.displayName },
    };
  }

  const json = (status: number, body?: unknown): BackendResponse => ({ status, json: body, retryAfter: null });

  const fetch: BackendFetch = async (request) => {
    calls.push(request);
    if (state.down) throw new ApiError(502, "backend_unavailable", "Can't reach the MangoTV service right now.");
    const body = (request.body ?? {}) as Record<string, string>;

    if (request.path === "/auth/register" && request.method === "POST") {
      if ([...users.values()].some((u) => u.email === body.email)) return json(409, { error: "An account with that email already exists" });
      const user: MockUser = { id: randomUUID(), email: body.email!, password: body.password!, displayName: body.displayName ?? null };
      users.set(user.id, user);
      return json(201, issue(user.id));
    }
    if (request.path === "/auth/login" && request.method === "POST") {
      const user = [...users.values()].find((u) => u.email === body.email && u.password === body.password);
      return user ? json(200, issue(user.id)) : json(401, { error: "Invalid email or password" });
    }
    if (request.path === "/auth/refresh") {
      state.refreshCalls++;
      if (state.refreshRateLimit !== null) return { status: 429, json: { error: "Too many requests" }, retryAfter: String(state.refreshRateLimit) };
      const entry = refresh.get(body.refreshToken!);
      if (!entry || entry.used) return json(401, { error: "Unauthorized" });
      entry.used = true;
      const { user: _user, ...tokens } = issue(entry.userId);
      return json(200, tokens);
    }

    // everything below needs a bearer
    const token = request.bearer ? access.get(request.bearer) : undefined;
    if (state.rejectAllTokens || !token || token.expires <= Date.now()) return json(401, { error: "Unauthorized" });
    const user = users.get(token.userId)!;

    if (request.path === "/auth/logout") {
      access.delete(request.bearer!);
      return json(204);
    }
    if (request.path === "/user/me") return json(200, { id: user.id, email: user.email, displayName: user.displayName });
    if (request.path === "/user/watchlist" && request.method === "GET") {
      const bucket = data.get(user.id) ?? new Map();
      return json(200, { items: (bucket.get("watchlist") as unknown[] | undefined) ?? [] });
    }
    if (request.path === "/user/watchlist" && request.method === "POST") {
      const bucket = data.get(user.id) ?? new Map<string, unknown>();
      const items = ((bucket.get("watchlist") as unknown[] | undefined) ?? []).concat(request.body);
      bucket.set("watchlist", items);
      data.set(user.id, bucket);
      return json(200, request.body);
    }
    if (request.path === "/user/trailer") return json(200, { youtubeVideoId: "abc123" });
    return json(404, { error: "Not found" });
  };

  return {
    fetch,
    calls,
    state,
    users,
    addUser(email: string, password: string, displayName: string | null = null): MockUser {
      const user: MockUser = { id: randomUUID(), email, password, displayName };
      users.set(user.id, user);
      return user;
    },
    /** Remote sign-out / revoked device: every existing token and refresh token dies at once. */
    revokeAllSessions() {
      access.clear();
      refresh.clear();
    },
    /** Expire every access token now (simulates a >1h idle browser). */
    expireAccessTokens() {
      for (const entry of access.values()) entry.expires = Date.now() - 1000;
    },
  };
}

export type MockBackend = ReturnType<typeof createMockBackend>;
