import { expect, test, type Page } from "@playwright/test";
import { newAccount, openSignedIn, shot } from "./helpers";

const video = (page: Page) => page.locator("video.player__video");
const time = (page: Page) => video(page).evaluate((v: HTMLVideoElement) => v.currentTime);

async function openSources(page: Page, path = "/sources/test.arctv.fixture/MOVIE/fxm1/-1/-1") {
  await page.goto(path);
  await expect(page.getByRole("heading", { name: "Select a Source" })).toBeVisible();
  await expect(page.locator(".source").first()).toBeVisible();
}
const row = (page: Page, name: string) => page.locator(".source", { hasText: name });

test.describe("sources and playback", () => {
  test("Select a Source: quality badges, recommended pick, browser-support warnings, filters and sort", async ({ page }) => {
    const account = await newAccount("sources");
    await openSignedIn(page, account);
    await openSources(page);
    await expect(page.locator(".source")).toHaveCount(6);
    await expect(page.locator(".source__reco")).toHaveCount(1);
    // the recommendation is a source this browser can actually play, not the (higher-quality) torrent
    await expect(row(page, "Fixture HLS").locator(".source__reco")).toBeVisible();
    // every source says whether THIS device can play it, and why not
    await expect(row(page, "Fixture Direct")).toContainText("Should play here"); // WebM / VP9
    await expect(row(page, "Fixture HLS")).toContainText("Should play here"); // HLS through hls.js
    await expect(row(page, "Fixture Torrent")).toContainText("Can't play here — Torrent source");
    await expect(row(page, "Fixture Headers")).toContainText("via this site's relay"); // special request headers → the web server fetches it, like Stremio's proxy
    await expect(row(page, "Fixture Web-unready")).toContainText("Might not play");
    await expect(row(page, "Fixture MKV")).toContainText(/Should play here|Can't play here/); // depends on the codecs of the browser running the test
    await expect(row(page, "Fixture Direct")).toContainText("250 seeders");
    // the list starts sorted by size, biggest first — after the recommended source, which is always the first row
    await expect(page.getByRole("button", { name: /Sort by Size/ })).toBeVisible();
    await expect(page.locator(".source").first()).toContainText("Fixture HLS");
    await expect(page.locator(".source").nth(1)).toContainText("Fixture Torrent"); // 40 GB
    await expect(page.locator(".source").last()).toContainText("Fixture Web-unready"); // 700 MB
    // "Quality" lists playable sources first
    await page.getByRole("button", { name: /Sort by Size/ }).click();
    await expect(page.getByRole("button", { name: /Sort by Quality/ })).toBeVisible();
    await expect(page.locator(".source").first()).toContainText("Fixture HLS");
    await expect(page.locator(".source").last()).toContainText(/Fixture (Torrent|MKV)/); // what this device can't play goes last
    // the "This device" panel says what the browser supports
    const device = page.locator(".addonres", { has: page.locator("summary", { hasText: "This device:" }) });
    await device.locator("summary").click();
    await expect(device.locator(".devcaps__item", { hasText: "MKV" })).toBeVisible();
    await expect(device.locator(".devcaps__item", { hasText: "H.264" })).toBeVisible();
    await shot(page, "sources");

    // "Plays on this device" hides what can't play, and turns off again
    await page.getByRole("button", { name: "Plays on this device" }).click();
    await expect(row(page, "Fixture Torrent")).toHaveCount(0);
    await expect(row(page, "Fixture Headers")).toHaveCount(1); // playable through the relay
    await expect(row(page, "Fixture Direct")).toHaveCount(1);
    await page.getByRole("button", { name: "Plays on this device" }).click();
    await expect(page.locator(".source")).toHaveCount(6);

    await page.getByRole("button", { name: "4K", exact: true }).click();
    await expect(page.locator(".source")).toHaveCount(2); // the recommended source, then the one 4K source
    await page.getByRole("button", { name: "All Sources" }).click();
    await expect(page.locator(".source")).toHaveCount(6);
    await page.getByRole("button", { name: /Sort by Quality/ }).click();
    await expect(page.getByRole("button", { name: /Sort by Seeders/ })).toBeVisible();
    const second = await page.locator(".source").nth(1).locator(".source__body span").first().textContent();
    expect(second).toContain("2160p"); // 1500 seeders → first by Seeders, after the recommended source
  });

  test("the recommended source is always the first row — whatever the sort or the quality filter", async ({ page }) => {
    const account = await newAccount("pinned");
    await openSignedIn(page, account);
    await openSources(page);
    const first = page.locator(".source").first();
    await expect(first).toContainText("Recommended");
    await expect(first).toContainText("Fixture HLS");

    for (let i = 0; i < 3; i++) {
      await page.getByRole("button", { name: /^Sort by/ }).click(); // Size → Quality → Seeders → Size
      await expect(page.locator(".source").first()).toContainText("Recommended");
      await expect(page.locator(".source__reco")).toHaveCount(1);
    }

    // a quality filter that doesn't include it leaves it on top, followed by what the filter kept
    await page.getByRole("button", { name: "720p", exact: true }).click();
    await expect(page.locator(".source").first()).toContainText("Fixture HLS");
    await expect(page.locator(".source").first()).toContainText("Recommended");
    const rows = await page.locator(".source").count();
    expect(rows).toBeGreaterThan(1);
    // …and when nothing else matches, it is still there with a way back to everything
    await page.getByRole("button", { name: "Other", exact: true }).click();
    await expect(page.locator(".source").first()).toContainText("Recommended");
  });

  test("a progressive WebM source plays, reports progress to the account, and Resume restarts where you left off", async ({ page }) => {
    const account = await newAccount("play");
    await openSignedIn(page, account);
    await openSources(page, "/sources/test.arctv.fixture/TV_SHOW/fxs2/1/1");
    await row(page, "Fixture Direct").locator(".source__surface").click();
    await expect(page).toHaveURL(/\/player\//);
    await expect(video(page)).toBeVisible();
    await expect.poll(() => time(page), { timeout: 15_000 }).toBeGreaterThan(1);
    await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
    // title / episode line, per PlayerTopBar
    await expect(page.locator(".ptop__title")).toContainText("S1 E1 • Chapter 1");
    await shot(page, "player");

    // jump to 10.5 s (past the 10 s reporting floor), pause → the position is reported to the account
    await video(page).evaluate((v: HTMLVideoElement) => { v.currentTime = 10.5; });
    await page.keyboard.press("k");
    await expect(page.getByRole("button", { name: "Play", exact: true })).toBeVisible();
    await expect.poll(async () => {
      const items = (await account.tv.get("/user/continue-watching")).body.items as Array<{ contentId: string; seasonNumber: number; episodeNumber: number; positionMs: number }>;
      return items.find((i) => i.contentId === "fxs2");
    }, { timeout: 15_000 }).toMatchObject({ seasonNumber: 1, episodeNumber: 1 });
    const cw = ((await account.tv.get("/user/continue-watching")).body.items as Array<{ contentId: string; positionMs: number }>).find((i) => i.contentId === "fxs2")!;
    expect(cw.positionMs).toBeGreaterThan(10_000);

    // leave; Detail now says Resume, and Resume goes straight back into the remembered source at that position
    await page.goto("/detail/test.arctv.fixture/TV_SHOW/fxs2");
    await expect(page.getByRole("button", { name: "Resume S1E1" })).toBeVisible();
    await page.getByRole("button", { name: "Resume S1E1" }).click();
    await expect(page).toHaveURL(/\/player\//, { timeout: 15_000 });
    await expect.poll(() => time(page), { timeout: 15_000 }).toBeGreaterThan(9);
  });

  test("finishing a movie past 85 % marks it watched and clears it from Continue Watching", async ({ page }) => {
    const account = await newAccount("finish");
    await openSignedIn(page, account);
    await openSources(page, "/sources/test.arctv.fixture/MOVIE/fxm6/-1/-1");
    await row(page, "Fixture Direct").locator(".source__surface").click();
    await expect.poll(() => time(page), { timeout: 15_000 }).toBeGreaterThan(0.5);
    await video(page).evaluate((v: HTMLVideoElement) => { v.currentTime = 11; });
    await page.keyboard.press("k");
    await expect.poll(async () => ((await account.tv.get("/user/watchlist")).body.items as Array<{ contentId: string; watched: boolean }>).find((i) => i.contentId === "fxm6")?.watched, { timeout: 15_000 }).toBe(true);
    expect(((await account.tv.get("/user/continue-watching")).body.items as unknown[]).length).toBe(0);
    const history = (await account.tv.get("/user/history")).body.items as Array<{ contentId: string; completed: boolean }>;
    expect(history.find((h) => h.contentId === "fxm6")?.completed).toBe(true);
  });

  test("HLS: hls.js plays it, Quality and Subtitles menus list the stream's real tracks and work", async ({ page }) => {
    const account = await newAccount("hls");
    await openSignedIn(page, account);
    await openSources(page);
    await row(page, "Fixture HLS").locator(".source__surface").click();
    await expect.poll(() => time(page), { timeout: 20_000 }).toBeGreaterThan(1);
    await page.mouse.move(200, 200);
    await page.getByRole("button", { name: "Quality" }).click();
    const quality = page.getByRole("dialog", { name: "Quality" });
    await expect(quality.getByRole("option")).toHaveText([/Auto/, /270p/, /180p/]);
    await quality.getByRole("option", { name: /180p/ }).click();
    await expect.poll(() => video(page).evaluate((v: HTMLVideoElement) => v.videoHeight), { timeout: 15_000 }).toBe(180);

    await page.mouse.move(210, 210);
    await page.getByRole("button", { name: "Subtitles" }).click();
    const subs = page.getByRole("dialog", { name: "Subtitles" });
    await expect(subs.getByRole("option")).toHaveText([/Off/, /English/, /Español/]);
    await subs.getByRole("option", { name: /Español/ }).click();
    await expect.poll(() => video(page).evaluate((v: HTMLVideoElement) => Array.from(v.textTracks).some((t) => t.mode === "showing" && t.language === "es")), { timeout: 10_000 }).toBe(true);

    await page.mouse.move(220, 220);
    await page.getByRole("button", { name: "Player settings" }).click();
    await page.getByRole("dialog", { name: "Settings" }).getByRole("button", { name: /Playback Speed/ }).click();
    await page.getByRole("option", { name: "1.5x" }).click();
    expect(await video(page).evaluate((v: HTMLVideoElement) => v.playbackRate)).toBe(1.5);
    await shot(page, "player-menu");
  });

  test("unplayable sources explain WHY in plain language — torrent, missing file — and offer a way out", async ({ page }) => {
    const account = await newAccount("errors");
    await openSignedIn(page, account);
    await openSources(page);

    await row(page, "Fixture Torrent").locator(".source__surface").click();
    let alert = page.getByRole("alertdialog", { name: "Unable to play this source" });
    await expect(alert).toContainText("torrent");
    await expect(alert.getByRole("button", { name: "Change Source" })).toBeVisible();
    await shot(page, "player-error-torrent");
    await alert.getByRole("button", { name: "Change Source" }).click();
    await expect(page.getByRole("heading", { name: "Select a Source" })).toBeVisible();

    await row(page, "Fixture MKV").locator(".source__surface").click();
    alert = page.getByRole("alertdialog", { name: "Unable to play this source" });
    await expect(alert).toBeVisible({ timeout: 15_000 });
    await expect(alert).toContainText(/format|downloaded|supported|blocks web playback/);
    await alert.getByRole("button", { name: "Change Source" }).click();
    await expect(page.getByRole("heading", { name: "Select a Source" })).toBeVisible();
  });

  test("keyboard shortcuts: Space pauses, arrows seek ±10 s, M mutes; controls hide while playing", async ({ page }) => {
    const account = await newAccount("keys");
    await openSignedIn(page, account);
    await openSources(page);
    await row(page, "Fixture Direct").locator(".source__surface").click();
    await expect.poll(() => time(page), { timeout: 15_000 }).toBeGreaterThan(0.5);
    await page.keyboard.press("Space");
    await expect.poll(() => video(page).evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
    const t0 = await time(page);
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => time(page)).toBeGreaterThan(t0 + 8);
    await page.keyboard.press("ArrowLeft");
    await expect.poll(() => time(page)).toBeLessThan(t0 + 5);
    await page.keyboard.press("m");
    expect(await video(page).evaluate((v: HTMLVideoElement) => v.muted)).toBe(true);
    await page.keyboard.press("Space");
    await expect.poll(() => video(page).evaluate((v: HTMLVideoElement) => v.paused)).toBe(false);
    await page.waitForTimeout(4500); // controls auto-hide after 4 s
    await expect(page.locator(".pctl")).toHaveAttribute("data-visible", "false");
    await page.mouse.move(400, 400);
    await expect(page.locator(".pctl")).toHaveAttribute("data-visible", "true");
  });

  test("autoplay next episode: at the end of an episode an Up-next countdown opens the next one", async ({ page }) => {
    const account = await newAccount("next");
    await openSignedIn(page, account);
    await openSources(page, "/sources/test.arctv.fixture/TV_SHOW/fxs3/1/1");
    await row(page, "Fixture Direct").locator(".source__surface").click();
    await expect.poll(() => time(page), { timeout: 15_000 }).toBeGreaterThan(0.5);
    await video(page).evaluate((v: HTMLVideoElement) => { v.currentTime = 11.2; });
    await expect(page.getByRole("alertdialog", { name: "Up next" })).toContainText("S1 E2 • Chapter 2", { timeout: 15_000 });
    await expect(page).toHaveURL(/\/player\/.*\/1\/2\//, { timeout: 25_000 });
  });
});
