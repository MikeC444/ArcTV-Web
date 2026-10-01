import type { Express } from "express";
import request from "supertest";
import { createApp } from "../../src/app.js";
import type { AppConfig } from "../../src/config.js";
import type { BackendFetch } from "../../src/backend.js";

export function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    nodeEnv: "test",
    isProduction: false,
    port: 0,
    apiUrl: "http://backend.invalid",
    sessionSecret: "test-secret-test-secret-test-secret",
    trustProxy: false,
    extraConnectSrc: [],
    staticDir: undefined,
    allowPrivateAddonHosts: false,
    streamRelay: true,
    audioConversion: true,
    ffmpegPath: undefined,
    audioConversionMax: 3,
    tmdbApiKey: undefined,
    tmdbApiBase: "http://tmdb.invalid/3",
    tmdbImageBase: "http://images.invalid/t/p",
    ...overrides,
  };
}

export function appWith(backend: BackendFetch, overrides: Partial<AppConfig> = {}): Express {
  return createApp(testConfig(overrides), { backend });
}

/** A supertest agent that automatically sends the CSRF header on mutations. */
export function agentFor(app: Express) {
  const agent = request.agent(app);
  return {
    agent,
    post: (url: string) => agent.post(url).set("X-MangoTV-Client", "web"),
    put: (url: string) => agent.put(url).set("X-MangoTV-Client", "web"),
    delete: (url: string) => agent.delete(url).set("X-MangoTV-Client", "web"),
    get: (url: string) => agent.get(url),
  };
}

/** Extracts the raw Set-Cookie header lines. */
export function setCookies(res: request.Response): string[] {
  const raw = res.headers["set-cookie"] as unknown;
  return Array.isArray(raw) ? (raw as string[]) : raw ? [String(raw)] : [];
}
