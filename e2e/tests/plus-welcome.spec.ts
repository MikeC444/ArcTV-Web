import { expect, test } from "@playwright/test";
import { newAccount, openSignedIn } from "./helpers";

/** The one-time "Everything in ArcTV Plus" popup for Plus members: shows a few seconds after landing on Home, once. */
test.describe("Plus welcome popup", () => {
  test("appears on Home, closes for good, and 'See my Plus settings' opens it", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop-1920", "one size is enough");
    const account = await newAccount("welcome");
    await openSignedIn(page, account, "/", { welcome: true });
    const dialog = page.getByRole("dialog", { name: "Everything in ArcTV Plus." });
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    for (const feature of ["Picked for you", "Up to 5 profiles", "Smart source picking", "Your stats", "Downloads (web only)"]) await expect(dialog.getByText(feature, { exact: true })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Don't show me again" })).toHaveCount(0); // a one-time note needs no such link
    await dialog.getByRole("button", { name: "Close" }).last().click();
    await expect(dialog).toBeHidden();

    await page.reload(); // seen: it does not come back
    await expect(page.locator(".hero")).toBeVisible();
    await page.waitForTimeout(5500);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("'See my Plus settings' takes you to Plus settings", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop-1920", "one size is enough");
    const account = await newAccount("welcome-go");
    await openSignedIn(page, account, "/", { welcome: true });
    const dialog = page.getByRole("dialog", { name: "Everything in ArcTV Plus." });
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await dialog.getByRole("button", { name: /See my Plus settings/ }).click();
    await expect(page).toHaveURL(/\/settings\/plus-settings$/);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("not shown to an account that has marked it seen", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop-1920", "one size is enough");
    const account = await newAccount("welcome-seen");
    await openSignedIn(page, account, "/"); // the default marks it seen
    await expect(page.locator(".hero")).toBeVisible();
    await page.waitForTimeout(5500);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});
