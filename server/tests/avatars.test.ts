import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { appWith } from "./helpers/app.js";
import { createMockBackend } from "./helpers/mockBackend.js";

describe("profile pictures", () => {
  it("can be shown by another site (the landing page's supporters page), while the rest of the app stays same-site only", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "arctv-static-"));
    mkdirSync(path.join(dir, "avatars"));
    writeFileSync(path.join(dir, "avatars", "fox.webp"), "x");
    writeFileSync(path.join(dir, "robots.txt"), "x");
    writeFileSync(path.join(dir, "index.html"), "<!doctype html>"); // the server only serves a folder that has the app in it
    const app = appWith(createMockBackend().fetch, { staticDir: dir });
    const picture = await request(app).get("/avatars/fox.webp");
    expect(picture.status).toBe(200);
    expect(picture.headers["cross-origin-resource-policy"]).toBe("cross-origin");
    const other = await request(app).get("/robots.txt");
    expect(other.status).toBe(200);
    expect(other.headers["cross-origin-resource-policy"]).toBe("same-origin");
  });
});
