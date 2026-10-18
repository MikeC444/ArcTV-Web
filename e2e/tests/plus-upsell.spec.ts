import { expect, test, type Page } from "@playwright/test";
import { ADDON, newAccount, openSignedIn, shot } from "./helpers";

/** The same account as a free one with the paywall on, and the list prices the backend now sends. */
async function freeWithPaywall(page: Page) {
  await page.route("**/user/plus", (route) =>
    route.request().method() === "GET"
      ? route.fulfill({
          json: {
            active: false,
            plan: null,
            validUntil: null,
            cancelAtPeriodEnd: false,
            paywall: true,
            prices: { monthly: { amount: 499, currency: "gbp" }, yearly: { amount: 3999, currency: "gbp" }, lifetime: { amount: 9999, currency: "gbp" } },
          },
        })
      : route.continue(),
  );
}

test.describe("ArcTV Plus: prices and nudges for someone without Plus", () => {
  test("the plan cards show real prices, the yearly saving and what yearly works out at", async ({ page }) => {
    const account = await newAccount("prices");
    await freeWithPaywall(page);
    await openSignedIn(page, account, "/settings/plus");
    const plans = page.getByRole("group", { name: "Plans" });
    await expect(plans.locator(".plus__plan").nth(0)).toContainText("£4.99");
    const yearly = plans.locator(".plus__plan").nth(1);
    await expect(yearly).toContainText("£39.99");
    await expect(yearly).toContainText("Save 33%");
    await expect(yearly.locator("s")).toHaveText("£4.99/mo");
    await expect(yearly).toContainText("£3.33/mo billed yearly, about £0.11 a day");
    await expect(plans.locator(".plus__plan").nth(2)).toContainText("£99.99");
    await expect(plans.locator(".plus__plan").nth(2)).toContainText("One payment instead of £39.99 every year");
    await expect(plans.getByText("Price at checkout")).toHaveCount(0);
    await expect(page.getByText("List prices. Promo codes can be applied at checkout.")).toBeVisible();
    await plans.scrollIntoViewIfNeeded();
    await shot(page, "plus-plans-prices");
  });

  test("without prices from the backend the cards still say 'Price at checkout' and claim no saving", async ({ page }) => {
    const account = await newAccount("noprices");
    await page.route("**/user/plus", (route) =>
      route.request().method() === "GET" ? route.fulfill({ json: { active: false, plan: null, validUntil: null, cancelAtPeriodEnd: false, paywall: true, prices: null } }) : route.continue(),
    );
    await openSignedIn(page, account, "/settings/plus");
    await expect(page.getByText("Price at checkout")).toHaveCount(3);
    await expect(page.getByText(/Save \d+%/)).toHaveCount(0);
  });

  test("Like and Not for me are there without Plus, and pressing one explains Picked for you", async ({ page }) => {
    const account = await newAccount("likegate");
    await freeWithPaywall(page);
    await openSignedIn(page, account, "/detail/test.arctv.fixture/MOVIE/fxm1");
    await page.getByRole("button", { name: "More options" }).click();
    await page.getByRole("button", { name: "Like, with ArcTV Plus" }).click();
    await expect(page.getByRole("heading", { name: "Tell ArcTV what you like." })).toBeVisible();
    await page.getByRole("button", { name: "Close" }).first().click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    // nothing was stored as a like
    await page.getByRole("button", { name: "Not for me, with ArcTV Plus" }).click();
    await page.getByText(/Take me there/).click();
    await expect(page).toHaveURL(/\/settings\/plus/);
  });

  test("Your stats blurs the number and the rest of the page, and points to Plus", async ({ page }) => {
    const account = await newAccount("statspreview");
    const body = {
      providerId: "test.arctv.fixture",
      contentId: "fxm1",
      contentType: "MOVIE",
      seasonNumber: null,
      episodeNumber: null,
      episodeTitle: null,
      title: "Fixture Movie One",
      posterUrl: `${ADDON}/img/poster/fxm1.svg`,
      backdropUrl: null,
      positionMs: 6_000_000,
      durationMs: 6_000_000,
      completed: true,
      watchedAt: new Date(Date.now() - 3_600_000).toISOString(),
    };
    expect((await account.tv.post("/user/watch-progress", body)).status).toBe(200);
    await freeWithPaywall(page);
    await openSignedIn(page, account, "/settings/stats");
    const preview = page.locator(".stats__preview");
    // the 30-day number is blurred out and is not the real one: the real total is not in that part of the page
    const hidden = preview.locator(".stats__hero").first().locator(".stats__big--hidden");
    await expect(hidden).toBeVisible();
    await expect(hidden).toHaveAttribute("aria-hidden", "true");
    await expect(hidden).toHaveCSS("filter", /blur/);
    await expect(preview.locator(".stats__hero").first()).not.toContainText("1 hour 40 minutes");
    await expect(preview.locator(".stats__blur")).toHaveAttribute("aria-hidden", "true");
    await shot(page, "settings-stats-preview");
    await preview.getByRole("button", { name: /See ArcTV Plus/ }).click();
    await expect(page).toHaveURL(/\/settings\/plus/);
  });

  test("someone with Plus sees the real buttons and the full stats, never the teasers", async ({ page }) => {
    const account = await newAccount("hasplus"); // the paywall is off in the test backend: everyone has Plus (early access)
    await openSignedIn(page, account, "/detail/test.arctv.fixture/MOVIE/fxm1");
    await page.getByRole("button", { name: "More options" }).click();
    await expect(page.getByRole("button", { name: "Like", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /with ArcTV Plus/ })).toHaveCount(0);
  });

  test("the profile is shown in the top bar without Plus too, and opens the Profiles screen", async ({ page }) => {
    const account = await newAccount("freeprofile");
    await freeWithPaywall(page);
    // what the server answers for an account without Plus: just its own profile
    await page.route("**/api/profiles", (route) =>
      route.request().method() === "GET"
        ? route.fulfill({ json: { supported: true, plus: false, limit: 5, profiles: [{ id: "main", name: "Me", avatar: "fox", kind: "adult", hasPin: false, isDefault: true }], active: "main" } })
        : route.continue(),
    );
    await openSignedIn(page, account, "/");
    const chip = page.locator(".topnav__profile");
    await expect(chip).toBeVisible();
    await expect(chip).toContainText("Me");
    await chip.click();
    await expect(page).toHaveURL(/\/profiles/);
    await expect(page.getByText("More profiles come with ArcTV Plus")).toHaveCount(0); // no static upsell block any more
    await page.getByRole("button", { name: "Add profile, with ArcTV Plus" }).click();
    const dialog = page.getByRole("dialog", { name: "Give everyone their own profile." });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Close" }).last().click();
    await expect(dialog).toHaveCount(0);
  });

  test("the plan panel says Lifetime supporters can choose to be on the supporters board, and links to it", async ({ page }) => {
    const account = await newAccount("boardnote");
    await freeWithPaywall(page);
    await openSignedIn(page, account, "/settings/plus");
    await expect(page.getByRole("group", { name: "Plans" }).locator(".plus__plan").nth(2)).toContainText("Join the supporters board");
    const callout = page.locator(".plus__board");
    await expect(callout).toContainText("you'll be asked at checkout whether you want to be on the supporters board on arctv.org, with your display name and picture or just as Anonymous");
    await expect(callout.getByRole("link", { name: "See the supporters board" })).toHaveAttribute("href", "https://arctv.org/supporters/");
    await callout.scrollIntoViewIfNeeded();
    await shot(page, "plus-supporters-board-note");
  });

  test("a Lifetime member sees the supporters board switch, off until they turn it on", async ({ page }) => {
    const account = await newAccount("boardswitch");
    let board = false;
    let anon = false;
    const lifetime = () => ({ active: true, plan: "lifetime", validUntil: null, cancelAtPeriodEnd: false, paywall: true, supporterBoard: board, supporterAnonymous: board ? anon : null });
    const puts: unknown[] = [];
    await page.route("**/user/plus", (route) => (route.request().method() === "GET" ? route.fulfill({ json: { ...lifetime(), prices: null } }) : route.continue()));
    await page.route("**/user/plus/supporter", (route) => {
      puts.push(route.request().postDataJSON());
      const sent = route.request().postDataJSON() as { show: boolean; anonymous?: boolean };
      board = sent.show;
      anon = sent.show && sent.anonymous === true;
      return route.fulfill({ json: lifetime() });
    });
    await openSignedIn(page, account, "/settings/plus");
    const toggle = page.getByRole("switch", { name: "Put me on the supporters board" });
    await expect(toggle).toBeVisible();
    await expect(page.getByRole("switch", { name: "List me as Anonymous" })).toHaveCount(0); // only once on the board
    await expect(toggle).toHaveAttribute("aria-checked", "false"); // buying Lifetime does not put anyone on it
    await expect(page.getByText(/It is off until you turn it on/)).toBeVisible();
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    const anonymous = page.getByRole("switch", { name: "List me as Anonymous" });
    await expect(anonymous).toHaveAttribute("aria-checked", "false");
    await anonymous.click();
    await expect(anonymous).toHaveAttribute("aria-checked", "true");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    await expect(anonymous).toHaveCount(0);
    expect(puts).toEqual([{ show: true, anonymous: false }, { show: true, anonymous: true }, { show: false, anonymous: false }]);
    await shot(page, "plus-supporters-board-switch");
  });

  test("someone without Lifetime does not see the switch", async ({ page }) => {
    const account = await newAccount("noboardswitch");
    await freeWithPaywall(page);
    await openSignedIn(page, account, "/settings/plus");
    await expect(page.getByRole("switch", { name: "Put me on the supporters board" })).toHaveCount(0);
  });
});

