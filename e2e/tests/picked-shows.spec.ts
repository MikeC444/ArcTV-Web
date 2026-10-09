import { expect, test } from "@playwright/test";
import { newAccount, openSignedIn } from "./helpers";

/** "Picked for you" takes TV shows as well as movies: a show can be rated like a movie, and the rating is stored on the account as a TV show. */
test.describe("Picked for you with TV shows", () => {
  test("rating a TV show from its menu is stored as a TV show, and the Home row can then hold shows", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop-1920", "one size is enough");
    const account = await newAccount("picked-tv");
    await account.tv.seedWatched({ contentId: "fxm1", title: "Fixture Movie One" });
    await account.tv.seedWatched({ contentId: "fxm2", title: "Fixture Movie Two" });
    await openSignedIn(page, account, "/tv");
    const card = page.locator(".grid .card__surface").first();
    await expect(card).toBeVisible();
    await card.click({ button: "right" });
    const dialog = page.getByRole("dialog", { name: /Actions for/ });
    await expect(dialog.getByRole("button", { name: "Like" })).toBeVisible(); // shows get the rating buttons now
    await dialog.getByRole("button", { name: "Like" }).click();
    await expect.poll(async () => {
      const r = await account.tv.get("/user/feedback?profileId=main");
      return (r.body?.items ?? []).map((i: { contentType: string; feedback: string }) => `${i.contentType}:${i.feedback}`);
    }).toEqual(["TV_SHOW:like"]);

    await page.goto("/");
    const row = page.locator("section", { has: page.getByRole("heading", { name: "Picked for you" }) });
    await expect(row).toBeVisible({ timeout: 20_000 });
    const hrefs = await row.locator("a[href*='/detail/']").evaluateAll((els) => els.map((e) => e.getAttribute("href")));
    expect(hrefs.length).toBeGreaterThan(0);
    expect(hrefs.some((h) => h!.includes("/TV_SHOW/")), hrefs.join("\n")).toBe(true);
  });
});
