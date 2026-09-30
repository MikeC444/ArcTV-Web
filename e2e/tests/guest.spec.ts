import { expect, test, type Page } from "@playwright/test";
import { ADDON, newAccount, PASSWORD, useClientIp } from "./helpers";

/**
 * Visitors without an account browse freely (Home, Movies, TV Shows, Genres, Search, Detail). The sign-up / log-in screens
 * appear only when they ask for something that needs an account: Play, My List, Settings.
 */
async function browseAsGuest(page: Page) {
  // The default addon is the real Cinemeta, which the test sandbox cannot reach: answer its requests from the fixture addon instead.
  await page.route("https://v3-cinemeta.strem.io/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/manifest.json") return route.continue();
    try {
      const answer = await route.fetch({ url: `${ADDON}${path}` });
      await route.fulfill({ status: answer.status(), contentType: "application/json", body: await answer.body(), headers: { "access-control-allow-origin": "*" } });
    } catch {
      /* the page navigated away while this was in flight */
    }
  });
  await useClientIp(page.context());
}

test.describe("browsing without an account", () => {
  test("Home opens straight away — no sign-in screen — with a Sign In link instead of Settings", async ({ page }) => {
    await browseAsGuest(page);
    await page.goto("/");
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator(".hero__content h1").first()).toBeVisible({ timeout: 20_000 });
    await expect(page.locator(".card").first()).toBeVisible();
    const nav = page.getByRole("navigation", { name: "Primary" });
    await expect(nav.getByRole("link", { name: /Sign In/ })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Settings" })).toHaveCount(0);

    // the other browsing screens open too
    await page.goto("/movies");
    await expect(page.locator(".grid .card__surface").first()).toBeVisible({ timeout: 20_000 });
    await expect(page).toHaveURL(/\/movies$/);
  });

  test("pressing Play asks for an account, and signing in brings the person back to that title's sources", async ({ page }) => {
    const account = await newAccount("guestplay");
    await browseAsGuest(page);
    await page.goto("/");
    await expect(page.locator(".hero__content h1").first()).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "Play" }).first().click();
    await expect(page).toHaveURL(/\/auth$/);
    await expect(page.getByRole("button", { name: "Log In" })).toBeVisible();

    await page.getByRole("button", { name: "Log In" }).click();
    await page.getByRole("button", { name: "Use Email & Password" }).click();
    await page.getByPlaceholder("Email").fill(account.email);
    await page.getByPlaceholder("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Log In" }).click();
    await expect(page).toHaveURL(/\/sources\//);
  });

  test("My List, Settings and saving a title need an account", async ({ page }) => {
    await browseAsGuest(page);
    await page.goto("/my-list");
    await expect(page).toHaveURL(/\/auth$/);
    await page.goto("/settings");
    await expect(page).toHaveURL(/\/auth$/);

    await page.goto("/");
    await expect(page.locator(".hero__content h1").first()).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "Add to My List" }).first().click();
    await expect(page).toHaveURL(/\/auth$/);
  });
});
