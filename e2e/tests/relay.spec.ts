import { expect, test, type Page } from "@playwright/test";
import { ADDON, newAccount, openSignedIn, shot, type TestAccount } from "./helpers";

/**
 * Content that "selects fine but never starts": hosts that answer a browser-style request with headers and then no video
 * (the signature seen with a real debrid link: emptied → waiting → loadstart → stalled, nothing buffered), and hosts that
 * need request headers a page can't send. Stremio's answer is its streaming server's /proxy/; MangoTV's is the stream relay.
 * The fixture host ("hostile") serves every client EXCEPT ones carrying Sec-Fetch-* headers, i.e. browsers.
 */
type MediaRequest = { path: string; browser: boolean; range: string | null; referer: string | null; required: string | null; userAgent: string | null };
const mediaLog = async () => ((await (await fetch(`${ADDON}/__media-requests`)).json()) as { requests: MediaRequest[] }).requests;
const clearLog = () => fetch(`${ADDON}/__media-requests`, { method: "DELETE" });
const video = (page: Page) => page.locator("video.player__video");

async function openFixtureSources(page: Page, account: TestAccount) {
  await account.tv.installAddon(`${ADDON}/relay/manifest.json`, 1);
  await clearLog();
  await openSignedIn(page, account);
  await page.goto("/sources/test.mangotv.fixture/MOVIE/fxm1/-1/-1");
  await expect(page.getByRole("heading", { name: "Select a Source" })).toBeVisible();
}
const pick = (page: Page, release: string) => page.locator(".source", { hasText: release }).locator(".source__surface").click();

test.describe("stream relay (Stremio-style proxy) — content that used to fail to start", () => {
  test("a host that never delivers video to a browser: after a few seconds the player asks again through the relay, and it plays", async ({ page }) => {
    const account = await newAccount("hostile");
    await page.clock.install(); // lets the test jump past the 12 s the player waits before switching route
    await openFixtureSources(page, account);
    await pick(page, "Relay.hostile");
    await expect(page).toHaveURL(/\/player\//);
    await expect(video(page)).toBeAttached();

    // BEFORE: the browser's own request is accepted and nothing is ever delivered — the reported symptom
    await expect.poll(async () => (await mediaLog()).filter((r) => r.path === "/media/browser-hostile.webm" && r.browser).length).toBeGreaterThan(0);
    expect(await video(page).evaluate((v: HTMLVideoElement) => ({ ready: v.readyState, net: v.networkState, duration: v.duration }))).toMatchObject({ ready: 0, net: 2 }); // HAVE_NOTHING, NETWORK_LOADING
    expect(await video(page).evaluate((v: HTMLVideoElement) => v.currentSrc)).not.toContain("/api/relay/");

    // AFTER: still nothing after 12 s → same stream, fetched by the web server like a native player would
    await page.clock.fastForward(13_000);
    await expect.poll(() => video(page).evaluate((v: HTMLVideoElement) => v.currentTime), { timeout: 20_000 }).toBeGreaterThan(0.5);
    expect(await video(page).evaluate((v: HTMLVideoElement) => v.currentSrc)).toContain("/api/relay/");
    expect(await video(page).evaluate((v: HTMLVideoElement) => v.videoWidth)).toBeGreaterThan(0); // real picture, not just a ticking clock

    const requests = await mediaLog();
    const viaRelay = requests.find((r) => r.path === "/media/browser-hostile.webm" && !r.browser);
    expect(viaRelay, "the relay's own request reached the host").toBeTruthy();
    expect(viaRelay!.userAgent).toContain("MangoTV-Web");
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

  test("when the relay can't get it either, the error says both routes were tried, and the connection test shows what the relay got", async ({ page }) => {
    const account = await newAccount("dead");
    await page.clock.install();
    await openFixtureSources(page, account);
    await pick(page, "Relay.dead");
    await expect(video(page)).toBeAttached();
    await page.clock.fastForward(13_000); // direct request delivered nothing → relay → the host answers it 403

    const alert = page.getByRole("alertdialog", { name: "Unable to play this source" });
    await expect(alert).toBeVisible({ timeout: 15_000 });
    await expect(alert).toContainText("Tried directly and through this site's relay");
    await alert.getByText("Technical details").click();
    await expect(alert.locator(".perror__pre")).toContainText("route direct, then relay");
    await expect(alert.locator(".perror__pre")).toContainText("relay-fallback (the direct request delivered no video)");

    await alert.getByRole("button", { name: "Test connection" }).click();
    const pre = alert.locator(".perror__pre");
    await expect(pre).toContainText("Range GET bytes=0-1"); // the plain and ranged probes get this host's headers at once
    await page.clock.fastForward(11_000); // …but the third one waits for a body that never comes, until its timer fires
    await expect(pre).toContainText("Reading the answer (only possible if the server allows it): no answer within 10 s");
    await expect(pre).toContainText("Through this site's relay: HTTP 502 — The stream host answered HTTP 403", { timeout: 15_000 });
    await shot(page, "player-relay-both-failed");
  });

  test("the relay is for signed-in sessions only and is not an open proxy", async ({ request }) => {
    const target = `/api/relay/d=${encodeURIComponent(new URL(ADDON).origin)}/media/sample.webm`;
    expect((await request.get(target)).status()).toBe(401); // no session cookie
  });
});
