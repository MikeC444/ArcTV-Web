import { expect, test } from "@playwright/test";
import { newAccount, openSignedIn } from "./helpers";

/** A title removed from "Picked for you" stays out for 5 days, through a refresh, and is let back after that. */
test("Remove from Picked for you: gone through a refresh, back in consideration after 5 days", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop-1920", "one size is enough");
  const account = await newAccount("picked-remove");
  await account.tv.seedWatched({ contentId: "fxm1", title: "Fixture Movie One" });
  await account.tv.seedWatched({ contentId: "fxm2", title: "Fixture Movie Two" });
  await account.tv.seedWatched({ contentId: "fxm3", title: "Fixture Movie Three" });
  await openSignedIn(page, account, "/");
  const row = page.locator("section", { has: page.getByRole("heading", { name: "Picked for you" }) });
  await expect(row).toBeVisible({ timeout: 20_000 });
  const hrefOf = async () => (await row.locator("a[href*='/detail/']").evaluateAll((els) => els.map((e) => e.getAttribute("href"))));
  const before = await hrefOf();
  expect(before.length).toBeGreaterThan(0);

  await row.locator(".card__surface").first().click({ button: "right" });
  await page.getByRole("dialog").getByRole("button", { name: "Remove from Picked for you" }).click();
  const keyOf = () => page.evaluate(() => Object.keys(localStorage).find((k) => k.endsWith("picked-dismissed")) ?? "");
  const key = await keyOf();
  expect(key).not.toBe("");
  const saved = JSON.parse((await page.evaluate((k) => localStorage.getItem(k), key))!) as Record<string, number>;
  const ids = Object.keys(saved);
  expect(ids.length).toBe(1);
  expect(Date.now() - saved[ids[0]!]!).toBeLessThan(60_000);

  await page.reload();
  await expect(row).toBeVisible({ timeout: 20_000 });
  expect((await hrefOf()).some((h) => h!.includes(ids[0]!))).toBe(false); // still gone after a refresh

  await page.evaluate(([k, id]) => localStorage.setItem(k!, JSON.stringify({ [id!]: Date.now() - 6 * 86_400_000 })), [key, ids[0]]);
  await page.reload();
  await expect(row).toBeVisible({ timeout: 20_000 });
  expect(await page.evaluate((k) => localStorage.getItem(k), key)).toBe("{}"); // 6 days on: forgotten, so it is an ordinary candidate again
});
