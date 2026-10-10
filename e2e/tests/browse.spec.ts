import { expect, test, type Page } from "@playwright/test";
import { ADDON, cards, newAccount, openSignedIn, shot } from "./helpers";

test.describe("browsing", () => {
  test("Home: rotating hero, Continue Watching first, addon rows, watched tick, empty/error states", async ({ page }) => {
    const account = await newAccount("home");
    await account.tv.seedContinueWatching({ contentId: "fxm901", title: "Continue Me", positionMs: 1_800_000, durationMs: 6_000_000 });
    await account.tv.seedWatched({ contentId: "fxm7", title: "Seen It" });
    await openSignedIn(page, account);

    await expect(page.locator(".hero")).toBeVisible();
    await expect(page.locator(".hero__content").getByRole("button", { name: "Play" })).toBeVisible();
    await expect(page.getByRole("button", { name: "More Info" })).toBeVisible();
    // (Continue Watching only lists titles no other row shows, so its fixture title "fxm901" is outside the addon catalogue)
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
    await expect(page).toHaveURL(/\/detail\/test\.arctv\.fixture\/MOVIE\//);
    const title = label.replace(/\s*\(\d{4}\).*$/, "");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(title.split(" ")[0]!);
    await expect(page.getByRole("button", { name: "Play" })).toBeVisible();
    await expect(page.getByText("IMDb Rating")).toBeVisible();
    await expect(page.locator(".cast__member").first()).toBeVisible();
    await shot(page, "detail-movie");

    await page.goto("/detail/test.arctv.fixture/TV_SHOW/fxs1");
    await expect(page.getByRole("heading", { name: "Seasons" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Play episode 1: Chapter 1/ })).toBeVisible();
    await page.getByRole("button", { name: "Season 2" }).click();
    await expect(page.getByText("Season 2", { exact: true })).toBeVisible();
    await expect(page.getByText("5 Episodes")).toBeVisible();
    await expect(page.getByRole("button", { name: /Play S1E1/ }).or(page.getByRole("button", { name: /Play/ }).first())).toBeVisible();
    await shot(page, "detail-series");
  });

  test("Movies: 8-column grid at 1920, infinite scroll loads further pages, sort pills reorder", async ({ page, request }) => {
    const account = await newAccount("movies");
    await openSignedIn(page, account, "/movies");
    await expect(cards(page).first()).toBeVisible();
    const initial = await cards(page).count();
    expect(initial).toBe(100); // one addon page
    if (test.info().project.name === "desktop-1920") {
      const cols = await page.locator(".grid").evaluate((g) => getComputedStyle(g).gridTemplateColumns.split(" ").length);
      expect(cols).toBe(8);
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

  test("posters fit 8 across at 1920 and 7 on a laptop (fewer on narrow windows), on every tab", async ({ page }) => {
    const project = test.info().project.name;
    const expected = project.startsWith("desktop") ? 8 : project.startsWith("laptop") ? 7 : project.startsWith("tablet") ? 5 : 3;
    const account = await newAccount("posters");
    await openSignedIn(page, account);
    const fitsAcross = (locator: ReturnType<Page["locator"]>) => locator.evaluateAll((els: Element[]) => els.filter((el: Element) => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= window.innerWidth + 1; }).length);

    // Home: the first poster row
    await expect(page.locator(".home__rows .card:not([data-cw])").first()).toBeVisible();
    const homeRow = page.locator(".home__rows .row").filter({ has: page.locator(".card:not([data-cw])") }).first();
    expect(await fitsAcross(homeRow.locator(".card:not([data-cw]) .card__surface"))).toBeGreaterThanOrEqual(expected);

    // Movies, TV Shows: grids with that many columns, every card inside the window
    for (const path of ["/movies", "/tv"]) {
      await page.goto(path);
      await expect(page.locator(".grid .card").first()).toBeVisible();
      expect(await page.locator(".grid").evaluate((g) => getComputedStyle(g).gridTemplateColumns.split(" ").length), path).toBe(expected);
      const firstRowWidth = await page.locator(".grid .card__surface").evaluateAll((els) => { const top = els[0]!.getBoundingClientRect().top; return els.filter((el) => Math.abs(el.getBoundingClientRect().top - top) < 2 && el.getBoundingClientRect().right <= window.innerWidth + 1).length; });
      expect(firstRowWidth, path).toBe(expected);
    }

    // Search: the Movies / TV Shows grids
    await page.goto("/search?q=a");
    await expect(page.locator(".card:not([data-cw])").first()).toBeVisible({ timeout: 20_000 });
    expect(await fitsAcross(page.locator(".grid").first().locator(".card:not([data-cw]) .card__surface"))).toBeGreaterThanOrEqual(expected);
    await shot(page, "posters-small");
  });

  test("hero dots: each one is a button that jumps to that title, with a slide animation in the right direction; the dots are bigger", async ({ page }) => {
    const account = await newAccount("dots");
    await openSignedIn(page, account);
    await expect(page.locator(".hero__content h1").first()).toBeVisible();
    const dots = page.locator(".hero__dot");
    const count = await dots.count();
    expect(count).toBeGreaterThan(3);
    await expect(dots.first()).toHaveAttribute("aria-current", "true");
    expect(await dots.first().evaluate((el) => parseFloat(getComputedStyle(el, "::before").width))).toBeGreaterThanOrEqual(12); // was 6px; 10px idle, 13px for the current one
    expect(await dots.nth(1).evaluate((el) => parseFloat(getComputedStyle(el, "::before").width))).toBeGreaterThanOrEqual(10);
    const first = (await page.locator(".hero__content h1").first().textContent())!;

    await dots.nth(3).click(); // forward: the new title slides in from the right, the old one out to the left
    await expect(page.locator(".hero__slide")).toHaveCount(2);
    await expect(page.locator('.hero__slide[data-anim="in-next"]')).toHaveCount(1);
    await expect(page.locator('.hero__slide[data-anim="out-next"]')).toHaveCount(1);
    // it really is moving (a horizontal slide, not a fade): the incoming slide is offset sideways while it animates
    expect(await page.locator('.hero__slide[data-anim="in-next"]').evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).m41)).toBeGreaterThan(0);
    expect(await page.locator('.hero__slide[data-anim="out-next"]').evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).m41)).toBeLessThan(0.5);
    await expect(page.locator(".hero__slide")).toHaveCount(1, { timeout: 5_000 }); // the old one is gone once it has left
    await expect(dots.nth(3)).toHaveAttribute("aria-current", "true");
    const fourth = (await page.locator(".hero__content h1").first().textContent())!;
    expect(fourth).not.toBe(first);

    await dots.nth(1).click(); // back to an earlier one: it slides in from the left
    await expect(page.locator('.hero__slide[data-anim="in-prev"]')).toHaveCount(1);
    await expect(page.locator(".hero__slide")).toHaveCount(1, { timeout: 5_000 });
    await expect(dots.nth(1)).toHaveAttribute("aria-current", "true");
    await expect(page.locator(".hero__content").getByRole("button", { name: "Play" })).toBeVisible();
  });

  test("top nav: centred on desktop-width windows, and a hovered item's white ring is not clipped", async ({ page }) => {
    const account = await newAccount("nav");
    await openSignedIn(page, account);
    const nav = page.getByRole("navigation", { name: "Primary" });
    await expect(nav).toBeVisible();
    const width = page.viewportSize()!.width;
    if (width >= 1101) {
      const box = (await nav.boundingBox())!;
      expect(Math.abs(box.x + box.width / 2 - width / 2), "nav items are centred in the window").toBeLessThanOrEqual(2);
      const logo = (await page.locator(".topnav__logo").boundingBox())!;
      expect(logo.x + logo.width, "the ARC TV logo stays at the left").toBeLessThan(box.x);
    }
    for (const name of ["Home", "Settings"]) {
      const item = nav.getByRole("link", { name });
      await item.hover();
      await page.waitForTimeout(350); // the hover scale-up transition
      const ring = (await item.boundingBox())!; // bounding boxes include the scale transform
      const clip = (await nav.boundingBox())!; // the scrolling box that clips anything outside it
      expect(ring.y, `${name}: top of the ring`).toBeGreaterThanOrEqual(clip.y);
      expect(ring.y + ring.height, `${name}: bottom of the ring`).toBeLessThanOrEqual(clip.y + clip.height);
      expect(ring.x, `${name}: left of the ring`).toBeGreaterThanOrEqual(clip.x);
      expect(ring.x + ring.width, `${name}: right of the ring`).toBeLessThanOrEqual(clip.x + clip.width);
    }
    await nav.getByRole("link", { name: "Movies" }).hover();
    await page.waitForTimeout(350);
    await shot(page, "nav-hover");
  });

  test("The old Genres address sends people to Movies", async ({ page }) => {
    const account = await newAccount("genres");
    await openSignedIn(page, account, "/genres");
    await expect(page).toHaveURL(/\/movies$/);
    await page.goto("/genres/Horror");
    await expect(page).toHaveURL(/\/movies$/);
  });

  test("Search: results split into Movies and TV Shows; no-results state; query kept in the URL", async ({ page }) => {
    const account = await newAccount("search");
    await openSignedIn(page, account, "/search");
    await expect(page.getByText("Search for movies and TV shows across your installed addons.")).toBeVisible();
    await page.getByPlaceholder("Search movies and TV shows").fill("Crimson");
    await page.getByPlaceholder("Search movies and TV shows").press("Enter");
    await expect(page.getByRole("heading", { name: "Movies" })).toBeVisible();
    await expect(page).toHaveURL(/q=Crimson/);
    const titles = await page.locator(".grid .card__title").allTextContents();
    expect(titles.length).toBeGreaterThan(0);
    expect(titles.every((t) => /crimson/i.test(t))).toBe(true);
    await shot(page, "search");
    await page.getByPlaceholder("Search movies and TV shows").fill("zzzzqqqq");
    await expect(page.getByRole("heading", { name: "No results" })).toBeVisible(); // search-as-you-type: no Enter needed
    await expect(page.getByText('Nothing found for "zzzzqqqq".')).toBeVisible();
  });

  test("My List: add from Detail, appears newest-first, Watched filter, syncs to the account (and the TV)", async ({ page }) => {
    const account = await newAccount("mylist");
    await openSignedIn(page, account, "/detail/test.arctv.fixture/MOVIE/fxm2");
    await expect(page.getByRole("button", { name: "More options" })).toBeVisible();
    await page.getByRole("button", { name: "More options" }).click();
    await page.getByRole("button", { name: "Add to Watchlist" }).click();
    await page.goto("/detail/test.arctv.fixture/MOVIE/fxm5");
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
    await account.tv.seedContinueWatching({ contentId: "fxm902", title: "Menu Movie" });
    await openSignedIn(page, account);
    const cw = page.locator('.card[data-cw="true"] .card__surface').first();
    await cw.click({ button: "right" });
    const dialog = page.getByRole("dialog", { name: /Actions for/ });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: /Resume from 25m/ })).toBeVisible();
    await dialog.getByRole("button", { name: "Mark as watched" }).click();
    await expect(dialog).toBeVisible(); // the menu stays open, and the button shows it was pressed
    await expect(dialog.getByRole("button", { name: "Mark as unwatched" })).toHaveAttribute("data-on", "true");
    await expect(dialog.getByRole("button", { name: "Mark as unwatched" })).toContainText("Watched");
    await page.keyboard.press("Escape");
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
    const columns = await page.locator(".grid").evaluate((g) => getComputedStyle(g).gridTemplateColumns.split(" ").length);
    await expect(cards(page).nth(1 + columns)).toBeFocused(); // same column, one row down
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/detail\//);
  });

  test("Home: a title appears in only one catalogue row (the first one that holds it)", async ({ page }) => {
    const account = await newAccount("nodupes");
    await openSignedIn(page, account);
    await expect(page.locator(".home__rows .card:not([data-cw])").first()).toBeVisible({ timeout: 20_000 });
    await expect(page.locator(".home__rows .row").nth(2)).toBeVisible(); // the fixture addon offers a Popular row and several genre rows
    const rows = await page.locator(".home__rows .row").evaluateAll((all) =>
      all.filter((row) => row.querySelector(".card:not([data-cw])")).map((row) => Array.from(row.querySelectorAll(".card:not([data-cw]) .card__surface")).map((a) => a.getAttribute("href") ?? "")),
    );
    const flat = rows.flat();
    expect(flat.length).toBeGreaterThan(10);
    expect(new Set(flat).size).toBe(flat.length);
  });

  test("Home's top bar is a slim shade, and hovering the logo shows no white outline", async ({ page }) => {
    const account = await newAccount("topbar");
    await openSignedIn(page, account);
    await expect(page.locator(".hero__content h1").first()).toBeVisible();
    expect(await page.locator(".topnav").evaluate((el) => el.getBoundingClientRect().height)).toBeLessThan(80); // at 1920 wide; it was about 100 with the thick band
    await page.locator(".topnav__logo").hover();
    await page.waitForTimeout(350);
    const hovered = await page.locator(".topnav__logo").evaluate((el) => ({ ring: getComputedStyle(el, "::after").opacity, transform: getComputedStyle(el).transform, shadow: getComputedStyle(el).boxShadow }));
    expect(hovered).toEqual({ ring: "0", transform: "matrix(1, 0, 0, 1, 0, 0)", shadow: "none" });
    // a nav item still shows its ring on hover (only the logo lost it)
    await page.locator(".navitem", { hasText: "Movies" }).hover();
    await page.waitForTimeout(350);
    expect(await page.locator(".navitem", { hasText: "Movies" }).evaluate((el) => getComputedStyle(el, "::after").opacity)).toBe("1");
  });

  test("the right-click menu fits its box on a big screen (no sideways scrollbar), however its rows are hovered", async ({ page }) => {
    await page.setViewportSize({ width: 2560, height: 1300 });
    const account = await newAccount("menufit");
    await account.tv.seedContinueWatching({ contentId: "fxm901", title: "Menu Fit" });
    await openSignedIn(page, account);
    await page.locator('.card[data-cw="true"] .card__surface').first().click({ button: "right" });
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    for (const name of [/Resume from/, "Mark as watched", "View details", "Remove from Continue Watching", "Choose source"]) {
      await dialog.getByRole("button", { name }).hover();
      await page.waitForTimeout(250);
      const fit = await dialog.evaluate((el) => ({ wide: el.scrollWidth - el.clientWidth, high: el.scrollHeight - el.clientHeight }));
      expect(fit.wide, `${name}`).toBeLessThanOrEqual(0);
      expect(fit.high, `${name}`).toBeLessThanOrEqual(0);
    }
    // the long label stays on one line
    expect(await dialog.getByRole("button", { name: "Remove from Continue Watching" }).evaluate((el) => el.getBoundingClientRect().height)).toBeLessThan(120);
  });

  test("Movies and TV Shows have a genre drop-down with Cinemeta's genres (no years); choosing one filters the grid and survives Back", async ({ page }) => {
    const account = await newAccount("genrepick");
    await openSignedIn(page, account, "/movies");
    const grid = page.locator(".grid .card__surface");
    await expect(grid.first()).toBeVisible({ timeout: 20_000 });
    const all = await grid.count();
    const trigger = page.getByRole("button", { name: /All genres/ });
    await expect(trigger).toBeVisible();
    await trigger.click();
    const list = page.getByRole("listbox", { name: "Genre" });
    await expect(list).toBeVisible();
    const names = await list.getByRole("option").allTextContents();
    expect(names[0]).toBe("All genres");
    expect(names.slice(1)).toEqual(["Action", "Adventure", "Animation", "Biography", "Comedy", "Crime", "Documentary", "Drama", "Family", "Fantasy", "History", "Horror", "Mystery", "Romance", "Sci-Fi", "Sport", "Thriller", "War", "Western"]);
    await expect(list.getByRole("option", { name: "All genres" })).toHaveAttribute("aria-selected", "true");
    await shot(page, "genre-dropdown");

    await list.getByRole("option", { name: "Action" }).click();
    await expect(list).toBeHidden();
    await expect(page).toHaveURL(/\/movies\?genre=Action$/);
    await expect(page.getByRole("button", { name: "Action" })).toBeVisible();
    await expect.poll(() => grid.count(), { timeout: 20_000 }).toBeLessThan(all);
    expect(await grid.count()).toBeGreaterThan(0);

    // into a title and Back: still filtered
    await grid.first().click();
    await expect(page).toHaveURL(/\/detail\//);
    await page.getByRole("button", { name: "Back" }).click();
    await expect(page).toHaveURL(/\/movies\?genre=Action$/);
    await expect(page.getByRole("button", { name: "Action" })).toBeVisible();

    // a genre this catalogue has nothing for, then back to everything
    await page.getByRole("button", { name: "Action" }).click();
    await page.getByRole("listbox", { name: "Genre" }).getByRole("option", { name: "Sport" }).click();
    await expect(page.getByText("No Sport movies found right now.")).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "Sport" }).click();
    await page.getByRole("listbox", { name: "Genre" }).getByRole("option", { name: "All genres" }).click();
    await expect(page).toHaveURL(/\/movies$/);
    await expect.poll(() => grid.count(), { timeout: 20_000 }).toBe(all);

    // Escape closes it without changing anything
    await page.getByRole("button", { name: /All genres/ }).click();
    await expect(page.getByRole("listbox", { name: "Genre" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("listbox", { name: "Genre" })).toBeHidden();
    await expect(page).toHaveURL(/\/movies$/);

    // TV Shows has the three extra genres
    await page.goto("/tv");
    await page.getByRole("button", { name: /All genres/ }).click();
    await expect(page.getByRole("listbox", { name: "Genre" }).getByRole("option", { name: "Reality-TV" })).toBeVisible();
    expect(await page.getByRole("listbox", { name: "Genre" }).getByRole("option").count()).toBe(23);
  });

  test("the Trailer button is on the Detail page from the first paint — dimmed while it looks the trailer up, live once found", async ({ page, context }) => {
    const account = await newAccount("trailer");
    let release: () => void = () => undefined;
    const lookup = new Promise<void>((resolve) => (release = resolve));
    await page.route("**/api/user/trailer**", async (route) => {
      await lookup; // hold the answer back to look at the page in between
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ youtubeVideoId: "abc123" }) });
    });
    await openSignedIn(page, account, "/detail/test.arctv.fixture/MOVIE/fxm1");
    const trailer = page.getByRole("button", { name: "Trailer" });
    await expect(page.getByRole("button", { name: /Play/ }).first()).toBeVisible({ timeout: 20_000 });
    await expect(trailer).toBeVisible(); // there with the Play button, not a second later
    await expect(trailer).toBeDisabled(); // nothing to open yet
    release();
    await expect(trailer).toBeEnabled({ timeout: 10_000 });
    await context.route("https://www.youtube.com/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<title>trailer</title>" })); // the sandbox has no internet
    const [popup] = await Promise.all([context.waitForEvent("page"), trailer.click()]);
    expect(popup.url()).toContain("youtube.com/watch?v=abc123");
    await popup.close();
  });

  test("with no trailer on file the button stays, dimmed, and says so; visitors without an account are taken to sign in", async ({ page }) => {
    const account = await newAccount("notrailer");
    await page.route("**/api/user/trailer**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ youtubeVideoId: null }) }));
    await openSignedIn(page, account, "/detail/test.arctv.fixture/MOVIE/fxm1");
    const trailer = page.getByRole("button", { name: "Trailer" });
    await expect(trailer).toBeVisible({ timeout: 20_000 });
    await expect(trailer).toBeDisabled();
    await expect(trailer).toHaveAttribute("title", "No trailer found for this title");

    const guest = await page.context().browser()!.newContext({ baseURL: process.env.WEB_URL ?? "http://127.0.0.1:8090" });
    const visitor = await guest.newPage();
    await visitor.route("https://v3-cinemeta.strem.io/**", async (route) => {
      try {
        const answer = await route.fetch({ url: `${process.env.ADDON_URL ?? "http://127.0.0.1:7000"}${new URL(route.request().url()).pathname}` });
        await route.fulfill({ status: answer.status(), contentType: "application/json", body: await answer.body(), headers: { "access-control-allow-origin": "*" } });
      } catch {
        /* the page moved on while this was in flight */
      }
    });
    await visitor.goto("/detail/com.linvo.cinemeta/MOVIE/fxm1"); // visitors browse with Cinemeta (answered here by the fixture addon)
    await expect(visitor.getByRole("button", { name: "Trailer" })).toBeEnabled({ timeout: 20_000 });
    await visitor.getByRole("button", { name: "Trailer" }).click();
    await expect(visitor).toHaveURL(/\/auth$/);
    await guest.close();
  });
});
