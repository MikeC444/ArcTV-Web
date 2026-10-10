import { expect, test, type Page } from "@playwright/test";
import { ADDON, newAccount, openSignedIn, shot, type TestAccount } from "./helpers";

/**
 * Sources a browser can't fetch itself: hosts that refuse a browser-style request (hotlink protection) but serve everyone else, and
 * sources whose addon asks for request headers a page can't send (`behaviorHints.proxyHeaders`). Stremio's answer is its streaming
 * server's /proxy/; Arc TV's is the stream relay on its own web server — used at once for header-locked / plain-http sources, and
 * once after the browser's own request FAILED outright. (A source that is merely slow is not sent to the relay: see addons.spec.)
 * The fixture host ("hostile") serves every client EXCEPT ones carrying Sec-Fetch-* headers, i.e. browsers.
 */
type MediaRequest = { path: string; method: string; browser: boolean; range: string | null; referer: string | null; required: string | null; userAgent: string | null };
const mediaLog = async () => ((await (await fetch(`${ADDON}/__media-requests`)).json()) as { requests: MediaRequest[] }).requests;
const clearLog = () => fetch(`${ADDON}/__media-requests`, { method: "DELETE" });
const video = (page: Page) => page.locator("video.player__video");

async function openFixtureSources(page: Page, account: TestAccount) {
  await account.tv.installAddon(`${ADDON}/relay/manifest.json`, 1);
  await clearLog();
  await openSignedIn(page, account);
  await page.goto("/sources/test.arctv.fixture/MOVIE/fxm1/-1/-1");
  await expect(page.getByRole("heading", { name: "Select a Source" })).toBeVisible();
}
const pick = (page: Page, release: string) => page.locator(".source", { hasText: release }).locator(".source__surface").click();

test.describe("stream relay (Stremio-style proxy) — sources a browser can't fetch itself", () => {
  test("a host that refuses the browser's own request (hotlink protection) but serves everyone else: the player asks again through the relay, and it plays", async ({ page }) => {
    const account = await newAccount("hostile");
    await openFixtureSources(page, account);
    await pick(page, "Relay.hostile");
    await expect(page).toHaveURL(/\/player\//);

    await expect.poll(() => video(page).evaluate((v: HTMLVideoElement) => v.currentTime), { timeout: 20_000 }).toBeGreaterThan(0.5);
    expect(await video(page).evaluate((v: HTMLVideoElement) => v.currentSrc)).toContain("/api/relay/");
    expect(await video(page).evaluate((v: HTMLVideoElement) => v.videoWidth)).toBeGreaterThan(0); // real picture, not just a ticking clock

    const requests = await mediaLog();
    expect(requests.some((r) => r.path === "/media/browser-hostile.webm" && r.browser), "the browser tried first").toBe(true);
    expect(requests.some((r) => r.method === "HEAD"), "an address that names a media file is played, not probed first").toBe(false);
    const viaRelay = requests.find((r) => r.path === "/media/browser-hostile.webm" && !r.browser);
    expect(viaRelay, "the relay's own request reached the host").toBeTruthy();
    expect(viaRelay!.userAgent).toContain("ArcTV-Web");
    expect(viaRelay!.referer).toBeNull(); // nothing identifying the app's own address
    await shot(page, "player-relay-fallback");
  });

  test("a source that needs special request headers (proxyHeaders) plays through the relay straight away — the browser never contacts that host", async ({ page }) => {
    const account = await newAccount("headers");
    await openFixtureSources(page, account);
    await expect(page.locator(".source", { hasText: "Relay.headers" })).toContainText("via this site's relay");
    await pick(page, "Relay.headers");
    await expect.poll(() => video(page).evaluate((v: HTMLVideoElement) => v.currentTime), { timeout: 20_000 }).toBeGreaterThan(0.5);
    expect(await video(page).evaluate((v: HTMLVideoElement) => v.currentSrc)).toContain("/api/relay/");

    const requests = (await mediaLog()).filter((r) => r.path === "/media/needs-headers.webm");
    expect(requests.length).toBeGreaterThan(0);
    expect(requests.every((r) => !r.browser)).toBe(true); // only the relay talked to the host
    expect(requests.every((r) => r.required === "let-me-in")).toBe(true); // with the headers the addon asked for
  });

  test("when the relay can't get it either, the error says both routes were tried and why the relay was refused, and the details keep the direct attempt", async ({ page }) => {
    const account = await newAccount("dead");
    await openFixtureSources(page, account);
    await pick(page, "Relay.dead");

    const alert = page.getByRole("alertdialog", { name: "Unable to play this source" });
    await expect(alert).toBeVisible({ timeout: 20_000 });
    await expect(alert).toContainText("Tried directly and through this site's relay");
    // a <video> can only say "format not supported" — the dialog asks the relay why it was refused and says so
    await expect(alert).toContainText("this site's server was refused: The stream host answered HTTP 403 (from 127.0.0.1:");
    await alert.getByText("Technical details").click();
    const details = alert.locator(".perror__pre");
    await expect(details).toContainText("route direct, then relay");
    await expect(details).toContainText("relay-fallback (the direct request failed)");
    await expect(details).toContainText("Direct attempt (replaced by the relay): network NO_SOURCE, ready HAVE_NOTHING"); // what the first request did isn't lost

    await alert.getByRole("button", { name: "Test connection" }).click();
    await expect(details).toContainText("Through this site's relay: HTTP 502 — The stream host answered HTTP 403", { timeout: 20_000 });
    await expect(details).toContainText("HEAD for the content type");
    await shot(page, "player-relay-both-failed");
  });

  test("a link with no file extension that redirects to HLS: the player asks the server what it is first (like Stremio Web) and plays it with hls.js", async ({ page }) => {
    const account = await newAccount("resolver");
    await openFixtureSources(page, account);
    await pick(page, "Relay.resolver");
    await expect.poll(() => video(page).evaluate((v: HTMLVideoElement) => v.currentTime), { timeout: 30_000 }).toBeGreaterThan(0.5);
    expect(await video(page).evaluate((v: HTMLVideoElement) => v.currentSrc)).toMatch(/^blob:/); // hls.js over Media Source, not the native element on a playlist
    expect(await video(page).evaluate((v: HTMLVideoElement) => v.videoWidth)).toBeGreaterThan(0);
    expect(await video(page).evaluate((v: HTMLVideoElement) => v.error)).toBeNull();
    expect((await mediaLog()).some((r) => r.path === "/media/resolve/movie" && r.method === "HEAD")).toBe(true);
  });

  test("the relay is for signed-in sessions only and is not an open proxy", async ({ request }) => {
    const target = `/api/relay/d=${encodeURIComponent(new URL(ADDON).origin)}/media/sample.webm`;
    expect((await request.get(target)).status()).toBe(401); // no session cookie
  });
});
