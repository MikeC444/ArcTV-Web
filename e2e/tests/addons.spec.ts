import { expect, test } from "@playwright/test";
import { ADDON, newAccount, openSignedIn, shot } from "./helpers";

/**
 * "Is the web app really asking my addons for streams when I press Play?" — proven against fixture addons that behave
 * like real ones: stream-only addons with a config in their URL (like debrid addons), one that blocks browsers (no CORS),
 * one that errors, one with nothing, and a catalog-only addon like Cinemeta.
 */
const requests = async () => ((await (await fetch(`${ADDON}/__requests`)).json()) as { requests: string[] }).requests.map((r) => decodeURIComponent(r));
const clearRequests = () => fetch(`${ADDON}/__requests`, { method: "DELETE" });

test.describe("addons are asked for streams", () => {
  test("stream-only addons (config in the URL) are queried — directly, and through the server when they block browsers", async ({ page }) => {
    const account = await newAccount("streamonly");
    await account.tv.installAddon(`${ADDON}/streamonly/providers=yts,eztv|realdebrid=PLACEHOLDER/manifest.json`, 1);
    await account.tv.installAddon(`${ADDON}/nocors/streamonly/nocors=1|x=2/manifest.json`, 2);
    await account.tv.installAddon(`${ADDON}/nostreams/manifest.json`, 3);
    await clearRequests();
    await openSignedIn(page, account);
    await page.goto("/sources/test.mangotv.fixture/MOVIE/fxm1/-1/-1");
    await expect(page.getByRole("heading", { name: "Select a Source" })).toBeVisible();

    // catalog addon's own 6 + 2 from each stream-only addon
    await expect(page.locator(".source")).toHaveCount(10, { timeout: 20_000 });
    await expect(page.locator(".source", { hasText: "Stream providers" })).toHaveCount(2);
    await expect(page.locator(".source", { hasText: "Stream nocors" })).toHaveCount(2);

    const log = await requests();
    expect(log.some((r) => /^GET \/streamonly\/providers=yts,eztv\|realdebrid=PLACEHOLDER\/stream\/movie\/fxm1\.json$/.test(r))).toBe(true);
    expect(log.some((r) => /^GET \/nocors\/streamonly\/nocors=1\|x=2\/stream\/movie\/fxm1\.json$/.test(r))).toBe(true); // reached via the server-side fallback
    expect(log.filter((r) => r.includes("/nostreams/stream/"))).toHaveLength(0); // a catalog-only addon is never asked for streams

    // the panel says who was asked and what each answered
    const panel = page.locator(".addonres", { has: page.locator("summary", { hasText: "Addon results" }) });
    await expect(panel.locator("summary")).toContainText("Addon results (4)");
    await panel.locator("summary").click();
    await expect(panel.locator(".addonres__row", { hasText: "Fixture Streams providers" })).toContainText("2 sources");
    await expect(panel.locator(".addonres__row", { hasText: "Fixture Catalog Only" })).toContainText("Doesn't provide streams");
    await shot(page, "sources-addon-results");

    // and a source from a stream-only addon really plays
    await page.locator(".source", { hasText: "Stream providers" }).first().locator(".source__surface").click();
    await expect(page).toHaveURL(/\/player\//);
    await expect.poll(() => page.locator("video.player__video").evaluate((v: HTMLVideoElement) => v.currentTime), { timeout: 15_000 }).toBeGreaterThan(0.5);
  });

  test("addons that fail, have nothing, or don't provide streams say so — with a way to try again", async ({ page }) => {
    const account = await newAccount("noresults", { addon: false });
    await account.tv.installAddon(`${ADDON}/nostreams/manifest.json`, 0); // supplies the title's details only
    await account.tv.installAddon(`${ADDON}/broken/manifest.json`, 1);
    await account.tv.installAddon(`${ADDON}/empty/manifest.json`, 2);
    await clearRequests();
    await openSignedIn(page, account);
    await page.goto("/sources/test.mangotv.nostreams/MOVIE/fxm1/-1/-1");

    await expect(page.getByRole("heading", { name: "No sources found" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Some of your addons didn't answer")).toBeVisible();
    const rows = page.locator(".addonres__row");
    await expect(rows.filter({ hasText: "Fixture Broken" })).toContainText("had a problem answering (HTTP 500)");
    await expect(rows.filter({ hasText: "Fixture Empty" })).toContainText("No streams for this title");
    await expect(rows.filter({ hasText: "Fixture Catalog Only" })).toContainText("Doesn't provide streams");
    await shot(page, "sources-empty");

    let log = await requests();
    expect(log.filter((r) => r.includes("/broken/stream/"))).toHaveLength(1);
    expect(log.filter((r) => r.includes("/empty/stream/"))).toHaveLength(1);
    expect(log.filter((r) => r.includes("/nostreams/stream/"))).toHaveLength(0);

    await page.getByRole("button", { name: "Try Again" }).click();
    await expect(page.getByRole("heading", { name: "No sources found" })).toBeVisible();
    await expect.poll(async () => (await requests()).filter((r) => r.includes("/broken/stream/")).length).toBe(2);
    log = await requests();
    expect(log.filter((r) => r.includes("/empty/stream/"))).toHaveLength(2);
  });

  test("with no stream addon at all the page says so and points to Settings → Addons", async ({ page }) => {
    const account = await newAccount("nostreamaddon", { addon: false });
    await account.tv.installAddon(`${ADDON}/nostreams/manifest.json`, 0);
    await openSignedIn(page, account);
    await page.goto("/sources/test.mangotv.nostreams/MOVIE/fxm1/-1/-1");
    await expect(page.getByRole("heading", { name: "No sources found" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("None of your installed addons provide streams")).toBeVisible();
    await page.getByRole("button", { name: "Manage Addons" }).click();
    await expect(page).toHaveURL(/\/settings\/addons/);
  });

  test("a source that never starts: a reassuring note after 15 s, then a clear reason after 45 s (never an endless spinner)", async ({ page }) => {
    const account = await newAccount("stall");
    await account.tv.installAddon(`${ADDON}/stall/manifest.json`, 1);
    await page.clock.install(); // lets the test jump past the watchdog timers instead of waiting a minute
    await openSignedIn(page, account);
    await page.goto("/sources/test.mangotv.fixture/MOVIE/fxm1/-1/-1");
    await page.locator(".source", { hasText: "Stream stall" }).locator(".source__surface").click();
    await expect(page).toHaveURL(/\/player\//);

    // the loading spinner is a real 48px ring, not a collapsed sliver
    const ring = await page.locator(".player__spinner .spinner").boundingBox();
    expect(ring!.width).toBeGreaterThan(40);
    expect(ring!.height).toBeGreaterThan(40);

    await page.clock.fastForward(16_000);
    await expect(page.getByText("Still trying to start this source")).toBeVisible();
    await shot(page, "player-slow-start");

    await page.clock.fastForward(30_000);
    const alert = page.getByRole("alertdialog", { name: "Unable to play this source" });
    await expect(alert).toContainText("didn't start playing within 45 seconds");
    await expect(alert).toContainText(new URL(ADDON).host); // names the server, never the full link
    // a technical account is one click away, and never contains the link's query / key
    await alert.getByText("Technical details").click();
    const details = alert.locator(".perror__pre");
    await expect(details).toContainText("network LOADING");
    await expect(details).toContainText("file type .webm");
    await expect(details).toContainText("loadstart");
    expect(await details.textContent()).not.toMatch(/SECRET|apikey/i);
    await expect(alert.getByRole("button", { name: "Copy details" })).toBeVisible();

    // "Test connection" asks the server the tab-style and player-style questions and reports that this one never answers
    await alert.getByRole("button", { name: "Test connection" }).click();
    await page.clock.fastForward(11_000);
    await expect(details).toContainText("Plain GET (what opening the link in a tab does): no answer within 10 s");
    await page.clock.fastForward(11_000);
    await expect(details).toContainText("Range GET bytes=0-1 (what the video player does): no answer within 10 s");
    await page.clock.fastForward(11_000);
    await expect(details).toContainText("Reading the answer (only possible if the server allows it): no answer within 10 s");
    expect(await details.textContent()).not.toMatch(/SECRET|apikey/i);
    await shot(page, "player-start-timeout");
    await alert.getByRole("button", { name: "Change Source" }).click();
    await expect(page.getByRole("heading", { name: "Select a Source" })).toBeVisible();
  });
});
