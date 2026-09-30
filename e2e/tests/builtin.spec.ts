import { expect, test } from "@playwright/test";
import { newAccount, openSignedIn, useClientIp } from "./helpers";

/**
 * The built-in catalog: Mango TV's own Stremio addon, served by the web server from TMDB (here a fake TMDB). These tests run against a
 * second web server started WITH a TMDB key; every other test runs against one without, like a deployment that never set TMDB_API_KEY.
 */
test.use({ baseURL: process.env.WEB_URL_BUILTIN ?? "http://127.0.0.1:8091" });

const rowTitles = (page: import("@playwright/test").Page) => page.locator(".home__rows .row__title").allTextContents();

test.describe("built-in catalog", () => {
  test("it is a real Stremio addon: manifest, catalog pages of IMDb-id titles (none without an id), and details", async ({ request }) => {
    const manifest = await (await request.get("/addon/manifest.json")).json();
    expect(manifest).toMatchObject({ id: "tv.mango.catalog", resources: ["catalog", "meta"], idPrefixes: ["tt"] });

    const page1 = await (await request.get("/addon/catalog/movie/popular.json")).json();
    const names = page1.metas.map((m: { name: string }) => m.name);
    expect(names).toContain("Tmdb Movie 1");
    expect(names).not.toContain("Tmdb Movie 13"); // TMDB knows no IMDb id for it, so stream addons couldn't find it: left out
    expect(page1.metas[0]).toMatchObject({ id: "tt8000001", type: "movie", poster: expect.stringContaining("/tmdb-img/w500/p1.svg"), background: expect.stringContaining("/tmdb-img/w1280/b1.svg") });

    const meta = await (await request.get("/addon/meta/series/tt8100001.json")).json();
    expect(meta.meta.videos.map((v: { id: string }) => v.id)).toEqual(["tt8100001:1:1", "tt8100001:1:2", "tt8100001:1:3", "tt8100001:2:1", "tt8100001:2:2", "tt8100001:2:3"]);
    expect((await request.get("/addon/meta/movie/tt1234567.json")).status()).toBe(404);
  });

  test("everyone gets its rows on Home next to their own addons — and their account is not touched", async ({ page }) => {
    const account = await newAccount("builtin-existing"); // has the fixture addon installed, like a long-standing user
    const addonsBefore = (await account.tv.get("/user/addons")).body.items;
    const settingsBefore = (await account.tv.get("/user/settings")).body;

    await openSignedIn(page, account);
    await expect(page.locator(".home__rows .card:not([data-cw])").first()).toBeVisible({ timeout: 20_000 });
    await expect.poll(() => rowTitles(page), { timeout: 20_000 }).toEqual(expect.arrayContaining(["Trending", "Top Rated", "Action"]));
    // the account's own addon still contributes: its "Popular" row holds the fixture's titles
    await expect(page.locator(".home__rows .card__title", { hasText: /Tmdb (Movie|Show)/ }).first()).toBeVisible();
    expect(await page.locator(".home__rows .card__title").allTextContents()).toEqual(expect.arrayContaining([expect.stringMatching(/^(?!Tmdb)/)]));

    // nothing was written to the account
    expect((await account.tv.get("/user/addons")).body.items).toEqual(addonsBefore);
    expect((await account.tv.get("/user/settings")).body).toEqual(settingsBefore);

    // Settings → Addons lists only what the account installed, with a note about the built-in catalog
    await page.goto("/settings/addons");
    await expect(page.locator(".addon")).toHaveCount(addonsBefore.length);
    await expect(page.getByText("is built into Mango TV")).toBeVisible();
  });

  test("an account with no addons at all still gets Home rows from it", async ({ page }) => {
    const account = await newAccount("builtin-none", { addon: false });
    await openSignedIn(page, account);
    await expect.poll(() => rowTitles(page), { timeout: 20_000 }).toEqual(expect.arrayContaining(["Trending"]));
    // a brand-new empty account still gets the default addon written to it, as before; the built-in catalog is never written to an account
    const saved = (await account.tv.get("/user/addons")).body.items as Array<{ addonId: string }>;
    expect(saved.map((a) => a.addonId)).not.toContain("tv.mango.catalog");
  });

  test("visitors without an account browse with it: Home, a title's details (TMDB rating, seasons) and Play asks to sign in", async ({ page }) => {
    await useClientIp(page.context());
    await page.goto("/");
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator(".hero__content h1").first()).toBeVisible({ timeout: 20_000 });
    await expect.poll(() => rowTitles(page), { timeout: 20_000 }).toEqual(expect.arrayContaining(["Trending", "Top Rated"]));
    expect(await page.locator(".hero__content h1").first().textContent()).toMatch(/^Tmdb (Movie|Show)/);

    // a series: seasons and episodes come from TMDB
    await page.goto("/detail/tv.mango.catalog/TV_SHOW/tt8100001");
    await expect(page.getByRole("heading", { name: "Tmdb Show 1" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("TMDB Rating")).toBeVisible();
    await expect(page.getByRole("button", { name: "Season 2" })).toBeVisible();
    await page.getByRole("button", { name: "Season 2" }).click();
    await expect(page.getByText("Episode 3").first()).toBeVisible();

    // a movie: its cast comes from TMDB too
    await page.goto("/detail/tv.mango.catalog/MOVIE/tt8000001");
    await expect(page.getByRole("heading", { name: "Tmdb Movie 1" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Fake Actor")).toBeVisible();
    await page.getByRole("button", { name: /Play/ }).first().click();
    await expect(page).toHaveURL(/\/auth$/);
  });

  test("Movies and TV Shows tabs page through it, and Search finds its titles", async ({ page }) => {
    const account = await newAccount("builtin-browse", { addon: false });
    await openSignedIn(page, account, "/movies");
    await expect(page.locator(".grid .card__title", { hasText: "Tmdb Movie" }).first()).toBeVisible({ timeout: 20_000 });
    await page.goto("/search");
    await page.getByPlaceholder("Search movies and TV shows").fill("Tmdb Movie 2");
    await page.keyboard.press("Enter");
    await expect(page.locator(".card__title", { hasText: "Tmdb Movie 2" }).first()).toBeVisible({ timeout: 20_000 });
  });
});
