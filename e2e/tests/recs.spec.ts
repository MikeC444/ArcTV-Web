import { expect, test } from "@playwright/test";
import { newAccount, openSignedIn } from "./helpers";

const CINEMETA = "com.linvo.cinemeta";
const rate = (id: string, title: string, feedback: "like" | "dislike") => ({ profileId: "main", providerId: CINEMETA, contentId: id, contentType: "MOVIE", title, feedback, updatedAt: new Date().toISOString() });

test.describe("Settings → Recommendations", () => {
  test("lists what you liked and disliked, explains the picks, removes one, and resets", async ({ page }, info) => {
    test.skip(info.project.name === "tablet-820", "layout is covered by the other sizes");
    const account = await newAccount("recs");
    for (const [id, title] of [["tt0816692", "Interstellar"], ["tt1160419", "Dune"], ["tt2543164", "Arrival"], ["tt1856101", "Blade Runner 2049"]] as const) expect((await account.tv.post("/user/feedback", rate(id, title, "like"))).status).toBe(200);
    for (const [id, title] of [["tt1457767", "The Conjuring"], ["tt0387564", "Saw"], ["tt5814060", "The Nun"]] as const) expect((await account.tv.post("/user/feedback", rate(id, title, "dislike"))).status).toBe(200);

    await openSignedIn(page, account, "/settings/recommendations");
    await expect(page.getByRole("heading", { name: "Recommendations", level: 2 })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Liked (4)" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Not for me (3)" })).toBeVisible();
    await expect(page.getByText("Interstellar").first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "How it works" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "What shapes your picks" })).toBeVisible();

    await expect(page.getByText("+20 points")).toBeVisible(); // 4 likes x 5
    await expect(page.getByText("−15 points")).toBeVisible(); // 3 Not for me x -5
    await expect(page.getByRole("heading", { name: "Why these were picked" })).toHaveCount(0); // that is shown on Home

    await page.getByRole("tab", { name: "Not for me (3)" }).click();
    await expect(page.getByText("The Conjuring")).toBeVisible();
    await page.getByRole("button", { name: "Remove Saw from Not for me" }).click();
    await expect(page.getByRole("tab", { name: "Not for me (2)" })).toBeVisible();
    await expect.poll(async () => ((await account.tv.get("/user/feedback?profileId=main")).body?.items ?? []).filter((i: { deletedAt?: string | null }) => !i.deletedAt).length).toBe(6);

    await page.getByRole("button", { name: "Reset preferences" }).click();
    await page.getByRole("button", { name: "Yes, reset" }).click();
    await expect(page.getByRole("tab", { name: "Liked (0)" })).toBeVisible();
    await expect.poll(async () => ((await account.tv.get("/user/feedback?profileId=main")).body?.items ?? []).filter((i: { deletedAt?: string | null }) => !i.deletedAt).length).toBe(0);
  });
});
