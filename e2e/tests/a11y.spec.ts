import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { newAccount, openSignedIn } from "./helpers";

/**
 * Accessibility, checked automatically on every screen: axe-core (WCAG 2.0 / 2.1 / 2.2 A + AA and its best-practice rules) must
 * find nothing; on phones every tap target is at least 44 × 44 CSS px (the ten hero dots are the one documented exception, 32px);
 * no text is under 12px; and the behaviours added for phones — reduced motion, a pausable / swipeable hero, form errors tied to
 * their fields, one main landmark per screen — are asserted directly.
 */
const SIGNED_OUT = [
  ["welcome", "/auth"],
  ["auth-method", "/auth/method/login"],
  ["auth-password", "/auth/password/login"],
  ["auth-qr", "/auth/qr/login"],
] as const;
const SIGNED_IN = [
  ["home", "/"],
  ["movies", "/movies"],
  ["tv-shows", "/tv"],
  ["genres", "/genres"],
  ["search", "/search"],
  ["my-list", "/my-list"],
  ["detail-movie", "/detail/test.mangotv.fixture/MOVIE/fxm1"],
  ["detail-series", "/detail/test.mangotv.fixture/TV_SHOW/fxs1"],
  ["sources", "/sources/test.mangotv.fixture/MOVIE/fxm1/-1/-1"],
  ["settings-account", "/settings"],
  ["settings-addons", "/settings/addons"],
  ["settings-home-rows", "/settings/home-rows"],
  ["settings-subtitles", "/settings/subtitles"],
] as const;

async function problems(page: Page, name: string, phone: boolean): Promise<string[]> {
  await page.waitForTimeout(700); // fonts, images, animations settle
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"]).analyze();
  const found = axe.violations.map((v) => `${name}: ${v.id} (${v.impact}) — ${v.help}: ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
  const own = await page.evaluate((isPhone) => {
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      const st = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && st.visibility !== "hidden" && st.display !== "none";
    };
    const label = (el: Element) => `${el.tagName.toLowerCase()}.${String(el.className || "").split(" ").slice(0, 2).join(".")} "${(el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 24)}"`;
    const out: string[] = [];
    if (isPhone) {
      const targets = Array.from(document.querySelectorAll("a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button], [role=switch], [role=radio]")).filter(visible).filter((el) => !el.closest(".skip-link"));
      for (const el of targets) {
        const r = el.getBoundingClientRect();
        const need = el.classList.contains("hero__dot") ? 32 : 44; // ten dots must fit across a phone; 32px clears WCAG 2.2's 24px, and swiping / the pause button are alternatives
        if (Math.min(r.width, r.height) < need - 0.5) out.push(`tap target under ${need}px: ${label(el)} ${Math.round(r.width)}×${Math.round(r.height)}`);
      }
    }
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const el = node.parentElement;
      if (!el || !(node.textContent || "").trim() || !visible(el)) continue;
      const size = parseFloat(getComputedStyle(el).fontSize);
      if (size < 12) out.push(`text under 12px (${size}px): ${label(el)}`);
    }
    return out;
  }, phone);
  return [...found, ...own.map((o) => `${name}: ${o}`)];
}

test.describe("accessibility", () => {
  test("every screen passes axe-core (WCAG A / AA), tap targets and text sizes", async ({ page }, info) => {
    test.setTimeout(300_000);
    const phone = info.project.name.startsWith("mobile");
    const all: string[] = [];
    await page.addInitScript(() => sessionStorage.setItem("mtv:booted", "1"));
    for (const [name, path] of SIGNED_OUT) {
      await page.goto(path);
      await expect(page.locator("main")).toHaveCount(1); // one main landmark per screen
      all.push(...(await problems(page, name, phone)));
    }
    const account = await newAccount("a11y");
    await openSignedIn(page, account);
    for (const [name, path] of SIGNED_IN) {
      await page.goto(path);
      await expect(page.locator("main")).toHaveCount(1);
      all.push(...(await problems(page, name, phone)));
    }

    // the quick-actions dialog and the player
    await page.goto("/movies");
    await expect(page.locator(".grid .card__surface").first()).toBeVisible();
    await page.locator(".grid .card__surface").first().click({ button: "right" });
    await expect(page.getByRole("dialog")).toBeVisible();
    all.push(...(await problems(page, "card-menu", phone)));
    await page.keyboard.press("Escape");

    await page.goto("/sources/test.mangotv.fixture/TV_SHOW/fxs2/1/1");
    await page.locator(".source", { hasText: "Fixture Direct" }).locator(".source__surface").click();
    await expect(page).toHaveURL(/\/player\//);
    await expect(page.locator("video.player__video")).toBeVisible();
    await expect.poll(() => page.locator("video.player__video").evaluate((v: HTMLVideoElement) => v.currentTime), { timeout: 20_000 }).toBeGreaterThan(0.5);
    all.push(...(await problems(page, "player", phone)));

    expect(all, all.join("\n")).toEqual([]);
  });

  test("reduced motion: the hero does not rotate by itself, nothing slides or zooms", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const account = await newAccount("a11y-motion");
    await openSignedIn(page, account);
    await expect(page.locator(".hero__content h1").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Start the automatic slide show" })).toBeVisible(); // starts paused
    const duration = await page.locator(".hero__layer img").first().evaluate((el) => ({ iterations: getComputedStyle(el).animationIterationCount, time: parseFloat(getComputedStyle(el).animationDuration) }));
    expect(duration.iterations).toBe("1"); // no endless Ken Burns zoom
    expect(duration.time).toBeLessThan(0.01);
    await page.locator(".hero__dot").nth(2).click();
    await expect(page.locator(".hero__slide")).toHaveCount(1, { timeout: 3_000 }); // the change is effectively instant
  });

  test("the hero slide show can be paused and (on a phone) swiped", async ({ page }, info) => {
    const account = await newAccount("a11y-hero");
    await openSignedIn(page, account);
    await expect(page.locator(".hero__content h1").first()).toBeVisible();
    const pause = page.getByRole("button", { name: "Pause the automatic slide show" });
    await expect(pause).toBeVisible();
    await pause.click();
    await expect(page.getByRole("button", { name: "Start the automatic slide show" })).toBeVisible();
    await page.getByRole("button", { name: "Start the automatic slide show" }).click();
    await expect(pause).toBeVisible();

    if (info.project.name.startsWith("mobile")) {
      const first = await page.locator(".hero__content h1").first().textContent();
      await page.locator(".hero").evaluate((hero) => {
        const point = (x: number, y: number) => new Touch({ identifier: 1, target: hero, clientX: x, clientY: y });
        hero.dispatchEvent(new TouchEvent("touchstart", { bubbles: true, touches: [point(300, 300)], changedTouches: [point(300, 300)] }));
        hero.dispatchEvent(new TouchEvent("touchend", { bubbles: true, touches: [], changedTouches: [point(120, 304)] })); // a swipe to the left
      });
      await expect(page.locator(".hero__dot").nth(1)).toHaveAttribute("aria-current", "true"); // the next title
      await expect(page.locator(".hero__slide")).toHaveCount(1, { timeout: 5_000 });
      expect(await page.locator(".hero__content h1").first().textContent()).not.toBe(first);
    }
  });

  test("a form error is announced and tied to the fields it is about", async ({ page }) => {
    await page.addInitScript(() => sessionStorage.setItem("mtv:booted", "1"));
    await page.goto("/auth/password/login");
    await page.getByRole("button", { name: "Log In" }).click();
    const error = page.getByRole("alert");
    await expect(error).toHaveText("Enter your email address.");
    await expect(error).toHaveAttribute("id", "auth-error");
    await expect(page.getByPlaceholder("Email")).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByPlaceholder("Email")).toHaveAttribute("aria-describedby", "auth-error");
  });
});
