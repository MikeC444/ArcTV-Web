import { expect, test } from "@playwright/test";
import { ADDON, newAccount, openSignedIn, shot } from "./helpers";

const progress = (contentId: string, title: string, over: Record<string, unknown>) => ({
  providerId: "test.arctv.fixture",
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

    // clearer labels
    await expect(stats.getByText("On days you watch")).toBeVisible();
    await expect(stats.locator(".stats__tile", { hasText: "On days you watch" })).toContainText("3 days watched");
    await expect(stats.getByText("Per day you watch")).toHaveCount(0);
    await expect(stats.locator(".stats__period").first()).toContainText("all time");
    // the activity grid: month names above it, a readout for the day tapped, and what the darkest square means
    await expect(stats.locator(".stats__heatmonths li", { hasText: /[A-Za-z]/ }).first()).toBeVisible();
    await stats.locator(".stats__cell[data-level]:not(.stats__cell--key)").last().click();
    await expect(stats.locator(".stats__readout")).toContainText("·");
    await expect(stats.locator(".stats__legend")).toContainText("the darkest is");
    // the weekday bars: today marked, and the busiest day in a sentence
    await expect(stats.locator('.stats__bar[data-today="true"]')).toHaveCount(1);
    await expect(stats.getByText(/You watch most on \w+days\./)).toBeVisible();
    // most watched, and the recap
    await expect(stats.getByRole("heading", { name: /Most watched/ })).toBeVisible();
    await expect(stats.locator(".stats__toprow", { hasText: "Fixture Show" })).toBeVisible();
    await expect(stats.locator(".stats__toprow", { hasText: "Fixture Movie One" })).toBeVisible();
    await expect(stats.getByText("My ArcTV recap")).toBeVisible();
    await expect(stats.getByRole("button", { name: /Save as image|Share/ })).toHaveCount(0); // the recap is a summary only
    // what counts towards the stats, explained and opened on demand
    await stats.getByText("What counts towards your stats").click();
    await expect(stats.getByText(/counts once, on the day you last watched it/)).toBeVisible();
    await shot(page, "settings-stats");
  });

  test("Reset stats starts the numbers again from today on the account, deletes nothing, and can be undone", async ({ page }) => {
    const account = await newAccount("statsreset");
    expect((await account.tv.post("/user/watch-progress", progress("fxm1", "Fixture Movie One", {}))).status).toBe(200);
    await openSignedIn(page, account, "/settings/stats");
    const stats = page.getByRole("region", { name: "Your stats" });
    await expect(stats.locator(".stats__big")).toContainText("1 hour 40 minutes");

    // asking first: Cancel changes nothing
    await stats.getByRole("button", { name: "Reset stats" }).click();
    await expect(stats.getByRole("group", { name: "Reset your stats" })).toContainText("Start your stats again from today?");
    await stats.getByRole("button", { name: "Cancel" }).click();
    await expect(stats.locator(".stats__big")).toContainText("1 hour 40 minutes");

    // reset: nothing is counted any more, the account remembers it, the history is untouched
    await stats.getByRole("button", { name: "Reset stats" }).click();
    await stats.getByRole("button", { name: "Yes, reset" }).click();
    await expect(stats.getByText("Nothing here yet.")).toBeVisible();
    await expect(stats.getByText(/Counting from /)).toBeVisible();
    await expect.poll(async () => (await account.tv.get("/user/settings")).body.statsResetAt).not.toBeNull();
    expect((await account.tv.get("/user/history?limit=10")).body.items).toHaveLength(1);
    await page.reload();
    await expect(stats.getByText("Nothing here yet.")).toBeVisible(); // still reset after a reload
    await shot(page, "settings-stats-reset");

    // watching something new counts again, from the reset on
    expect((await account.tv.post("/user/watch-progress", progress("fxm2", "Fixture Movie Two", { positionMs: 1_800_000, durationMs: 1_800_000, watchedAt: new Date().toISOString() }))).status).toBe(200);
    await page.reload();
    await expect(stats.locator(".stats__big")).toContainText("30 minutes");

    // bring the old numbers back
    await stats.getByRole("button", { name: "Show all my history again" }).click();
    await expect(stats.locator(".stats__big")).toContainText("2 hours 10 minutes");
    await expect.poll(async () => (await account.tv.get("/user/settings")).body.statsResetAt).toBeNull();
  });

  test("Your stats is its own tab in the You group, and shows a preview page without Plus, and is not marked as locked", async ({ page }) => {
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
    const locked = page.locator(".settings__cat", { hasText: "Your stats" }); // (not locked any more; the name is from when it was)
    await expect(locked).toHaveAttribute("data-locked", "false"); // no lock or Plus tag: it invites a click, and opens to a taste of the page
    await expect(locked).not.toContainText("Plus");
    await expect(locked).toBeEnabled();
    await expect(page.locator(".settings__cat", { hasText: "Recommendations" })).toHaveAttribute("data-locked", "true"); // the others stay locked
    await shot(page, "settings-stats-locked");
    await locked.click();
    await expect(page).toHaveURL(/\/settings\/stats/);
    await expect(page.getByText("Your stats are only for ArcTV Plus.")).toBeVisible(); // no history yet: it says what it is and where to get it
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
    await openSignedIn(page, account, "/detail/test.arctv.fixture/MOVIE/fxm1");
    await page.getByRole("button", { name: /Play/ }).first().click();
    await page.waitForURL(/\/player\/test\.arctv\.fixture\/MOVIE\/fxm1\//);
    await expect(page.locator("video.player__video")).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __sawList?: boolean }).__sawList ?? false)).toBe(false);
    // the list was replaced by the player, so Back goes to the title, not to a list the person never saw
    await page.goBack();
    await expect(page).toHaveURL(/\/detail\//);
  });

  test("with Smart source picking off the list is shown as usual, and the Plus settings tab has the switch", async ({ page }) => {
    const account = await newAccount("smartoff");
    await openSignedIn(page, account, "/sources/test.arctv.fixture/MOVIE/fxm1/-1/-1");
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
