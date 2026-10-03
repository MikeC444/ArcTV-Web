import { expect, test } from "@playwright/test";
import { newAccount, openSignedIn } from "./helpers";

/**
 * Layout parity with the Firestick's Compose spec. The Fire TV reference is 960 × 540 dp at 2x = 1920 × 1080 px, so at
 * that viewport 1dp must equal 2 CSS px. Every expected number below is a Compose token (ui/theme/{Dimens,Type,Color}.kt)
 * multiplied by 2 — not a value read back from the implementation.
 */
test.describe("Fire TV layout parity @ 1920×1080 (1dp = 2px)", () => {
  test.skip(({ viewport }) => viewport?.width !== 1920, "reference viewport only");
  const DP = 1920 / 1745; // 1dp = 1px up to a 1745-wide window, then 1/1745 of the width (the TV uses 2px at 1920)
  const near = (actual: number, expected: number, tolerance = 1.5) => expect(Math.abs(actual - expected), `${actual} ≈ ${expected}`).toBeLessThanOrEqual(tolerance);

  test("design tokens: colours, radii, type scale", async ({ page }) => {
    const account = await newAccount("parity-tokens");
    await openSignedIn(page, account);
    await expect(page.locator(".hero")).toBeVisible();
    const t = await page.evaluate(() => {
      const css = getComputedStyle(document.documentElement);
      const px = (name: string) => parseFloat(getComputedStyle(document.body).getPropertyValue(name));
      void px;
      return {
        dp: parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--dp")) || 0,
        bg: getComputedStyle(document.documentElement).backgroundColor,
        tokens: Object.fromEntries(["--bg", "--bg-elevated", "--surface", "--surface-high", "--cyan", "--blue", "--violet", "--warn", "--coral", "--azure", "--teal", "--text", "--text-2", "--text-3", "--focus-border", "--watched"].map((k) => [k, css.getPropertyValue(k).trim().toLowerCase()])),
      };
    });
    expect(t.bg).toBe("rgb(8, 8, 10)"); // MangoBackground 0xFF08080A
    expect(t.tokens).toEqual({
      "--bg": "#08080a", "--bg-elevated": "#141417", "--surface": "#1c1c20", "--surface-high": "#26262b", "--cyan": "#19e6ff", "--blue": "#2f80ff", "--violet": "#9b5cff", "--warn": "#ffb020", "--coral": "#ff3d68",
      "--azure": "#3d8bff", "--teal": "#2dd9a8", "--text": "#f6f6f8", "--text-2": "#afafb8", "--text-3": "#92929c" /* the TV's #75757e is 4.4:1 — lightened to pass WCAG AA */, "--focus-border": "#8cf3ff", "--watched": "#2ecc71",
    });
    const dpPx = await page.evaluate(() => { const d = document.createElement("div"); d.style.width = "var(--dp)"; document.body.appendChild(d); const w = d.getBoundingClientRect().width; d.remove(); return w; });
    near(dpPx, DP, 0.01);
  });

  test("top navigation bar and logo (TopNavBar.kt, MangoLogo.kt)", async ({ page }) => {
    const account = await newAccount("parity-nav");
    await openSignedIn(page, account);
    const logo = page.locator(".topnav .logo");
    await expect(logo).toBeVisible();
    near(await logo.evaluate((el) => parseFloat(getComputedStyle(el).fontSize)), 32 * DP); // MangoLogo: 24.sp on the TV, larger on a desktop window
    expect(await logo.evaluate((el) => getComputedStyle(el).fontWeight)).toBe("900"); // FontWeight.Black
    near(await page.locator(".topnav").evaluate((el) => parseFloat(getComputedStyle(el).paddingLeft)), 56 * DP); // ScreenPaddingHorizontal
    const items = await page.locator(".navitem").allTextContents();
    expect(items).toEqual(["Home", "Movies", "TV Shows", "Search", "My List", "Settings"]);
    near(await page.locator(".navitem").first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize)), 17 * DP); // labelMedium 13.sp on the TV, larger on a desktop window
    near(await page.locator(".navitem").first().evaluate((el) => parseFloat(getComputedStyle(el).borderTopLeftRadius)), 8 * DP);
  });

  test("Home: hero height, hero buttons, poster rows of 8 (HeroSection.kt, ContentRow.kt, ContentCard.kt)", async ({ page }) => {
    const account = await newAccount("parity-home");
    await account.tv.seedContinueWatching({ contentId: "fxm901", title: "CW" });
    await openSignedIn(page, account);
    await expect(page.locator(".hero")).toBeVisible();
    near(await page.locator(".hero").evaluate((el) => el.getBoundingClientRect().height), 0.74 * 1080, 2); // the TV uses screenHeight × 0.82; shorter here so Continue Watching shows above the fold
    const play = page.locator(".hero__actions .mbtn").first();
    near(await play.evaluate((el) => el.getBoundingClientRect().height), 52 * 1.2 * DP); // MangoButton height × the desktop hero button scale
    near(await page.locator(".hero__actions .ibtn").first().evaluate((el) => el.getBoundingClientRect().width), 52 * 1.2 * DP);
    // the logo / title, details and buttons sit in the vertical middle of the hero photo, left-aligned
    const contentBox = (await page.locator(".hero__content").boundingBox())!;
    const heroBox = (await page.locator(".hero").boundingBox())!;
    near(contentBox.y + contentBox.height / 2, heroBox.y + heroBox.height / 2, 2);
    near((await page.locator(".hero__actions").boundingBox())!.x, 56 * DP, 2); // left-aligned with the page margin, like the rows

    // deliberately NOT the TV's 168dp × 0.75 posters: the web shows 8 across at 1920 (--poster-cols), with 10dp gaps
    const poster = page.locator(".home__rows .card:not([data-cw]) .card__surface").first();
    const box = (await poster.boundingBox())!;
    const slot = (1920 - 2 * 56 * DP - 7 * 10 * DP) / 8;
    near(box.width, slot, 1.5);
    near(box.height / box.width, 1.5, 0.01); // 2 : 3 poster
    near(await poster.evaluate((el) => parseFloat(getComputedStyle(el).borderTopLeftRadius)), 10 * DP); // CardCornerRadius
    const cw = (await page.locator('.home__rows .card[data-cw="true"] .card__surface').first().boundingBox())!;
    near(cw.width, 1.65 * slot + 0.65 * 10 * DP, 1.5); // Continue Watching: 1.65 poster columns wide
    near(cw.width / cw.height, 16 / 9, 0.02);
    expect(cw.y + cw.height, "Continue Watching is fully above the fold at 1920 × 1080").toBeLessThanOrEqual(1080);
    const firstRow = page.locator(".home__rows .row").filter({ has: page.locator(".card:not([data-cw])") }).first();
    const fullyInView = await firstRow.locator(".card:not([data-cw]) .card__surface").evaluateAll((els) => els.filter((el) => el.getBoundingClientRect().right <= window.innerWidth).length);
    expect(fullyInView).toBeGreaterThanOrEqual(8);
    const title = page.locator(".home__rows .row__title").first();
    near(await title.evaluate((el) => parseFloat(getComputedStyle(el).fontSize)), 20 * DP); // headlineSmall 20.sp
    expect(await title.evaluate((el) => getComputedStyle(el).fontWeight)).toBe("700");
    const second = (await page.locator(".home__rows .card:not([data-cw]) .card__surface").nth(1).boundingBox())!;
    near(second.x - (box.x + box.width), 10 * DP); // --poster-gap
    // rows start 56dp from the left screen edge
    near(box.x, 56 * DP, 2);
  });

  test("Movies grid: 8 columns with 10dp gaps (RowsBrowseScreen.kt)", async ({ page }) => {
    const account = await newAccount("parity-grid");
    await openSignedIn(page, account, "/movies");
    await expect(page.locator(".grid .card").first()).toBeVisible();
    const cols = await page.locator(".grid").evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").length);
    expect(cols).toBe(8); // --poster-cols (the TV shows 7; the web fits more)
    const a = (await page.locator(".grid .card__surface").nth(0).boundingBox())!;
    const b = (await page.locator(".grid .card__surface").nth(1).boundingBox())!;
    near(b.x - (a.x + a.width), 10 * DP); // --poster-gap
    near(a.width, (1920 - 2 * 56 * DP - 7 * 10 * DP) / 8, 1.5);
    near(a.height / a.width, 1.5, 0.01); // 2 : 3 poster
    near(await page.locator(".page__title").evaluate((el) => parseFloat(getComputedStyle(el).fontSize)), 40 * DP); // displayMedium
  });

  test("Detail hero matches the Home hero: same layout (centred block), same type and button sizes", async ({ page }) => {
    const account = await newAccount("parity-detail");
    await openSignedIn(page, account);
    await expect(page.locator(".hero__content h1")).toBeVisible();
    const size = (selector: string) => page.locator(selector).first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    const home = {
      title: await size(".hero__content h1"),
      meta: await size(".hero__meta"),
      genres: await size(".hero__genres"),
      desc: await size(".hero__desc"),
      button: await page.locator(".hero__actions .mbtn").first().evaluate((el) => el.getBoundingClientRect().height),
      round: await page.locator(".hero__actions .ibtn").first().evaluate((el) => el.getBoundingClientRect().height),
      height: await page.locator(".hero").evaluate((el) => el.getBoundingClientRect().height),
    };
    for (const path of ["/detail/test.mangotv.fixture/MOVIE/fxm1", "/detail/test.mangotv.fixture/TV_SHOW/fxs1"]) {
      await page.goto(path);
      await expect(page.locator(".detail__col h1")).toBeVisible();
      near(await size(".detail__col h1"), home.title, 0.6);
      near(await size(".detail__meta"), home.meta, 0.6);
      near(await size(".detail__genres"), home.genres, 0.6);
      near(await size(".detail__desc"), home.desc, 0.6);
      near(await page.locator(".detail__actions .mbtn").first().evaluate((el) => el.getBoundingClientRect().height), home.button, 0.6);
      near(await page.locator(".detail__actions .ibtn").first().evaluate((el) => el.getBoundingClientRect().height), home.round, 0.6);
      near(await page.locator(".detail__hero").evaluate((el) => el.getBoundingClientRect().height), home.height, 1);
      const col = (await page.locator(".detail__col").boundingBox())!;
      const hero = (await page.locator(".detail__hero").boundingBox())!;
      near(col.y + col.height / 2, hero.y + hero.height / 2, 2); // a block centred on the photo, like the Home hero
    }
  });

  test("Sources: 35 / 65 split, 76dp-ish rows; Settings: side navigation + wider pane (SourcesScreen.kt; the web settings use a sticky side nav)", async ({ page }) => {
    const account = await newAccount("parity-panes");
    await openSignedIn(page, account, "/sources/test.mangotv.fixture/MOVIE/fxm1/-1/-1");
    await expect(page.locator(".source").first()).toBeVisible();
    const info = (await page.locator(".sources__info").boundingBox())!;
    near(info.width / 1920, 0.35, 0.005);
    const poster = (await page.locator(".sources__poster").boundingBox())!;
    near(poster.width, 200 * DP); // much larger than the TV's 84dp so the poster is easy to see
    near(poster.height, 300 * DP);

    await page.goto("/settings");
    await expect(page.locator(".settings__cat").first()).toBeVisible();
    const side = (await page.locator(".settings__side").boundingBox())!;
    const pane = (await page.locator(".settings__pane").boundingBox())!;
    near(side.width, 280 * DP, 2);
    expect(pane.width).toBeGreaterThan(side.width * 2);
  });

  test("Player: control sizes and 360dp menu panel (PlayerScreen.kt, MenuOverlayScaffold.kt)", async ({ page }) => {
    const account = await newAccount("parity-player");
    await openSignedIn(page, account, "/sources/test.mangotv.fixture/MOVIE/fxm1/-1/-1");
    await page.locator(".source", { hasText: "Fixture HLS" }).locator(".source__surface").click();
    await expect(page.locator("video.player__video")).toBeVisible();
    await page.mouse.move(300, 300);
    const playPause = (await page.locator(".pbottom .ibtn").first().boundingBox())!;
    near(playPause.width, 52 * DP);
    const rewind = (await page.locator(".pbottom .ibtn").nth(1).boundingBox())!;
    near(rewind.width, 44 * DP); // compact icon button
    near(await page.locator(".pbottom").evaluate((el) => parseFloat(getComputedStyle(el).paddingLeft)), 40 * DP);
    await expect.poll(async () => page.getByRole("button", { name: "Quality" }).count(), { timeout: 20_000 }).toBe(1);
    await page.getByRole("button", { name: "Quality" }).click();
    near((await page.locator(".pmenu__panel").boundingBox())!.width, 360 * DP, 2);
  });
});
