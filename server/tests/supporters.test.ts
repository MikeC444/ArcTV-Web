import request from "supertest";
import { describe, expect, it } from "vitest";
import type { BackendFetch, BackendRequest, BackendResponse } from "../src/backend.js";
import { cleanSupporters } from "../src/app.js";
import { appWith } from "./helpers/app.js";

const answer = (status: number, json?: unknown): BackendResponse => ({ status, json, retryAfter: null });
/** A backend that only knows /supporters, with the answers it should give in turn (the last one repeats; "down" is an unreachable service). */
function supportersBackend(...answers: Array<BackendResponse | "down">) {
  const calls: BackendRequest[] = [];
  const fetch: BackendFetch = async (req) => {
    calls.push(req);
    const next = answers[Math.min(calls.length - 1, answers.length - 1)]!;
    if (next === "down") throw new Error("down");
    return next;
  };
  return { fetch, calls };
}
const board = { supporters: [{ name: "Ada", avatar: "fox", since: "2026-10" }, { name: "Grace", avatar: null, since: null }], total: 2 };

describe("GET /api/supporters (for the landing page)", () => {
  it("needs no sign-in, is open to any site, and gives display names only", async () => {
    const backend = supportersBackend(answer(200, { ...board, extra: "ignored", supporters: [{ name: "Ada", avatar: "fox", since: "2026-10", email: "a@example.com", id: "u1" }, { name: "Grace" }] }));
    const res = await request(appWith(backend.fetch)).get("/api/supporters").set("Origin", "https://arctv.org");
    expect(res.status).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBe("*");
    expect(res.headers["cache-control"]).toContain("max-age=60");
    expect(res.body).toEqual(board);
    expect(JSON.stringify(res.body)).not.toMatch(/example\.com|u1|extra/);
    expect(backend.calls[0]).toMatchObject({ method: "GET", path: "/supporters" });
    expect(backend.calls[0]!.bearer).toBeUndefined(); // no one's session is used
  });

  it("asks the service once for many visitors, not every time", async () => {
    const backend = supportersBackend(answer(200, board));
    const app = appWith(backend.fetch);
    await request(app).get("/api/supporters");
    await request(app).get("/api/supporters");
    await request(app).get("/api/supporters");
    expect(backend.calls).toHaveLength(1);
  });

  it("answers 503 (so the page hides the section) when nothing has ever been available, and keeps the last good answer afterwards", async () => {
    const never = supportersBackend("down");
    const down = await request(appWith(never.fetch)).get("/api/supporters");
    expect(down.status).toBe(503);
    expect(down.body).toEqual({ supporters: [], total: 0 });
    expect(down.headers["cache-control"]).toBe("no-store");

    const odd = supportersBackend(answer(500, { error: "x" }));
    expect((await request(appWith(odd.fetch)).get("/api/supporters")).status).toBe(503);
  });
});

describe("cleanSupporters", () => {
  it("keeps only name, picture id and month: names trimmed, at most 24 characters, no blanks, no non-text, at most 500", () => {
    const many = Array.from({ length: 600 }, (_, i) => ({ name: `n${i}` }));
    expect(cleanSupporters({ supporters: [{ name: "  Ada  " }, { name: "" }, { name: "   " }, { name: 7 }, null, {}, { name: "y".repeat(40) }], total: 7 })).toEqual({
      supporters: [
        { name: "Ada", avatar: null, since: null },
        { name: "y".repeat(24), avatar: null, since: null },
      ],
      total: 7,
    });
    expect(cleanSupporters({ supporters: many, total: 600 })?.supporters).toHaveLength(500);
    expect(cleanSupporters({ supporters: many, total: 600 })?.total).toBe(600);
  });
  it("a picture id or month that is not the expected shape becomes nothing, so nothing odd reaches the page", () => {
    const out = cleanSupporters({
      supporters: [
        { name: "A", avatar: "fox", since: "2026-10" },
        { name: "B", avatar: "../../x.png", since: "October" },
        { name: "C", avatar: "<script>", since: "2026-13" },
        { name: "D", avatar: 5, since: 202610 },
      ],
    })!;
    expect(out.supporters).toEqual([
      { name: "A", avatar: "fox", since: "2026-10" },
      { name: "B", avatar: null, since: null },
      { name: "C", avatar: null, since: null },
      { name: "D", avatar: null, since: null },
    ]);
  });
  it("the total is never smaller than the names shown, and a malformed answer is refused", () => {
    expect(cleanSupporters({ supporters: [{ name: "A" }, { name: "B" }], total: 1 })?.total).toBe(2);
    expect(cleanSupporters({ supporters: [{ name: "A" }] })?.total).toBe(1);
    expect(cleanSupporters(null)).toBeNull();
    expect(cleanSupporters({ supporters: "no" })).toBeNull();
  });
});
