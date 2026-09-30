import { expect, test } from "@playwright/test";
import { newAccount, openSignedIn } from "./helpers";

test.describe("home hero", () => {
  test("flicks through its ten titles by itself every few seconds, all of them from the Home rows", async ({ page }) => {
    const account = await newAccount("herofast");
    await openSignedIn(page, account);
    await expect(page.locator(".hero__content h1").first()).toBeVisible({ timeout: 20_000 });
    await page.mouse.move(960, 1060); // below the hero: hovering the hero pauses the show
    const dots = page.locator(".hero__dot");
    await expect(dots).toHaveCount(10);
    await expect(dots.first()).toHaveAttribute("aria-current", "true");
    const started = Date.now();
    await expect(dots.nth(1)).toHaveAttribute("aria-current", "true", { timeout: 9_000 });
    expect(Date.now() - started).toBeLessThan(8_000); // it used to take 9 s per title

    // the ten titles are ones the enabled rows show
    const rowTitles = new Set(await page.locator(".home__rows .row:not(:has(.card[data-cw])) .card__title").allTextContents());
    const heroTitles: string[] = [];
    for (let i = 0; i < 10; i++) {
      await dots.nth(i).click();
      await expect(dots.nth(i)).toHaveAttribute("aria-current", "true");
      await expect(page.locator(".hero__slide")).toHaveCount(1, { timeout: 5_000 });
      heroTitles.push((await page.locator(".hero__content h1").first().textContent()) ?? "");
    }
    for (const title of heroTitles) expect(rowTitles.has(title), `${title} is shown in a Home row`).toBe(true);
  });
});
