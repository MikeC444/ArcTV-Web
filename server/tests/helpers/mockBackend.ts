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
  const state = { down: false, refreshCalls: 0, refreshRateLimit: null as number | null, rejectAllTokens: false, tokenSeq: 0, plus: true, profilesSupported: true };
  /** userId → profiles (the account's own "main" profile is created on first use) and their PINs. */
  const profiles = new Map<string, Array<{ id: string; name: string; avatar: string; kind: "adult" | "kids"; isDefault: boolean; pin: string | null }>>();
  const profilesOf = (user: MockUser) => {
    if (!profiles.has(user.id)) profiles.set(user.id, [{ id: "main", name: user.displayName ?? "Me", avatar: "fox", kind: "adult", isDefault: true, pin: null }]);
    return profiles.get(user.id)!;
  };
  const publicProfile = (p: { pin: string | null }) => {
    const { pin, ...rest } = p as { pin: string | null } & Record<string, unknown>;
    return { ...rest, hasPin: pin !== null };
  };
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
    if (state.down) throw new ApiError(502, "backend_unavailable", "Can't reach the ArcTV service right now.");
    const body = (request.body ?? {}) as Record<string, string>;

    if (request.path === "/health") return json(200, { status: "ok" });
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
    if (request.path === "/user/me") return json(200, { id: user.id, email: user.email, displayName: user.displayName, isAdmin: user.email.startsWith("admin") });
    // Profiles: a library belongs to the profile named in X-ArcTV-Profile (absent = the account's own).
    const library = `watchlist:${request.profileId ?? "main"}`;
    if (request.path === "/user/watchlist" && request.method === "GET") {
      const bucket = data.get(user.id) ?? new Map();
      return json(200, { items: (bucket.get(library) as unknown[] | undefined) ?? [] });
    }
    if (request.path === "/user/watchlist" && request.method === "POST") {
      const bucket = data.get(user.id) ?? new Map<string, unknown>();
      const items = ((bucket.get(library) as unknown[] | undefined) ?? []).concat(request.body);
      bucket.set(library, items);
      data.set(user.id, bucket);
      return json(200, request.body);
    }
    if (request.path.startsWith("/user/profiles")) {
      if (!state.profilesSupported) return json(404, { error: "Not found" });
      const list = profilesOf(user);
      const rest = request.path.slice("/user/profiles".length);
      if (rest === "" && request.method === "GET") return json(200, { profiles: list.map(publicProfile) });
      if (rest === "" && request.method === "POST") {
        const b = request.body as { name: string; avatar: string; kind: "adult" | "kids"; pin?: string };
        const created = { id: `p_${randomUUID().slice(0, 8)}`, name: b.name, avatar: b.avatar, kind: b.kind, isDefault: false, pin: b.pin ?? null };
        list.push(created);
        return json(201, publicProfile(created));
      }
      const match = /^\/([^/]+)(\/verify-pin)?$/.exec(rest);
      const target = match ? list.find((p) => p.id === match[1]) : undefined;
      if (!target) return json(404, { error: "Not found" });
      if (match![2] && request.method === "POST") return (request.body as { pin?: string }).pin === target.pin ? json(204) : json(403, { error: "Wrong PIN" });
      if (request.method === "PUT") {
        const b = request.body as { name?: string; avatar?: string; kind?: "adult" | "kids"; pin?: string | null };
        if (b.name !== undefined) target.name = b.name;
        if (b.avatar !== undefined) target.avatar = b.avatar;
        if (b.kind !== undefined) target.kind = b.kind;
        if (b.pin !== undefined) target.pin = b.pin;
        return json(200, publicProfile(target));
      }
      if (request.method === "DELETE") {
        list.splice(list.indexOf(target), 1);
        return json(204);
      }
    }
    if (request.path === "/user/feedback" && request.method === "GET") {
      const bucket = data.get(user.id) ?? new Map();
      return json(200, { items: (bucket.get("feedback") as unknown[] | undefined) ?? [] });
    }
    if (request.path === "/user/feedback" && request.method === "POST") {
      const bucket = data.get(user.id) ?? new Map<string, unknown>();
      bucket.set("feedback", ((bucket.get("feedback") as unknown[] | undefined) ?? []).concat(request.body));
      data.set(user.id, bucket);
      return json(200, request.body);
    }
    if (request.path === "/user/picked-dismissals" && request.method === "GET") {
      const bucket = data.get(user.id) ?? new Map();
      return json(200, { items: (bucket.get("pickedDismissals") as unknown[] | undefined) ?? [] });
    }
    if (request.path === "/user/picked-dismissals" && request.method === "POST") {
      const bucket = data.get(user.id) ?? new Map<string, unknown>();
      bucket.set("pickedDismissals", ((bucket.get("pickedDismissals") as unknown[] | undefined) ?? []).concat(request.body));
      data.set(user.id, bucket);
      return json(200, request.body);
    }
    if (request.path === "/user/continue-watching" && request.method === "DELETE") return json(200, { providerId: "p", contentId: "tt1", contentType: "MOVIE", title: "A", positionMs: 0, durationMs: 100, lastWatchedAt: "2026-01-01T00:00:00.000Z", deletedAt: "2026-01-02T00:00:00.000Z", query: request.query ?? "" });
    if (request.path === "/user/plus" && request.method === "GET") return json(200, state.plus ? { active: true, plan: "early_access", validUntil: null, paywall: false } : { active: false, plan: null, validUntil: null, paywall: true });
    if (request.path === "/user/plus/checkout" && request.method === "POST") return json(200, { url: `https://checkout.example/${(request.body as { plan?: string })?.plan ?? "none"}` });
    if (request.path === "/user/plus/cancel" && request.method === "POST") return json(200, { active: true, plan: "monthly", validUntil: "2099-01-01T00:00:00.000Z", cancelAtPeriodEnd: true, paywall: true });
    if (request.path === "/admin/summary" && request.method === "GET") return json(200, { users: 3, newLast7Days: 1, activeLast7Days: 2, plus: { monthly: 1, yearly: 0, lifetime: 1 }, versions: [{ version: "0.1.7", platform: "fire_tv", devices: 2 }], live: { online: { users: 3, byPlatform: { fire_tv: 2, web: 1 } }, watching: { users: 1, byPlatform: { fire_tv: 1 } }, onlineWindowSeconds: 300, watchingWindowSeconds: 45 } });
    if (request.path === "/admin/users" && request.method === "GET") return json(200, { total: 1, users: [{ id: "u1", email: "sam@example.com", query: request.query ?? "" }] });
    if (/^\/admin\/users\/[0-9a-f-]{36}$/.test(request.path) && request.method === "GET") return json(200, { user: { id: request.path.split("/").pop(), email: "sam@example.com" } });
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
