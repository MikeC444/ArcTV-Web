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
    for (const feature of ["Picked for you", "Up to 5 profiles", "Smart source picking", "Your stats", "Downloads (web, Mac and Windows)"]) await expect(dialog.getByText(feature, { exact: true })).toBeVisible();
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

  test("never stacks with the Windows app popup: the Plus tour goes first, then the app popup after it is closed", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop-1920", "one size is enough");
    const account = await newAccount("welcome-turns");
    await openSignedIn(page, account, "/", { welcome: true, apps: true });
    const plus = page.getByRole("dialog", { name: "Everything in ArcTV Plus." });
    const windows = page.getByRole("dialog", { name: "Arc TV is on your PC." });
    await expect(plus).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(4500); // long enough for the other one to have tried again
    await expect(page.getByRole("dialog")).toHaveCount(1);
    await expect(windows).toHaveCount(0);
    await plus.getByRole("button", { name: "Close" }).last().click();
    await expect(windows).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("dialog")).toHaveCount(1);
  });
});
