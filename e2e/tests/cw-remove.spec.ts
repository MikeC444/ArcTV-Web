import { expect, test } from "@playwright/test";
import { newAccount, openSignedIn } from "./helpers";

/** Removing a title from Continue Watching does not mark it watched: it is just taken off, and its saved position is forgotten. */
test("Remove from Continue Watching: not watched, position forgotten", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop-1920", "one size is enough");
  const account = await newAccount("cw-remove");
  await account.tv.seedContinueWatching({ contentId: "fxm903", title: "Half Watched" });
  await openSignedIn(page, account);
  const card = page.locator('.card[data-cw="true"] .card__surface').first();
  await card.click({ button: "right" });
  const dialog = page.getByRole("dialog", { name: /Actions for/ });
  await expect(dialog.getByRole("button", { name: /Resume from 25m/ })).toBeVisible();
  await dialog.getByRole("button", { name: "Remove from Continue Watching" }).click();
  await expect(page.locator('.card[data-cw="true"]')).toHaveCount(0);

  await expect.poll(async () => (await account.tv.get("/user/continue-watching")).body.items.length).toBe(0);
  const history = (await account.tv.get("/user/history")).body.items as Array<{ contentId: string; completed: boolean; positionMs: number }>;
  expect(history.find((h) => h.contentId === "fxm903")).toMatchObject({ completed: false, positionMs: 0 }); // not finished, and starts over
  expect((await account.tv.get("/user/watchlist")).body.items).toEqual([]); // nothing was marked watched
  await expect(page.locator(".card__watched")).toHaveCount(0);

  await page.reload(); // still gone after a refresh, and still not watched
  await expect(page.locator(".hero")).toBeVisible();
  await expect(page.locator('.card[data-cw="true"]')).toHaveCount(0);
  await expect(page.locator(".card__watched")).toHaveCount(0);
});
