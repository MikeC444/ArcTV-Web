import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { BACKEND, newAccount, nextIp, openSignedIn, PASSWORD, Tv, uniqueEmail, useClientIp, shot } from "./helpers";

test.describe("sign-in flows", () => {
  test("a signed-out visitor sees the welcome screen (hero photo, brand headline, Log In / Sign Up)", async ({ page }) => {
    await useClientIp(page.context());
    await page.goto("/");
    await expect(page).toHaveURL(/\/auth$/);
    await expect(page.getByRole("heading", { name: /Your Entertainment,\s*Your Way/ })).toBeVisible();
    await expect(page.getByRole("img", { name: "Mango TV" }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Log In" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign Up" })).toBeVisible();
    await expect(page.getByText("Scan a QR code to create an account from your phone")).toBeVisible();
    await shot(page, "welcome");
  });

  test("an EXISTING Fire TV account signs in with its email + password and lands on Home with its synced data", async ({ page }) => {
    const account = await newAccount("firetv");
    await account.tv.seedContinueWatching({ contentId: "fxm3", title: "Resume Me" });
    await useClientIp(page.context());
    await page.goto("/auth");
    await page.getByRole("button", { name: "Log In" }).click();
    await page.getByRole("button", { name: "Use Email & Password" }).click();
    await page.getByPlaceholder("Email").fill(account.email);
    await page.getByPlaceholder("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Log In" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { name: "Continue Watching" })).toBeVisible(); // the TV's progress, on the web
    await expect(page.locator(".card__title", { hasText: "Resume Me" })).toBeVisible();
    // no second account was created for this email
    const again = await fetch(`${BACKEND}/auth/register`, { method: "POST", headers: { "Content-Type": "application/json", "X-Forwarded-For": nextIp() }, body: JSON.stringify({ email: account.email, password: PASSWORD, deviceId: randomUUID() }) });
    expect(again.status).toBe(409);
  });

  test("wrong credentials and invalid input show clear errors and don't sign in", async ({ page }) => {
    const account = await newAccount("wrongpw", { addon: false });
    await useClientIp(page.context());
    await page.goto("/auth/password/login");
    await page.getByRole("button", { name: "Log In" }).click();
    await expect(page.getByRole("alert")).toHaveText("Enter your email address.");
    await page.getByPlaceholder("Email").fill("not-an-email");
    await page.getByPlaceholder("Password").fill("whatever123");
    await page.getByRole("button", { name: "Log In" }).click();
    await expect(page.getByRole("alert")).toHaveText("Enter a valid email address.");
    await page.getByPlaceholder("Email").fill(account.email);
    await page.getByPlaceholder("Password").fill("definitely-wrong");
    await page.getByRole("button", { name: "Log In" }).click();
    await expect(page.getByRole("alert")).toHaveText("Invalid email or password.");
    await expect(page).toHaveURL(/\/auth\/password\/login$/);
  });

  test("when the service says \"too many attempts\", the form says how long to wait and keeps the button off until then", async ({ page }) => {
    const account = await newAccount("ratelimited", { addon: false });
    await useClientIp(page.context());
    await page.clock.install();
    let attempts = 0;
    await page.route("**/api/auth/login", (route) => {
      attempts++;
      if (attempts > 1) return route.continue(); // after the wait the real server answers
      return route.fulfill({ status: 429, headers: { "Content-Type": "application/json", "Retry-After": "20" }, body: JSON.stringify({ error: { code: "rate_limited", message: "Too many requests right now. Please wait a moment and try again." } }) });
    });
    await page.goto("/auth/password/login");
    await page.getByPlaceholder("Email").fill(account.email);
    await page.getByPlaceholder("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Log In" }).click();

    const notice = page.getByRole("alert");
    await expect(notice).toContainText("Too many sign-in attempts right now");
    await expect(notice).toContainText("try again in 20 s");
    const button = page.getByRole("button", { name: /Try again in \d+ s/ });
    await expect(button).toBeDisabled(); // pressing it would only use up more of the shared allowance
    await shot(page, "signin-rate-limited");

    await page.clock.fastForward(21_000);
    await expect(notice).toHaveCount(0);
    await page.getByRole("button", { name: "Log In" }).click();
    await expect(page).toHaveURL(/\/$/); // the second attempt went through
    expect(attempts).toBe(2);
  });

  test("creating an account in the browser makes a real account the TV can also sign in to", async ({ page }) => {
    const email = uniqueEmail("newweb");
    await useClientIp(page.context());
    await page.goto("/auth/password/register");
    await page.getByPlaceholder("Email").fill(email);
    await page.getByPlaceholder("Display name (optional)").fill("Web Person");
    await page.getByPlaceholder("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Create Account" }).click();
    await expect(page).not.toHaveURL(/\/auth/);
    const login = await fetch(`${BACKEND}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json", "X-Forwarded-For": new Tv(email).ip }, body: JSON.stringify({ email, password: PASSWORD, deviceId: randomUUID(), platform: "fire_tv" }) });
    expect(login.status).toBe(200);
    expect((await login.json()).user.displayName).toBe("Web Person");
  });

  test("QR sign-in: a phone completes it on the backend's activation flow and the browser signs in by itself", async ({ page }) => {
    const account = await newAccount("qr");
    await useClientIp(page.context());
    await page.goto("/auth/qr/login");
    await expect(page.getByRole("heading", { name: "Scan to sign in" })).toBeVisible();
    await expect(page.locator("img.qr")).toBeVisible();
    const href = (await page.getByRole("link", { name: /\/activate\?token=/ }).getAttribute("href"))!;
    const token = new URL(href).searchParams.get("token")!;
    const phone = await fetch(`${BACKEND}/auth/qr/complete`, { method: "POST", headers: { "Content-Type": "application/json", "X-Forwarded-For": nextIp() }, body: JSON.stringify({ token, mode: "login", email: account.email, password: PASSWORD }) });
    expect(phone.status).toBe(204);
    await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
    await expect(page.locator(".hero, .state").first()).toBeVisible();
  });

  test("signing out clears this account's data from the browser and ends the session", async ({ page, context }) => {
    const account = await newAccount("signout");
    await openSignedIn(page, account, "/settings/account");
    await expect(page.getByText(account.email)).toBeVisible();
    await expect.poll(() => page.evaluate(() => Object.keys(localStorage).some((k) => /^mtv:v1:[0-9a-f-]{36}:/.test(k)))).toBe(true);
    await page.getByRole("button", { name: "Sign Out" }).click();
    await expect(page).toHaveURL(/\/auth$/);
    expect(await page.evaluate(() => Object.keys(localStorage).some((k) => /^mtv:v1:[0-9a-f-]{36}:/.test(k)))).toBe(false);
    expect((await context.request.get("/api/auth/session")).status()).toBe(401);
    // the backend really revoked it
    const sessions = (await account.tv.get("/auth/sessions")).body as Array<{ platform: string }>;
    expect(sessions.some((s) => s.platform === "web")).toBe(false);
  });

  test("a session that is revoked remotely ends with a clear 'session expired' message", async ({ page }) => {
    const account = await newAccount("revoked");
    await openSignedIn(page, account, "/my-list");
    await expect(page.getByRole("heading", { name: "My List" })).toBeVisible();
    const sessions = (await account.tv.get("/auth/sessions")).body as Array<{ id: string; platform: string }>;
    const web = sessions.find((s) => s.platform === "web")!;
    expect((await account.tv.del(`/auth/sessions/${web.id}`)).status).toBe(204);
    await page.reload();
    await expect(page).toHaveURL(/\/auth$/);
  });
});
