#!/usr/bin/env node
// Smoke-checks a REAL Arc TV deployment with a REAL account, using only the public API — the same calls the web
// server makes on someone's behalf. It never prints tokens or passwords and never writes user data.
//
//   MANGOTV_API_URL=https://your-backend.example \
//   VERIFY_EMAIL=you@example.com VERIFY_PASSWORD='…' \
//   npm run verify:backend
//
// What it does: GET /health → log in → GET /user/me, /settings, /watchlist, /continue-watching, /history, /addons
// (prints counts only) → log out → confirm the old token no longer works.
// Side effects, exactly: one session row is created and then revoked, and a device entry named "Arc TV web
// verification" appears (one per account — its id is derived from the email, so re-runs reuse it).
import { createHash } from "node:crypto";

const apiUrl = (process.env.MANGOTV_API_URL ?? "").replace(/\/+$/, "");
const email = process.env.VERIFY_EMAIL ?? "";
const password = process.env.VERIFY_PASSWORD ?? "";

if (!/^https?:\/\//.test(apiUrl) || !email || !password) {
  console.error("Set MANGOTV_API_URL, VERIFY_EMAIL and VERIFY_PASSWORD (see the header of scripts/verify-backend.mjs).");
  process.exit(2);
}
if (!apiUrl.startsWith("https://") && !/^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(apiUrl)) {
  console.error("Refusing to send credentials over plain http to a non-local host.");
  process.exit(2);
}

const failures = [];
const ok = (name, detail = "") => console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ""}`);
const bad = (name, detail) => {
  failures.push(name);
  console.log(`  ✗ ${name} — ${detail}`);
};

async function call(method, path, { bearer, body } = {}) {
  const response = await fetch(`${apiUrl}${path}`, {
    method,
    headers: { Accept: "application/json", "User-Agent": "ArcTV-Web-verify/0.1", ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    redirect: "error",
    signal: AbortSignal.timeout(20_000),
  });
  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = undefined;
  }
  return { status: response.status, json };
}

// A stable UUID-shaped device id per account, so repeated runs don't pile up device rows.
const digest = createHash("sha256").update(`arctv-web-verify:${email.toLowerCase()}`).digest("hex");
const deviceId = `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-8${digest.slice(17, 20)}-${digest.slice(20, 32)}`;

console.log(`Verifying ${new URL(apiUrl).origin} …`);
let accessToken = "";
try {
  const health = await call("GET", "/health");
  health.status === 200 ? ok("GET /health", `status ${health.json?.status ?? "n/a"}`) : bad("GET /health", `HTTP ${health.status}`);

  const login = await call("POST", "/auth/login", { body: { email, password, deviceId, deviceName: "Arc TV web verification", platform: "web" } });
  if (login.status === 429) throw new Error("rate limited by the backend (10 auth requests / minute / IP) — wait a minute and retry");
  if (login.status !== 200) throw new Error(`login failed with HTTP ${login.status} (${login.json?.error?.code ?? login.json?.error ?? "no detail"})`);
  accessToken = login.json?.accessToken ?? login.json?.tokens?.accessToken ?? "";
  const userId = login.json?.user?.id;
  if (!accessToken || !userId) throw new Error("login succeeded but the response has an unexpected shape");
  ok("POST /auth/login", `user id ${userId}`);

  const me = await call("GET", "/user/me", { bearer: accessToken });
  me.status === 200 && me.json?.id === userId ? ok("GET /user/me", "same user id as the login response") : bad("GET /user/me", `HTTP ${me.status}, id mismatch or missing`);

  const settings = await call("GET", "/user/settings", { bearer: accessToken });
  settings.status === 200 ? ok("GET /user/settings", `${Object.keys(settings.json ?? {}).length} fields`) : bad("GET /user/settings", `HTTP ${settings.status}`);

  for (const [path, label] of [["/user/watchlist", "watchlist items"], ["/user/continue-watching", "continue-watching items"], ["/user/history", "history items"], ["/user/addons", "installed addons"]]) {
    const result = await call("GET", path, { bearer: accessToken });
    const items = result.json?.items ?? result.json?.addons;
    result.status === 200 && Array.isArray(items) ? ok(`GET ${path}`, `${items.length} ${label}`) : bad(`GET ${path}`, `HTTP ${result.status}, no list in the response`);
  }

  const anonymous = await call("GET", "/user/watchlist");
  anonymous.status === 401 ? ok("unauthenticated request is refused", "HTTP 401") : bad("unauthenticated request is refused", `HTTP ${anonymous.status}`);
} catch (error) {
  bad("verification aborted", error instanceof Error ? error.message : String(error));
} finally {
  if (accessToken) {
    const logout = await call("POST", "/auth/logout", { bearer: accessToken }).catch(() => ({ status: 0 }));
    logout.status === 200 || logout.status === 204 ? ok("POST /auth/logout", "session revoked") : bad("POST /auth/logout", `HTTP ${logout.status}`);
    const after = await call("GET", "/user/me", { bearer: accessToken }).catch(() => ({ status: 0 }));
    after.status === 401 ? ok("revoked token no longer works", "HTTP 401") : bad("revoked token no longer works", `HTTP ${after.status}`);
  }
}

console.log(failures.length === 0 ? "\nAll checks passed." : `\n${failures.length} check(s) failed: ${failures.join("; ")}`);
process.exit(failures.length === 0 ? 0 : 1);
