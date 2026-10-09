import { expect, test } from "@playwright/test";
import { newAccount, openSignedIn } from "./helpers";

/** The one-time "New in ArcTV Plus" popup for Plus members: shows a few seconds after landing on Home, once. */
test.describe("What's new in ArcTV Plus", () => {
  test("appears on Home, closes for good, and 'See what's new' opens Recommendations", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop-1920", "one size is enough");
    const account = await newAccount("whatsnew");
    await openSignedIn(page, account, "/", { whatsNew: true });
    const dialog = page.getByRole("dialog", { name: "New in ArcTV Plus." });
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await expect(dialog.getByText("Your recommendations")).toBeVisible();
    await expect(dialog.getByText("TV shows in Picked for you")).toBeVisible();
    await expect(dialog.getByText("Remove a pick for 5 days")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Don't show me again" })).toHaveCount(0); // a one-time note needs no such link
    await dialog.getByRole("button", { name: "Close" }).last().click();
    await expect(dialog).toBeHidden();

    await page.reload(); // seen: it does not come back
    await expect(page.locator(".hero")).toBeVisible();
    await page.waitForTimeout(5500);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("'See what's new' takes you to the Recommendations tab", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop-1920", "one size is enough");
    const account = await newAccount("whatsnew-go");
    await openSignedIn(page, account, "/", { whatsNew: true });
    const dialog = page.getByRole("dialog", { name: "New in ArcTV Plus." });
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await dialog.getByRole("button", { name: /See what's new/ }).click();
    await expect(page).toHaveURL(/\/settings\/recommendations$/);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("not shown to an account that has marked it seen", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop-1920", "one size is enough");
    const account = await newAccount("whatsnew-seen");
    await openSignedIn(page, account, "/"); // the default marks it seen
    await expect(page.locator(".hero")).toBeVisible();
    await page.waitForTimeout(5500);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});
