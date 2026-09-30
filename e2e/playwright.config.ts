import fs from "node:fs";
import { defineConfig, devices } from "@playwright/test";

const WEB = process.env.WEB_URL ?? "http://127.0.0.1:8090";
// Sandboxes ship a pre-installed Chromium; CI can run `npx playwright install chromium` instead and leave this unset.
const preinstalled = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const executablePath = process.env.PW_CHROMIUM_PATH ?? (fs.existsSync(preinstalled) ? preinstalled : undefined);
const launchOptions = { executablePath, args: ["--autoplay-policy=no-user-gesture-required", "--no-sandbox"] };

export default defineConfig({
  testDir: "./tests",
  outputDir: "../test-results",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: { baseURL: WEB, trace: "off", launchOptions, colorScheme: "dark", locale: "en-US" },
  projects: [
    // The Firestick reference is 1920×1080 (960×540 dp @ 2x): the "desktop" project is the parity check.
    { name: "desktop-1920", use: { ...devices["Desktop Chrome"], viewport: { width: 1920, height: 1080 }, launchOptions } },
    { name: "laptop-1366", use: { ...devices["Desktop Chrome"], viewport: { width: 1366, height: 768 }, launchOptions }, testMatch: /responsive|browse|auth/ },
    { name: "tablet-820", use: { ...devices["Desktop Chrome"], viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: true, launchOptions }, testMatch: /responsive/ },
    { name: "mobile-390", use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, launchOptions }, testMatch: /responsive/ },
  ],
});
