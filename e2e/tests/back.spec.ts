import { expect, test } from "@playwright/test";
import { newAccount, openSignedIn } from "./helpers";

/** Back buttons return to the exact place: the page they were on, at the same scroll position (and row swipe position). */
const scrollY = (page: import("@playwright/test").Page) => page.evaluate(() => Math.round(window.scrollY));

test.describe("back buttons", () => {
  test("Detail's Back returns to Home at the same scroll position and the same row swipe", async ({ page }) => {
    const account = await newAccount("backhome");
    await openSignedIn(page, account);
    const row = page.locator(".home__rows .row__scroller").first();
    await expect(row.locator(".card").first()).toBeVisible({ timeout: 20_000 });
    await page.evaluate(() => window.scrollTo(0, 420));
    await row.evaluate((el) => el.scrollTo({ left: 260, behavior: "instant" as ScrollBehavior }));
    await expect.poll(() => scrollY(page)).toBe(420);
    await page.waitForTimeout(600); // the position is remembered as it changes
    const left = await row.evaluate((el) => Math.round(el.scrollLeft));
    expect(left).toBeGreaterThan(100);
    const title = await row.locator(".card__title").nth(3).textContent();

    await row.locator(".card__surface").nth(3).click();
    await expect(page).toHaveURL(/\/detail\//);
    await expect(page.getByRole("button", { name: "Back" })).toBeVisible();
    await page.getByRole("button", { name: "Back" }).click();

    await expect(page).toHaveURL(/\/$/);
    await expect(row.locator(".card").first()).toBeVisible({ timeout: 20_000 });
    await expect.poll(() => scrollY(page), { timeout: 8_000 }).toBe(420);
    await expect.poll(() => row.evaluate((el) => Math.round(el.scrollLeft)), { timeout: 8_000 }).toBe(left);
    await expect(row.locator(".card__title").nth(3)).toHaveText(title ?? "");
  });

  test("Movies: Back from a title finds the same grid (same order, same scroll position)", async ({ page }) => {
    const account = await newAccount("backmovies");
    await openSignedIn(page, account);
    await page.goto("/movies");
    await expect(page.locator(".grid .card").first()).toBeVisible({ timeout: 20_000 });
    const before = await page.locator(".grid .card__title").allTextContents();
    await page.evaluate(() => window.scrollTo(0, 500));
    await page.waitForTimeout(600);
    const y = await scrollY(page);
    expect(y).toBeGreaterThan(200);
    await page.locator(".grid .card__surface").nth(9).click();
    await expect(page).toHaveURL(/\/detail\//);
    await page.getByRole("button", { name: "Back" }).click();
    await expect(page).toHaveURL(/\/movies$/);
    await expect(page.locator(".grid .card").first()).toBeVisible();
    await expect.poll(() => scrollY(page), { timeout: 8_000 }).toBe(y);
    expect((await page.locator(".grid .card__title").allTextContents()).slice(0, before.length)).toEqual(before);
  });

  test("the Sources page's Back goes to the title's details; a page opened directly has Back to Home", async ({ page }) => {
    const account = await newAccount("backsources");
    await openSignedIn(page, account);
    await page.goto("/");
    await expect(page.locator(".home__rows .card__surface").first()).toBeVisible({ timeout: 20_000 });
    await page.locator(".home__rows .card__surface").first().click();
    await expect(page).toHaveURL(/\/detail\//);
    const detail = page.url();
    await page.getByRole("button", { name: "Play" }).first().click();
    await expect(page).toHaveURL(/\/sources\//);
    await page.getByRole("button", { name: "Back" }).click();
    await expect(page).toHaveURL(detail);

    await page.goto(detail); // opened directly: a fresh history entry with nothing behind it
    await page.evaluate(() => history.replaceState(null, "", location.href));
    await page.goto("/detail/test.mangotv.fixture/MOVIE/fxm2");
    await page.getByRole("button", { name: "Back" }).click();
    await expect(page).toHaveURL(/\/$/);
  });

  test("Continue Watching leaves out titles that already appear in another row", async ({ page }) => {
    const account = await newAccount("cwdedupe");
    await account.tv.seedContinueWatching({ contentId: "fxm4", title: "Already Listed" }); // fxm4 is in the catalogue rows
    await account.tv.seedContinueWatching({ contentId: "zz-not-in-any-row", title: "Only Here" });
    await openSignedIn(page, account);
    await expect(page.locator(".home__rows .row").nth(1)).toBeVisible({ timeout: 20_000 });
    const cw = page.locator(".home__rows .row", { has: page.getByRole("heading", { name: "Continue Watching" }) });
    await expect(cw.locator(".card__title")).toHaveText(["Only Here"]);
  });
});
