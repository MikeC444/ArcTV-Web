import { expect, test, type Page } from "@playwright/test";
import { newAccount, openSignedIn, shot } from "./helpers";

/**
 * Every main screen at four viewport sizes (1920×1080 desktop, 1366×768 laptop, 820 tablet, 390 phone):
 * no horizontal page overflow, the navigation is reachable, and a screenshot is written to e2e/screenshots/<project>/.
 */
const SCREENS: Array<{ name: string; path: string; ready: (page: Page) => ReturnType<Page["locator"]> }> = [
  { name: "home", path: "/", ready: (p) => p.locator(".hero") },
  { name: "movies", path: "/movies", ready: (p) => p.locator(".grid .card").first() },
  { name: "tv-shows", path: "/tv", ready: (p) => p.locator(".grid .card").first() },
  { name: "search", path: "/search", ready: (p) => p.getByPlaceholder("Search movies and TV shows") },
  { name: "detail-movie", path: "/detail/test.mangotv.fixture/MOVIE/fxm1", ready: (p) => p.getByText("IMDb Rating") },
  { name: "detail-series", path: "/detail/test.mangotv.fixture/TV_SHOW/fxs1", ready: (p) => p.getByRole("heading", { name: "Seasons" }) },
  { name: "sources", path: "/sources/test.mangotv.fixture/MOVIE/fxm1/-1/-1", ready: (p) => p.locator(".source").first() },
  { name: "settings-addons", path: "/settings/addons", ready: (p) => p.locator(".addon").first() },
  { name: "settings-home-rows", path: "/settings/home-rows", ready: (p) => p.locator(".homerow").first() },
  { name: "settings-subtitles", path: "/settings/subtitles", ready: (p) => p.getByRole("switch", { name: "Subtitles" }) },
];

test.describe("responsive layouts", () => {
  test("every screen fits the viewport (no sideways scrolling) and stays usable", async ({ page }, info) => {
    const account = await newAccount("resp");
    await account.tv.seedContinueWatching({ contentId: "fxm4", title: "Continue Me" });
    await openSignedIn(page, account);
    for (const screen of SCREENS) {
      await page.goto(screen.path);
      await expect(screen.ready(page), screen.name).toBeVisible({ timeout: 20_000 });
      await page.waitForTimeout(400); // fonts + lazy images settle
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${screen.name}: horizontal overflow of ${overflow}px`).toBeLessThanOrEqual(1);
      // the Sources screen is full-screen on the TV (own back arrow, no top navigation) and stays that way here
      if (screen.name === "sources") await expect(page.getByRole("navigation", { name: "Primary" })).toHaveCount(0);
      else await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
      await shot(page, screen.name);
    }
  });

  test("welcome and sign-in screens fit too", async ({ page }, info) => {
    for (const [name, path] of [["welcome", "/auth"], ["auth-method", "/auth/method/login"], ["auth-password", "/auth/password/login"]] as const) {
      await page.goto(path);
      await expect(page.getByRole("button").first()).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${name}: horizontal overflow`).toBeLessThanOrEqual(1);
      await shot(page, name);
    }
  });

  test("touch: long-press opens the quick-actions menu and taps navigate", async ({ page, browserName }, info) => {
    test.skip(!info.project.name.startsWith("mobile") && !info.project.name.startsWith("tablet"), "touch devices only");
    void browserName;
    const account = await newAccount("touch");
    await openSignedIn(page, account, "/movies");
    const card = page.locator(".grid .card__surface").first();
    await expect(card).toBeVisible();
    const box = (await card.boundingBox())!;
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page).toHaveURL(/\/detail\//);
  });

  test("touch: every poster has a menu button in its corner that opens the quick-actions menu (hidden with a mouse)", async ({ page }, info) => {
    const account = await newAccount("morebtn");
    await openSignedIn(page, account, "/movies");
    const card = page.locator(".grid .card").first();
    await expect(card.locator(".card__surface")).toBeVisible();
    const more = card.getByRole("button", { name: /^More options for / });
    if (!info.project.name.startsWith("mobile") && !info.project.name.startsWith("tablet")) {
      await expect(more).toBeHidden(); // mouse users right-click
      return;
    }
    await expect(more).toBeVisible();
    const box = (await more.boundingBox())!;
    expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44); // a proper tap target
    const poster = (await card.locator(".card__surface").boundingBox())!;
    expect(box.x + box.width).toBeGreaterThan(poster.x + poster.width - 4); // top right of the poster
    expect(box.y).toBeLessThan(poster.y + 4);
    await more.tap();
    const dialog = page.getByRole("dialog", { name: /Actions for/ });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: /Add to My List|Remove from My List/ })).toBeVisible();
    await expect(page).toHaveURL(/\/movies$/); // it did not open the title
  });
});
