import { expect, test, type Page } from "@playwright/test";
import { ADDON, newAccount, openSignedIn } from "./helpers";

/**
 * Audio compatibility mode, in a real browser: the fixture "Dolby" source is VP9 video with Dolby Digital 5.1 sound in Matroska. This
 * Chromium can't decode Dolby Digital, so the picture would play silent. The player asks the server to convert the sound instead.
 */
const video = (page: Page) => page.locator("video.player__video");
const clock = (page: Page) => video(page).evaluate((v: HTMLVideoElement) => v.currentTime);
const src = (page: Page) => video(page).evaluate((v: HTMLVideoElement) => v.currentSrc);
const decodedAudio = (page: Page) => video(page).evaluate((v: HTMLVideoElement & { webkitAudioDecodedByteCount?: number }) => v.webkitAudioDecodedByteCount ?? -1);
/** The elapsed-time label (m:ss) in seconds. */
const shown = async (page: Page) => {
  const text = (await page.getByLabel("Elapsed").textContent()) ?? "0:00";
  const [m = "0", s = "0"] = text.trim().split(":");
  return Number(m) * 60 + Number(s);
};

async function openDolby(page: Page, label: string) {
  const account = await newAccount(label);
  await account.tv.installAddon(`${ADDON}/ac3/manifest.json`, 1);
  await openSignedIn(page, account);
  await page.goto("/sources/test.mangotv.fixture/MOVIE/fxm1/-1/-1");
  const row = page.locator(".source", { hasText: "Dolby.Movie" });
  await expect(row).toBeVisible({ timeout: 20_000 });
  return { account, row };
}

test.describe("audio compatibility mode", () => {
  test("a source with Dolby Digital sound is labelled, then plays with its sound converted for this browser", async ({ page }) => {
    const { row } = await openDolby(page, "dolby");
    await expect(row).toContainText("No sound here"); // the label that used to be the end of the story
    await row.locator(".source__surface").click();
    await expect(page).toHaveURL(/\/player\//);

    await expect(video(page)).toBeVisible();
    await expect.poll(() => clock(page), { timeout: 30_000 }).toBeGreaterThan(1);
    expect(await src(page)).toContain("/api/transcode?src=");
    await expect.poll(() => decodedAudio(page), { timeout: 10_000 }).toBeGreaterThan(0); // sound really is being decoded now
    await expect(page.getByLabel("Duration")).toHaveText(/^0?0:1[12]$/); // the length comes from the server, as the converted stream states none
    await expect(page.locator(".perror")).toHaveCount(0);
  });

  test("it can be switched off and on from Settings, carrying on from the same place, and seeking works either way", async ({ page }) => {
    const { row } = await openDolby(page, "dolbytoggle");
    await row.locator(".source__surface").click();
    await expect.poll(() => clock(page), { timeout: 30_000 }).toBeGreaterThan(3);
    await page.keyboard.press("k"); // pause
    const before = await shown(page);

    // off: the source as it is, from where we were
    await page.getByRole("button", { name: "Player settings" }).click();
    await expect(page.getByText("No sound? Convert audio")).toBeVisible();
    await page.getByText("No sound? Convert audio").click();
    await expect.poll(async () => !(await src(page)).includes("/api/transcode"), { timeout: 20_000 }).toBe(true);
    await expect.poll(() => shown(page), { timeout: 20_000 }).toBeGreaterThanOrEqual(before - 1);

    // on again, mid-film: the converted stream starts there (its own clock is behind by that much, the screen's is not)
    const at = await shown(page);
    await page.getByRole("button", { name: "Player settings" }).click();
    await page.getByText("No sound? Convert audio").click();
    await expect.poll(async () => (await src(page)).includes("/api/transcode?src=") && (await src(page)).includes("&start="), { timeout: 30_000 }).toBe(true);
    await expect.poll(() => decodedAudio(page), { timeout: 15_000 }).toBeGreaterThan(0);
    await expect.poll(() => shown(page), { timeout: 15_000 }).toBeGreaterThanOrEqual(Math.max(0, at - 4));
    expect(await clock(page)).toBeLessThan(at); // the video element's own clock restarted near zero

    // seeking back past where this converted stream begins starts it again from the earlier place
    await page.getByRole("button", { name: "Rewind 10 seconds" }).click();
    await expect.poll(() => shown(page), { timeout: 20_000 }).toBeLessThanOrEqual(Math.max(at - 6, 2));
    await expect.poll(() => decodedAudio(page), { timeout: 15_000 }).toBeGreaterThan(0);
  });

  test("an ordinary source doesn't use it, and the player says when it's on (Source Info)", async ({ page }) => {
    const account = await newAccount("plain");
    await openSignedIn(page, account);
    await page.goto("/sources/test.mangotv.fixture/TV_SHOW/fxs2/1/1");
    await page.locator(".source", { hasText: "Fixture Direct" }).locator(".source__surface").click();
    await expect.poll(() => clock(page), { timeout: 20_000 }).toBeGreaterThan(1);
    expect(await src(page)).not.toContain("/api/transcode");
    // still available by hand, for a source whose sound is silent for another reason
    await page.getByRole("button", { name: "Player settings" }).click();
    await expect(page.getByText("No sound? Convert audio")).toBeVisible();
  });
});
