import { randomUUID } from "node:crypto";
import pg from "pg";
import type { Express } from "express";
import { createApp } from "../../src/app.js";
import { loadConfig } from "../../src/config.js";
import { deriveKey, unseal } from "../../src/seal.js";
import type { SessionData } from "../../src/session.js";

/**
 * Integration tests run the REAL, unmodified MangoTV backend (from the Firestick
 * repository) against a throwaway Postgres with all 14 real migrations applied.
 * They are skipped unless MANGOTV_BACKEND_URL is set (see scripts/run-backend-integration.sh)
 * and refuse to touch any database that doesn't look disposable.
 */
export const BACKEND_URL = process.env.MANGOTV_BACKEND_URL ?? "";
export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? "";
export const integrationEnabled = BACKEND_URL !== "" && TEST_DATABASE_URL !== "";

export const SECRET = "integration-test-secret-integration-test";

export function createWebApp(): Express {
  return createApp(
    loadConfig({
      NODE_ENV: "test",
      // describe.skipIf still runs the suite body, so a placeholder keeps a plain `npm test` (no backend) loadable
      MANGOTV_API_URL: BACKEND_URL || "http://integration-tests-disabled.invalid",
      SESSION_SECRET: SECRET,
      TRUST_PROXY: "1", // so a per-test X-Forwarded-For selects the client IP the backend rate-limits on
    } as NodeJS.ProcessEnv),
  );
}

let ipCounter = 10;
/** Each test "client" gets its own IP so the backend's 10/min/IP auth limiter never couples unrelated tests. */
export function freshIp(): string {
  ipCounter++;
  return `203.0.113.${ipCounter}`;
}

export function uniqueEmail(label: string): string {
  return `${label}.${Date.now().toString(36)}.${randomUUID().slice(0, 8)}@integration.test`;
}

export interface Tokens {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; displayName: string | null };
}

/** Talks to the backend the way the Fire TV app does: directly, with a bearer token and its own device id. */
export class TvDevice {
  readonly deviceId = randomUUID();
  tokens?: Tokens;
  constructor(private readonly ip = freshIp()) {}

  private async call(method: string, path: string, body?: unknown, bearer = this.tokens?.accessToken) {
    const response = await fetch(`${BACKEND_URL}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-Forwarded-For": this.ip,
        ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    return { status: response.status, body: text ? (JSON.parse(text) as Record<string, unknown>) : undefined };
  }

  async register(email: string, password: string) {
    const r = await this.call("POST", "/auth/register", { email, password, deviceId: this.deviceId, deviceName: "Living Room TV", platform: "fire_tv" });
    if (r.status !== 201) throw new Error(`TV register failed: ${r.status} ${JSON.stringify(r.body)}`);
    this.tokens = r.body as unknown as Tokens;
    return this.tokens;
  }
  get = (path: string) => this.call("GET", path);
  post = (path: string, body: unknown) => this.call("POST", path, body);
  put = (path: string, body: unknown) => this.call("PUT", path, body);
  del = (path: string) => this.call("DELETE", path);
  raw = (method: string, path: string, body: unknown, bearer: string) => this.call(method, path, body, bearer);
}

export function readSessionCookie(setCookie: string[] | string | undefined): SessionData | null {
  const lines = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const line = lines.find((c) => c.startsWith("mtv_session=") && !/Max-Age=0/.test(c));
  if (!line) return null;
  const value = line.split(";")[0]!.slice("mtv_session=".length);
  return unseal<SessionData>(deriveKey(SECRET), value, "session");
}

/** Direct DB access — ONLY to a database that looks disposable; used to simulate the passage of time. */
export function testDb(): pg.Pool {
  const name = new URL(TEST_DATABASE_URL).pathname.slice(1);
  if (!/test|_it$/i.test(name)) throw new Error(`Refusing to use database "${name}": integration tests only run against a disposable *test* database.`);
  return new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 2 });
}

export const nowIso = (offsetMs = 0) => new Date(Date.now() + offsetMs).toISOString();
