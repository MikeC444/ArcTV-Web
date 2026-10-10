import { randomUUID } from "node:crypto";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

export const BACKEND = process.env.MANGOTV_BACKEND_URL ?? "http://localhost:3199";
export const ADDON = process.env.ADDON_URL ?? "http://127.0.0.1:7000";
export const ADDON_MANIFEST = `${ADDON}/manifest.json`;

let ipCounter = 0;
const ipBlock = Math.floor(Math.random() * 250) + 1; // random per worker so repeated / restarted runs never reuse an address inside the limiter's window
/** Every test context gets its own client IP so the backend's 10/min/IP auth limiter never couples tests together. */
export const nextIp = (): string => `198.51.${ipBlock}.${(ipCounter = (ipCounter % 250) + 1)}`;

export function uniqueEmail(label: string): string {
  return `${label}.${Date.now().toString(36)}.${randomUUID().slice(0, 6)}@e2e.test`;
}
export const PASSWORD = "e2e-password-1234";

/** The Fire TV app, as the backend sees it: a device with its own id and bearer token. */
export class Tv {
  readonly deviceId = randomUUID();
  accessToken = "";
  userId = "";
  constructor(readonly email: string, readonly ip = nextIp()) {}

  private async call(method: string, path: string, body?: unknown) {
    const response = await fetch(`${BACKEND}${path}`, {
      method,
      headers: { "Content-Type": "application/json", "X-Forwarded-For": this.ip, ...(this.accessToken ? { Authorization: `Bearer ${this.accessToken}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : undefined };
  }
  async register() {
    const r = await this.call("POST", "/auth/register", { email: this.email, password: PASSWORD, deviceId: this.deviceId, deviceName: "Living Room TV", platform: "fire_tv" });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    this.accessToken = r.body.accessToken;
    this.userId = r.body.user.id;
    return this;
  }
  get = (path: string) => this.call("GET", path);
  post = (path: string, body: unknown) => this.call("POST", path, body);
  put = (path: string, body: unknown) => this.call("PUT", path, body);
  del = (path: string) => this.call("DELETE", path);

  /** Installs any Stremio addon by manifest URL exactly as the TV would (synced to the cloud). */
  async installAddon(manifestUrl: string, sortOrder = 1) {
    const manifest = await (await fetch(manifestUrl)).json();
    const r = await this.post("/user/addons", { manifestUrl, addonId: manifest.id, name: manifest.name, manifestJson: manifest, enabled: true, sortOrder, updatedAt: new Date(Date.now() - 50_000 + sortOrder).toISOString() });
    expect(r.status).toBe(200);
  }

  /** Installs the fixture addon exactly as the TV would (synced to the cloud). */
  async installFixtureAddon() {
    const manifest = await (await fetch(ADDON_MANIFEST)).json();
    const r = await this.post("/user/addons", { manifestUrl: ADDON_MANIFEST, addonId: manifest.id, name: manifest.name, manifestJson: manifest, enabled: true, sortOrder: 0, updatedAt: new Date(Date.now() - 60_000).toISOString() });
    expect(r.status).toBe(200);
  }
  async seedContinueWatching(item: { contentId: string; type?: "MOVIE" | "TV_SHOW"; title: string; season?: number; episode?: number; positionMs?: number; durationMs?: number }) {
    const r = await this.post("/user/watch-progress", {
      providerId: "test.mangotv.fixture", contentId: item.contentId, contentType: item.type ?? "MOVIE", seasonNumber: item.season ?? null, episodeNumber: item.episode ?? null, episodeTitle: item.episode ? `Chapter ${item.episode}` : null,
      title: item.title, posterUrl: `${ADDON}/img/poster/${item.contentId}.svg`, backdropUrl: `${ADDON}/img/bg/${item.contentId}.svg`, positionMs: item.positionMs ?? 1_500_000, durationMs: item.durationMs ?? 6_000_000, completed: false, watchedAt: new Date(Date.now() - 30_000).toISOString(),
    });
    expect(r.status).toBe(200);
  }
  async seedWatched(item: { contentId: string; title: string }) {
    const r = await this.post("/user/watchlist", { providerId: "test.mangotv.fixture", contentId: item.contentId, contentType: "MOVIE", title: item.title, posterUrl: `${ADDON}/img/poster/${item.contentId}.svg`, backdropUrl: null, year: 2020, rating: 7.1, watched: true, updatedAt: new Date(Date.now() - 45_000).toISOString() });
    expect(r.status).toBe(200);
  }
}

export interface TestAccount {
  tv: Tv;
  email: string;
}

/** A fresh account that already has the fixture addon installed (so Home has content). */
export async function newAccount(label: string, options: { addon?: boolean } = {}): Promise<TestAccount> {
  const tv = await new Tv(uniqueEmail(label)).register();
  if (options.addon !== false) await tv.installFixtureAddon();
  return { tv, email: tv.email };
}

export async function useClientIp(context: BrowserContext, ip = nextIp()) {
  await context.setExtraHTTPHeaders({ "X-Forwarded-For": ip });
  return ip;
}

/** Signs a browser context in through the web server's own API (skips the form; the form has its own tests). */
export async function signIn(context: BrowserContext, email: string, password = PASSWORD) {
  const response = await context.request.post("/api/auth/login", { headers: { "X-MangoTV-Client": "web" }, data: { email, password } });
  expect(response.status(), await response.text()).toBe(200);
}

/** The id of the current "Everything in ArcTV Plus" welcome popup (client/src/state/plusWelcome.ts). */
export const WELCOME_ID = "2026-10-features-downloads";

/** `welcome: true` leaves the one-time "Everything in ArcTV Plus" welcome popup to appear; by default it is marked seen so it never gets in a test's way. */
export async function openSignedIn(page: Page, account: TestAccount, path = "/", options: { welcome?: boolean } = {}) {
  await useClientIp(page.context());
  await signIn(page.context(), account.email);
  if (!options.welcome) {
    await page.addInitScript(([key, id]) => localStorage.setItem(key!, JSON.stringify({ seen: id })), [`mtv:v1:${account.tv.userId}:plus-welcome`, WELCOME_ID]);
  }
  await page.goto(path);
}

/** Text of the first heading-level element to identify the current screen. */
export const cards = (page: Page) => page.locator(".card__surface");

/** Writes e2e/screenshots/<project>/<name>.jpg (JPEG keeps the committed evidence small). */
export async function shot(page: Page, name: string) {
  await page.screenshot({ path: `e2e/screenshots/${test.info().project.name}/${name}.jpg`, type: "jpeg", quality: 82 });
}
