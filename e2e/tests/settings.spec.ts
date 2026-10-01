import { expect, test } from "@playwright/test";
import { ADDON, ADDON_MANIFEST, newAccount, openSignedIn, shot } from "./helpers";

test.describe("settings", () => {
  test("two-pane layout with the same five categories as the TV", async ({ page }) => {
    const account = await newAccount("settings");
    await openSignedIn(page, account, "/settings");
    await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();
    for (const name of ["Account", "Addons", "Home Rows", "Sounds", "Subtitles"]) await expect(page.locator(".settings__cat", { hasText: name })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Account", level: 2 })).toBeVisible();
    await expect(page.getByText("Manage your ArcTV account")).toBeVisible();
    await shot(page, "settings");
  });

  test("addons: install by URL (even one without CORS), toggle, remove — all synced to the account", async ({ page }) => {
    const account = await newAccount("addons", { addon: false });
    // avoid the default-addon bootstrap: this account already "has data"
    await account.tv.put("/user/settings", { homeRowOrder: [], hiddenRowIds: [], autoplayNextEpisode: true, skipIntroEnabled: true, subtitlesEnabled: true, defaultSubtitleLanguage: null, updatedAt: new Date(Date.now() - 5000).toISOString() });
    await openSignedIn(page, account, "/settings/addons");
    await expect(page.getByText("No addons installed yet")).toBeVisible();
    await page.getByRole("button", { name: "Add Addon" }).click();
    await expect(page).toHaveURL(/\/settings\/addons\/add$/);

    // 1) an addon that sends NO CORS headers: the browser can't read it directly → the server-side fallback fetches it
    await page.getByLabel("Addon manifest URL").fill(`${ADDON}/nocors/manifest.json`);
    await page.getByRole("button", { name: "Install" }).click();
    await expect(page.getByText("Fixture Catalog installed ✓")).toBeVisible({ timeout: 15_000 });
    await expect(page).toHaveURL(/\/settings\/addons$/, { timeout: 10_000 });
    await expect(page.locator(".addon", { hasText: "Fixture Catalog" })).toBeVisible();
    await expect.poll(async () => ((await account.tv.get("/user/addons")).body.items as Array<{ manifestUrl: string }>).map((a) => a.manifestUrl)).toEqual([`${ADDON}/nocors/manifest.json`]);

    // Home now loads its catalogs through the fallback too
    await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Home", exact: true }).click();
    await expect(page.locator(".home__rows .row__title", { hasText: "Popular" })).toBeVisible({ timeout: 20_000 });

    // 2) invalid URL → understandable error
    await page.goto("/settings/addons/add");
    await page.getByLabel("Addon manifest URL").fill("https://127.0.0.1:1/manifest.json");
    await page.getByRole("button", { name: "Install" }).click();
    await expect(page.getByRole("alert")).toContainText("Couldn't install that addon");

    // 3) toggle off → Home is empty; the change reached the account; back on
    await page.goto("/settings/addons");
    const toggle = page.getByRole("switch", { name: "Fixture Catalog enabled" });
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    await expect.poll(async () => ((await account.tv.get("/user/addons")).body.items as Array<{ enabled: boolean }>)[0]?.enabled).toBe(false);
    await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Home", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Your library is empty" })).toBeVisible();
    await page.goto("/settings/addons");
    await page.getByRole("switch", { name: "Fixture Catalog enabled" }).click();

    // 4) remove (with confirmation)
    await page.getByRole("button", { name: "Remove Fixture Catalog" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Remove" }).click();
    await expect(page.getByText("No addons installed yet")).toBeVisible();
    await expect.poll(async () => ((await account.tv.get("/user/addons")).body.items as unknown[]).length).toBe(0);
    void ADDON_MANIFEST;
  });

  test("Home Rows: hide and reorder rows; the layout is saved to the account (and the TV reads the same order)", async ({ page }) => {
    const account = await newAccount("rows");
    await openSignedIn(page, account, "/settings/home-rows");
    await expect(page.getByText("Toggle categories on or off")).toBeVisible();
    const action = page.getByRole("switch", { name: "Action", exact: true });
    await expect(action).toBeVisible();
    await action.click();
    await expect(action).toHaveAttribute("aria-checked", "false");
    // move "Comedy" up once
    await page.getByRole("button", { name: "Move Comedy up" }).click();
    await expect.poll(async () => (await account.tv.get("/user/settings")).body.hiddenRowIds).toEqual(["test.mangotv.fixture_Action"]);
    const saved = (await account.tv.get("/user/settings")).body;
    expect(saved.homeRowOrder.indexOf("test.mangotv.fixture_Comedy")).toBeLessThan(saved.homeRowOrder.indexOf("test.mangotv.fixture_Drama"));
    await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Home", exact: true }).click();
    await expect(page.locator(".home__rows .row__title", { hasText: "Popular" })).toBeVisible({ timeout: 20_000 });
    await expect(page.locator(".home__rows .row__title", { hasText: /^Action$/ })).toHaveCount(0);
  });

  test("Subtitles and Sounds: subtitle defaults sync to the account; the navigation volume stays on this device", async ({ page }) => {
    const account = await newAccount("subs");
    await openSignedIn(page, account, "/settings/subtitles");
    await page.getByRole("radio", { name: "Spanish" }).click();
    await page.getByRole("switch", { name: "Subtitles" }).click();
    await expect.poll(async () => (await account.tv.get("/user/settings")).body).toMatchObject({ defaultSubtitleLanguage: "es", subtitlesEnabled: false });

    const putsBefore = (await account.tv.get("/user/settings")).body.updatedAt;
    await page.goto("/settings/sounds");
    await page.getByLabel("Navigation Volume").fill("20");
    await expect(page.getByText("20%")).toBeVisible();
    await page.waitForTimeout(500);
    expect((await account.tv.get("/user/settings")).body.updatedAt).toBe(putsBefore); // nothing was sent to the account
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("mtv:v1:sound") ?? "{}").navigationVolume)).toBeCloseTo(0.2);
  });

  test("changes made on the TV show up in the browser after a reload (account-wide sync)", async ({ page }) => {
    const account = await newAccount("tvsync");
    await openSignedIn(page, account, "/my-list");
    await expect(page.getByText("Your list is empty.")).toBeVisible();
    await account.tv.post("/user/watchlist", { providerId: "test.mangotv.fixture", contentId: "fxm8", contentType: "MOVIE", title: "Added On TV", posterUrl: `${ADDON}/img/poster/fxm8.svg`, backdropUrl: null, year: 2022, rating: 8.1, watched: false, updatedAt: new Date().toISOString() });
    await page.reload();
    await expect(page.locator(".card__title", { hasText: "Added On TV" })).toBeVisible();
  });
});
