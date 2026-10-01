import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "../lib/api";
import { resetMonotonicClock } from "../lib/iso";

const calls: Array<{ path: string; method: string; body?: unknown }> = [];
let respond: (path: string, method: string, body?: unknown) => unknown = () => undefined;
vi.mock("../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/api")>();
  return {
    ...actual,
    api: vi.fn(async (path: string, options: { method?: string; body?: unknown } = {}) => {
      const method = options.method ?? "GET";
      calls.push({ path, method, body: options.body });
      const result = respond(path, method, options.body);
      if (result instanceof Error) throw result;
      return result;
    }),
  };
});

const { useFeedback } = await import("./feedback");
const { resetAllStores } = await import("./sync");
const { profileKey } = await import("./profile");

const flush = () => new Promise((r) => setTimeout(r, 0));
const offline = () => new ApiClientError(0, "network", "offline");
const movie = { id: "tt1", title: "One", providerId: "com.linvo.cinemeta" };
const dto = (over: Record<string, unknown> = {}) => ({ profileId: "main", providerId: "com.linvo.cinemeta", contentId: "tt9", contentType: "MOVIE", title: "Nine", feedback: "like", updatedAt: "2026-01-01T00:00:00.000Z", deletedAt: null, ...over });
const echo = (_p: string, method: string, body?: unknown) => (method === "POST" ? body : undefined);

beforeEach(() => {
  localStorage.clear();
  calls.length = 0;
  respond = echo;
  resetMonotonicClock();
  resetAllStores();
});

describe("feedback sync", () => {
  it("pushes a Like at once with its natural key and a timestamp, and marks it acknowledged", async () => {
    useFeedback.getState().hydrate("u1");
    useFeedback.getState().set(movie, "like");
    expect(useFeedback.getState().entries.tt1!.value).toBe("like"); // optimistic
    await flush();
    const post = calls.find((c) => c.method === "POST" && c.path === "/user/feedback")!;
    expect(post.body).toMatchObject({ profileId: "main", providerId: "com.linvo.cinemeta", contentId: "tt1", contentType: "MOVIE", feedback: "like", title: "One" });
    expect(typeof (post.body as { updatedAt: string }).updatedAt).toBe("string");
    expect(useFeedback.getState().entries.tt1!.synced).toBe(true);
  });

  it("an edit pushes the new value; clearing pushes a DELETE with the same key", async () => {
    useFeedback.getState().hydrate("u1");
    useFeedback.getState().set(movie, "like");
    await flush();
    useFeedback.getState().set(movie, "dislike");
    await flush();
    expect(calls.filter((c) => c.method === "POST").map((c) => (c.body as { feedback: string }).feedback)).toEqual(["like", "dislike"]);
    useFeedback.getState().toggle(movie, "dislike"); // same button again clears it
    await flush();
    const del = calls.find((c) => c.method === "DELETE")!;
    expect(del.path).toContain("/user/feedback?");
    expect(del.path).toContain("contentId=tt1");
    expect(del.path).toContain("profileId=main");
    expect(useFeedback.getState().entries.tt1).toBeUndefined();
  });

  it("offline: the change stays on this device, is queued, and is delivered later", async () => {
    useFeedback.getState().hydrate("u1");
    respond = () => offline();
    useFeedback.getState().set(movie, "dislike");
    await flush();
    expect(useFeedback.getState().entries.tt1!.value).toBe("dislike"); // still applied locally
    expect(useFeedback.getState().entries.tt1!.synced).toBe(false);
    calls.length = 0;
    respond = echo;
    await useFeedback.getState().retryPending();
    expect(calls.some((c) => c.method === "POST" && (c.body as { feedback: string }).feedback === "dislike")).toBe(true);
    expect(useFeedback.getState().entries.tt1!.synced).toBe(true);
    calls.length = 0;
    await useFeedback.getState().retryPending(); // nothing left to send
    expect(calls).toHaveLength(0);
  });

  it("an offline clear is queued too", async () => {
    useFeedback.getState().hydrate("u1");
    useFeedback.getState().set(movie, "like");
    await flush();
    respond = () => offline();
    useFeedback.getState().set(movie, null);
    await flush();
    respond = (_p, method) => (method === "DELETE" ? dto({ contentId: "tt1", deletedAt: "2026-02-01T00:00:00.000Z" }) : undefined);
    calls.length = 0;
    await useFeedback.getState().retryPending();
    expect(calls.some((c) => c.method === "DELETE")).toBe(true);
    expect(useFeedback.getState().entries.tt1).toBeUndefined();
  });

  it("pull brings in feedback given on another device", async () => {
    useFeedback.getState().hydrate("u1");
    respond = (path) => (path.startsWith("/user/feedback?") ? { items: [dto()] } : undefined);
    expect(await useFeedback.getState().pull()).toBe(true);
    expect(useFeedback.getState().entries.tt9).toMatchObject({ value: "like", title: "Nine", synced: true });
  });

  it("pull drops something this device had acknowledged but that was cleared on another device", async () => {
    useFeedback.getState().hydrate("u1");
    useFeedback.getState().set(movie, "like");
    await flush();
    respond = () => ({ items: [] });
    await useFeedback.getState().pull();
    expect(useFeedback.getState().entries.tt1).toBeUndefined();
  });

  it("pull sends up feedback that only exists on this device (given before syncing existed, or offline)", async () => {
    localStorage.setItem(profileKey("u1", "main", "feedback"), JSON.stringify({ tt1: { value: "like", title: "One", at: "2026-01-01T00:00:00.000Z" } }));
    useFeedback.getState().hydrate("u1");
    respond = (path, method, body) => (method === "POST" ? body : path.startsWith("/user/feedback?") ? { items: [] } : undefined);
    await useFeedback.getState().pull();
    await flush();
    expect(useFeedback.getState().entries.tt1!.value).toBe("like");
    expect(calls.some((c) => c.method === "POST" && (c.body as { contentId: string }).contentId === "tt1")).toBe(true);
  });

  it("last write wins between devices on pull", async () => {
    localStorage.setItem(profileKey("u1", "main", "feedback"), JSON.stringify({ tt9: { value: "dislike", title: "Nine", at: "2026-03-01T00:00:00.000Z" } }));
    useFeedback.getState().hydrate("u1");
    // the server's version is older → this device's newer one is kept and sent
    respond = (path, method, body) => (method === "POST" ? body : path.startsWith("/user/feedback?") ? { items: [dto({ feedback: "like", updatedAt: "2026-01-01T00:00:00.000Z" })] } : undefined);
    await useFeedback.getState().pull();
    await flush();
    expect(useFeedback.getState().entries.tt9!.value).toBe("dislike");
    // ...and a newer server version replaces an older local one
    localStorage.setItem(profileKey("u1", "main", "feedback"), JSON.stringify({ tt9: { value: "dislike", title: "Nine", at: "2026-01-01T00:00:00.000Z" } }));
    useFeedback.getState().hydrate("u1");
    respond = (path) => (path.startsWith("/user/feedback?") ? { items: [dto({ feedback: "like", updatedAt: "2026-06-01T00:00:00.000Z" })] } : undefined);
    await useFeedback.getState().pull();
    expect(useFeedback.getState().entries.tt9!.value).toBe("like");
  });

  it("a change still waiting to be sent wins over the server's older copy on pull", async () => {
    useFeedback.getState().hydrate("u1");
    respond = () => offline();
    useFeedback.getState().set({ id: "tt9", title: "Nine", providerId: "com.linvo.cinemeta" }, "dislike");
    await flush();
    respond = (path) => (path.startsWith("/user/feedback?") ? { items: [dto({ feedback: "like", updatedAt: "2025-01-01T00:00:00.000Z" })] } : undefined);
    await useFeedback.getState().pull();
    expect(useFeedback.getState().entries.tt9!.value).toBe("dislike");
  });

  it("keeps profiles apart: pulls only the active profile and never touches another's feedback", async () => {
    useFeedback.getState().hydrate("u1", "kids");
    respond = (path) => (path.startsWith("/user/feedback?") ? { items: [dto({ profileId: "kids", contentId: "k1", title: "Kid film" }), dto({ profileId: "main", contentId: "m1", title: "Main film" })] } : undefined);
    await useFeedback.getState().pull();
    expect(calls[0]!.path).toContain("profileId=kids");
    expect(Object.keys(useFeedback.getState().entries)).toEqual(["k1"]);
    useFeedback.getState().hydrate("u1", "main");
    expect(useFeedback.getState().entries).toEqual({}); // nothing from the kids profile leaks
  });

  it("a failed pull (offline, or a backend that does not have the endpoint yet) changes nothing and reports false", async () => {
    useFeedback.getState().hydrate("u1");
    respond = echo;
    useFeedback.getState().set(movie, "like");
    await flush();
    respond = () => offline();
    expect(await useFeedback.getState().pull()).toBe(false);
    respond = () => new ApiClientError(404, "not_found", "Not found");
    expect(await useFeedback.getState().pull()).toBe(false);
    expect(useFeedback.getState().entries.tt1!.value).toBe("like");
  });
});
