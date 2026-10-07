import { expect, test } from "@playwright/test";
import { ADDON, newAccount, openSignedIn, shot } from "./helpers";

const progress = (contentId: string, title: string, over: Record<string, unknown>) => ({
  providerId: "test.mangotv.fixture",
  contentId,
  contentType: "MOVIE",
  seasonNumber: null,
  episodeNumber: null,
  episodeTitle: null,
  title,
  posterUrl: `${ADDON}/img/poster/${contentId}.svg`,
  backdropUrl: null,
  positionMs: 6_000_000,
  durationMs: 6_000_000,
  completed: true,
  watchedAt: new Date(Date.now() - 3_600_000).toISOString(),
  ...over,
});

test.describe("ArcTV Plus extras", () => {
  test("Settings → Your stats shows your stats, counted from the watch history", async ({ page }) => {
    const account = await newAccount("stats");
    for (const body of [
      progress("fxm1", "Fixture Movie One", {}),
      progress("fxm2", "Fixture Movie Two", { positionMs: 1_800_000, completed: false, watchedAt: new Date(Date.now() - 2 * 86_400_000).toISOString() }),
      progress("fxs1", "Fixture Show", { contentType: "TV_SHOW", seasonNumber: 1, episodeNumber: 1, positionMs: 2_400_000, durationMs: 2_400_000, watchedAt: new Date(Date.now() - 86_400_000).toISOString() }),
      progress("fxs1", "Fixture Show", { contentType: "TV_SHOW", seasonNumber: 1, episodeNumber: 2, positionMs: 2_400_000, durationMs: 2_400_000 }),
    ]) {
      expect((await account.tv.post("/user/watch-progress", body)).status).toBe(200);
    }
    await openSignedIn(page, account, "/settings/stats");
    const stats = page.getByRole("region", { name: "Your stats" });
    await expect(stats.getByText("You've watched")).toBeVisible();
    await expect(stats.locator(".stats__big")).toContainText("3 hours 30 minutes");
    await expect(stats.getByText("Movies finished")).toBeVisible();
    await expect(stats.locator(".stats__tile", { hasText: "Movies finished" })).toContainText("1");
    await expect(stats.locator(".stats__tile", { hasText: "Episodes watched" })).toContainText("2");
    await expect(stats.locator(".stats__bar[data-peak=\"true\"]")).toHaveCount(1);
    await shot(page, "settings-stats");
  });

  test("Your stats is its own tab in the You group, and shown but not clickable without Plus", async ({ page }) => {
    const account = await newAccount("statstab");
    await openSignedIn(page, account, "/settings/account");
    const tab = page.getByRole("link", { name: "Your stats" }).or(page.locator(".settings__cat", { hasText: "Your stats" }));
    await expect(tab).toBeVisible();
    await expect(page.getByRole("region", { name: "Your stats" })).toHaveCount(0); // no longer under Account

    // the same account when the paywall is on and it has no Plus
    await page.route("**/user/plus", (route) =>
      route.request().method() === "GET"
        ? route.fulfill({ json: { active: false, plan: null, validUntil: null, cancelAtPeriodEnd: false, paywall: true, trialDays: 5 } })
        : route.continue(),
    );
    await page.goto("/settings/account");
    const locked = page.locator(".settings__cat", { hasText: "Your stats" });
    await expect(locked).toHaveAttribute("data-locked", "true");
    await expect(locked).toContainText("Plus");
    await expect(locked).toBeDisabled();
    await shot(page, "settings-stats-locked");
    await locked.click({ force: true });
    await expect(page).toHaveURL(/\/settings\/account/); // it did not open
    await page.goto("/settings/stats"); // by address: it says what it is and where to get it
    await expect(page.getByText("Your stats are only for ArcTV Plus.")).toBeVisible();
  });

  test("Smart source picking skips the source list and plays the best source", async ({ page }) => {
    const account = await newAccount("smart");
    await page.addInitScript(() => {
      localStorage.setItem("mtv:v1:playerPrefs", JSON.stringify({ smartSourcePicking: true }));
      // Remember if a source row (or the "Select a Source" heading) is ever on screen: the list must never flash up before the player.
      const w = window as unknown as { __sawList?: boolean };
      new MutationObserver(() => {
        if (document.querySelector(".source, .sources__main")) w.__sawList = true;
      }).observe(document, { childList: true, subtree: true });
    });
    await openSignedIn(page, account, "/detail/test.mangotv.fixture/MOVIE/fxm1");
    await page.getByRole("button", { name: /Play/ }).first().click();
    await page.waitForURL(/\/player\/test\.mangotv\.fixture\/MOVIE\/fxm1\//);
    await expect(page.locator("video.player__video")).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __sawList?: boolean }).__sawList ?? false)).toBe(false);
    // the list was replaced by the player, so Back goes to the title, not to a list the person never saw
    await page.goBack();
    await expect(page).toHaveURL(/\/detail\//);
  });

  test("with Smart source picking off the list is shown as usual, and the Plus settings tab has the switch", async ({ page }) => {
    const account = await newAccount("smartoff");
    await openSignedIn(page, account, "/sources/test.mangotv.fixture/MOVIE/fxm1/-1/-1");
    await expect(page.locator(".source").first()).toBeVisible();
    await expect(page).toHaveURL(/\/sources\//);
    await page.goto("/settings/plus-settings");
    const toggle = page.getByRole("switch", { name: "Smart source picking" });
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await shot(page, "settings-plus-settings");
  });
});
