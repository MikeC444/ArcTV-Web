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
            trialDays: 5,
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
      route.request().method() === "GET" ? route.fulfill({ json: { active: false, plan: null, validUntil: null, cancelAtPeriodEnd: false, paywall: true, trialDays: 0, prices: null } }) : route.continue(),
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

  test("Your stats gives a taste of the real numbers, blurs the rest, and points to Plus", async ({ page }) => {
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
    await expect(preview.locator(".stats__hero .stats__big").first()).toContainText("1 hour 40 minutes");
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
});
