import { expect, test } from "@playwright/test";
import { newAccount, openSignedIn } from "./helpers";

/** The poster menu stays open when My List, Watched, Like or Not for me is pressed, and the pressed button shows it. */
test("poster menu: My List, Watched, Like and Not for me keep the menu open and show they are on", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop-1920", "one size is enough");
  const account = await newAccount("stays");
  await openSignedIn(page, account, "/movies");
  await page.locator(".grid .card__surface").first().click({ button: "right" });
  const dialog = page.getByRole("dialog", { name: /Actions for/ });
  await expect(dialog).toBeVisible();

  await dialog.getByRole("button", { name: "Add to My List" }).click();
  await expect(dialog).toBeVisible();
  const list = dialog.getByRole("button", { name: "Remove from My List" });
  await expect(list).toHaveAttribute("data-on", "true");
  await expect(list).toContainText("In My List");
  await expect(dialog.getByRole("status")).toHaveText("Added to My List");

  await dialog.getByRole("button", { name: "Like" }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Remove like" })).toHaveAttribute("aria-pressed", "true");
  await dialog.getByRole("button", { name: "Not for me" }).click(); // switches the Like over
  await expect(dialog.getByRole("button", { name: "Remove “Not for me”" })).toHaveAttribute("data-on", "true");
  await expect(dialog.getByRole("button", { name: "Like" })).toHaveAttribute("data-on", "false");

  await dialog.getByRole("button", { name: "Mark as watched" }).click();
  await expect(dialog.getByRole("button", { name: "Mark as unwatched" })).toHaveAttribute("data-on", "true");
  await dialog.getByRole("button", { name: "Mark as unwatched" }).click(); // pressing again undoes it, still open
  await expect(dialog.getByRole("button", { name: "Mark as watched" })).toHaveAttribute("data-on", "false");
  await expect(dialog).toBeVisible();

  await expect.poll(async () => ((await account.tv.get("/user/feedback?profileId=main")).body?.items ?? []).map((i: { feedback: string }) => i.feedback)).toEqual(["dislike"]);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});
