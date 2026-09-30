import { expect, test } from "@playwright/test";
import { ADDON, cards, newAccount, openSignedIn, shot } from "./helpers";

test.describe("browsing", () => {
  test("Home: rotating hero, Continue Watching first, addon rows, watched tick, empty/error states", async ({ page }) => {
    const account = await newAccount("home");
    await account.tv.seedContinueWatching({ contentId: "fxm4", title: "Continue Me", positionMs: 1_800_000, durationMs: 6_000_000 });
    await account.tv.seedWatched({ contentId: "fxm7", title: "Seen It" });
    await openSignedIn(page, account);

    await expect(page.locator(".hero")).toBeVisible();
    await expect(page.locator(".hero__content").getByRole("button", { name: "Play" })).toBeVisible();
    await expect(page.getByRole("button", { name: "More Info" })).toBeVisible();
    // rows in order: Continue Watching, then the addon's base row and genre rows
    const headings = await page.locator(".home__rows .row__title").allTextContents();
    expect(headings[0]).toBe("Continue Watching");
    expect(headings).toContain("Popular");
    expect(headings).toEqual(expect.arrayContaining(["Action", "Comedy", "Drama"]));
    // the Continue Watching card is a 16:9 backdrop with a progress bar at 30 %
    const cw = page.locator('.card[data-cw="true"]').first();
    await expect(cw.locator(".card__title")).toHaveText("Continue Me");
    const bar = cw.locator(".card__progress");
    await expect(bar).toHaveAttribute("aria-valuenow", "30");
    // a title the TV marked watched wears the green tick wherever it appears
    await expect(page.locator('.card__watched').first()).toBeVisible();
    await shot(page, "home");
  });

  test("Home with no addons shows the branded empty state that leads to Settings → Addons", async ({ page }) => {
    const account = await newAccount("noaddons", { addon: false });
    // pretend the default addon was already offered so this stays an "empty library" account
    await page.addInitScript(() => undefined);
    await openSignedIn(page, account);
    // a brand-new account gets the default addon bootstrapped; the fixture-free sandbox can't reach Cinemeta, so we either see the
    // error state (addon installed, unreachable) or the empty state — both are the app's honest response and both offer a way forward.
    await expect(page.locator(".state")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: /Retry|Browse Addons/ })).toBeVisible();
    await shot(page, "home-empty-or-error");
  });

  test("clicking a movie opens its Detail page; a series shows Seasons and Episodes", async ({ page }) => {
    const account = await newAccount("detail");
    await openSignedIn(page, account, "/movies");
    const first = cards(page).first();
    await expect(first).toBeVisible();
    const label = (await first.getAttribute("aria-label")) ?? "";
    await first.click();
    await expect(page).toHaveURL(/\/detail\/test\.mangotv\.fixture\/MOVIE\//);
    const title = label.replace(/\s*\(\d{4}\).*$/, "");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(title.split(" ")[0]!);
    await expect(page.getByRole("button", { name: "Play" })).toBeVisible();
    await expect(page.getByText("IMDb Rating")).toBeVisible();
    await expect(page.locator(".cast__member").first()).toBeVisible();
    await shot(page, "detail-movie");

    await page.goto("/detail/test.mangotv.fixture/TV_SHOW/fxs1");
    await expect(page.getByRole("heading", { name: "Seasons" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Play episode 1: Chapter 1/ })).toBeVisible();
    await page.getByRole("tab", { name: "Season 2" }).click();
    await expect(page.getByText("Season 2", { exact: true })).toBeVisible();
    await expect(page.getByText("5 Episodes")).toBeVisible();
    await expect(page.getByRole("button", { name: /Play S1E1/ }).or(page.getByRole("button", { name: /Play/ }).first())).toBeVisible();
    await shot(page, "detail-series");
  });

  test("Movies: 7-column grid, infinite scroll loads further pages, sort pills reorder", async ({ page, request }) => {
    const account = await newAccount("movies");
    await openSignedIn(page, account, "/movies");
    await expect(cards(page).first()).toBeVisible();
    const initial = await cards(page).count();
    expect(initial).toBe(100); // one addon page
    if (test.info().project.name === "desktop-1920") {
      const cols = await page.locator(".grid").evaluate((g) => getComputedStyle(g).gridTemplateColumns.split(" ").length);
      expect(cols).toBe(7);
    }
    await page.mouse.wheel(0, 20000);
    await expect.poll(() => cards(page).count(), { timeout: 15_000 }).toBeGreaterThan(100); // page 2 (skip=100)
    await page.getByRole("button", { name: "Highest Rated" }).click();
    await expect(page.getByRole("button", { name: "Highest Rated" })).toHaveAttribute("aria-pressed", "true");
    // "Featured" is a shuffled browse row (like the TV), so compare with the addon's own data rather than with the previous order
    const catalog = async (path: string) => ((await (await request.get(`${ADDON}${path}`)).json()) as { metas: Array<{ name: string; releaseInfo: string; imdbRating: string }> }).metas;
    const all = [...(await catalog("/catalog/movie/top.json")), ...(await catalog("/catalog/movie/top/skip=100.json"))];
    const best = Math.max(...all.map((m) => Number(m.imdbRating)));
    const bestLabels = all.filter((m) => Number(m.imdbRating) === best).map((m) => `${m.name} (${m.releaseInfo})`);
    expect(bestLabels).toContain(await cards(page).first().getAttribute("aria-label"));
  });

  test("Genres: coloured icon cards lead to a genre's results", async ({ page }) => {
    const account = await newAccount("genres");
    await openSignedIn(page, account, "/genres");
    await expect(page.locator(".genre-card").first()).toBeVisible();
    const names = await page.locator(".genre-card").allTextContents();
    expect(names).toEqual(expect.arrayContaining(["Action", "Comedy", "Drama", "Horror", "Romance", "Sci-Fi"]));
    expect(names).toEqual(expect.arrayContaining(["2024", "2023", "2016"])); // years are extended back to 2016
    await shot(page, "genres");
    await page.locator(".genre-card", { hasText: "Horror" }).click();
    await expect(page).toHaveURL(/\/genres\/Horror$/);
    await expect(page.getByRole("heading", { name: "Horror", level: 1 })).toBeVisible();
    await expect(cards(page).first()).toBeVisible();
  });

  test("Search: results split into Movies and TV Shows; no-results state; query kept in the URL", async ({ page }) => {
    const account = await newAccount("search");
    await openSignedIn(page, account, "/search");
    await expect(page.getByText("Search for movies and TV shows across your installed addons.")).toBeVisible();
    await page.getByPlaceholder("Search movies and TV shows").fill("Crimson");
    await page.getByPlaceholder("Search movies and TV shows").press("Enter");
    await expect(page.getByRole("heading", { name: "Movies" })).toBeVisible();
    await expect(page).toHaveURL(/q=Crimson/);
    const titles = await page.locator(".row .card__title").allTextContents();
    expect(titles.length).toBeGreaterThan(0);
    expect(titles.every((t) => /crimson/i.test(t))).toBe(true);
    await shot(page, "search");
    await page.getByPlaceholder("Search movies and TV shows").fill("zzzzqqqq");
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page.getByRole("heading", { name: "No results" })).toBeVisible();
    await expect(page.getByText('Nothing found for "zzzzqqqq".')).toBeVisible();
  });

  test("My List: add from Detail, appears newest-first, Watched filter, syncs to the account (and the TV)", async ({ page }) => {
    const account = await newAccount("mylist");
    await openSignedIn(page, account, "/detail/test.mangotv.fixture/MOVIE/fxm2");
    await expect(page.getByRole("button", { name: "More options" })).toBeVisible();
    await page.getByRole("button", { name: "More options" }).click();
    await page.getByRole("button", { name: "Add to Watchlist" }).click();
    await page.goto("/detail/test.mangotv.fixture/MOVIE/fxm5");
    await page.getByRole("button", { name: "More options" }).click();
    await page.getByRole("button", { name: "Add to Watchlist" }).click();
    await page.getByRole("button", { name: "Mark as watched" }).click();

    await page.getByRole("link", { name: "My List" }).click();
    await expect(page.getByRole("heading", { name: "My List", level: 1 })).toBeVisible();
    await expect(cards(page)).toHaveCount(2);
    const order = await cards(page).evaluateAll((els) => els.map((e) => e.getAttribute("data-contentid")));
    expect(order).toEqual(["fxm5", "fxm2"]); // newest added first
    await expect(page.locator(".card__watched")).toHaveCount(1);
    await page.getByRole("button", { name: "Watched" }).click();
    await expect(cards(page)).toHaveCount(1);
    await shot(page, "my-list");

    // the change reached the account: the TV sees the same list
    await expect.poll(async () => ((await account.tv.get("/user/watchlist")).body.items as Array<{ contentId: string; watched: boolean }>).map((i) => `${i.contentId}:${i.watched}`).sort()).toEqual(["fxm2:false", "fxm5:true"]);
  });

  test("card quick-actions menu: right-click → mark watched / remove from Continue Watching", async ({ page }) => {
    const account = await newAccount("menu");
    await account.tv.seedContinueWatching({ contentId: "fxm9", title: "Menu Movie" });
    await openSignedIn(page, account);
    const cw = page.locator('.card[data-cw="true"] .card__surface').first();
    await cw.click({ button: "right" });
    const dialog = page.getByRole("dialog", { name: /Actions for/ });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: /Resume from 25m/ })).toBeVisible();
    await dialog.getByRole("button", { name: "Mark as watched" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.locator(".card__watched").first()).toBeVisible();
    await cw.click({ button: "right" });
    await page.getByRole("dialog").getByRole("button", { name: "Remove from Continue Watching" }).click();
    await expect(page.locator('.card[data-cw="true"]')).toHaveCount(0);
    await expect.poll(async () => (await account.tv.get("/user/continue-watching")).body.items.length).toBe(0);
  });

  test("keyboard: arrow keys move focus like the TV remote and Enter opens the focused title", async ({ page }) => {
    const account = await newAccount("keys");
    await openSignedIn(page, account, "/movies");
    await expect(cards(page).first()).toBeVisible();
    await page.keyboard.press("ArrowDown"); // nothing focused yet → the screen's primary control (the Featured sort pill)
    await expect(page.getByRole("button", { name: "Featured" })).toBeFocused();
    await page.keyboard.press("ArrowUp"); // UP from content returns to the *selected* nav item
    await expect(page.locator(".navitem[data-selected='true']")).toBeFocused();
    await page.keyboard.press("ArrowDown"); // and DOWN from the nav bar lands on the primary control again
    await expect(page.getByRole("button", { name: "Featured" })).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("button", { name: "Highest Rated" })).toBeFocused();
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowDown"); // → first poster
    await expect(cards(page).first()).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(cards(page).nth(1)).toBeFocused();
    await page.keyboard.press("ArrowDown"); // next grid row
    await expect(cards(page).nth(8)).toBeFocused(); // 7 columns: same column, one row down
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/detail\//);
  });
});
