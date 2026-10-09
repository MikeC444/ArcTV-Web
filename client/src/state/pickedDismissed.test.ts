import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "../lib/api";

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

const { activeRemovals, usePickedDismissed } = await import("./pickedDismissed");
const { profileKey } = await import("./profile");
const { readJson, writeJson } = await import("./persist");

const DAY = 24 * 60 * 60 * 1000;
const key = profileKey("u1", "main", "picked-dismissed");

describe("titles removed from Picked for you", () => {
  beforeEach(() => {
    localStorage.clear();
    calls.length = 0;
    respond = (_p, method, body) => (method === "POST" ? body : { items: [] });
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-10T12:00:00Z"));
    usePickedDismissed.getState().hydrate("u1", "main");
  });
  afterEach(() => vi.useRealTimers());

  it("keeps a removed title out, and it survives a refresh", () => {
    usePickedDismissed.getState().dismiss("tt1");
    expect(usePickedDismissed.getState().ids).toEqual(["tt1"]);
    usePickedDismissed.getState().reset();
    usePickedDismissed.getState().hydrate("u1", "main"); // a refresh
    expect(usePickedDismissed.getState().ids).toEqual(["tt1"]);
  });

  it("lets the title back after 5 days, and not a moment before", () => {
    usePickedDismissed.getState().dismiss("tt1");
    vi.setSystemTime(Date.now() + 5 * DAY - 60_000);
    usePickedDismissed.getState().hydrate("u1", "main");
    expect(usePickedDismissed.getState().ids).toEqual(["tt1"]);
    vi.setSystemTime(Date.now() + 2 * 60_000);
    usePickedDismissed.getState().hydrate("u1", "main");
    expect(usePickedDismissed.getState().ids).toEqual([]);
    expect(readJson(key, null)).toEqual({}); // the expired one is forgotten for good
  });

  it("removing it again after it came back starts a new 5 days", () => {
    usePickedDismissed.getState().dismiss("tt1");
    vi.setSystemTime(Date.now() + 6 * DAY);
    usePickedDismissed.getState().hydrate("u1", "main");
    usePickedDismissed.getState().dismiss("tt1");
    vi.setSystemTime(Date.now() + 4 * DAY);
    usePickedDismissed.getState().hydrate("u1", "main");
    expect(usePickedDismissed.getState().ids).toEqual(["tt1"]);
  });

  it("an older saved list of ids is kept, with its 5 days starting now", () => {
    expect(activeRemovals(["a", "b"], 1000)).toEqual({ a: 1000, b: 1000 });
    writeJson(key, ["tt9"]);
    usePickedDismissed.getState().hydrate("u1", "main");
    expect(usePickedDismissed.getState().ids).toEqual(["tt9"]);
  });
});

const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

describe("removed picks sync across devices", () => {
  beforeEach(() => {
    localStorage.clear();
    calls.length = 0;
    respond = (_p, method, body) => (method === "POST" ? body : { items: [] });
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-10T12:00:00Z"));
    usePickedDismissed.getState().reset();
    usePickedDismissed.getState().hydrate("u1", "main");
  });
  afterEach(() => vi.useRealTimers());

  it("a removal is sent to the account at once", async () => {
    usePickedDismissed.getState().dismiss("tt1");
    await flush();
    const post = calls.find((c) => c.method === "POST" && c.path === "/user/picked-dismissals")!;
    expect(post.body).toEqual({ profileId: "main", contentId: "tt1", dismissedAt: "2026-10-10T12:00:00.000Z" });
  });

  it("another device's removal arrives, and the later removal of the same title wins", async () => {
    usePickedDismissed.getState().dismiss("tt1");
    await flush();
    calls.length = 0;
    const later = new Date(Date.now() + 60_000).toISOString();
    const stale = new Date(Date.now() - 4 * DAY).toISOString();
    respond = (_p, method) => (method === "GET" ? { items: [{ profileId: "main", contentId: "tt1", dismissedAt: later }, { profileId: "main", contentId: "tt2", dismissedAt: stale }, { profileId: "main", contentId: "tt3", dismissedAt: new Date(Date.now() - 6 * DAY).toISOString() }] } : undefined);
    expect(await usePickedDismissed.getState().pull()).toBe(true);
    expect(usePickedDismissed.getState().removedAt["tt1"]).toBe(Date.parse(later));
    expect(usePickedDismissed.getState().ids.sort()).toEqual(["tt1", "tt2"]); // tt3 was removed more than 5 days ago: let back
  });

  it("a removal the account has not heard about is sent up when pulling", async () => {
    usePickedDismissed.getState().dismiss("tt1");
    await flush();
    calls.length = 0;
    respond = (_p, method) => (method === "GET" ? { items: [] } : undefined);
    await usePickedDismissed.getState().pull();
    await flush();
    expect(calls.filter((c) => c.method === "POST").map((c) => (c.body as { contentId: string }).contentId)).toEqual(["tt1"]);
  });

  it("offline: the removal is kept and sent when the connection is back", async () => {
    respond = () => new ApiClientError(0, "network", "offline");
    usePickedDismissed.getState().dismiss("tt1");
    await flush();
    expect(usePickedDismissed.getState().ids).toEqual(["tt1"]); // still hidden here
    calls.length = 0;
    respond = (_p, method, body) => (method === "POST" ? body : undefined);
    await usePickedDismissed.getState().retryPending();
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(1);
    calls.length = 0;
    await usePickedDismissed.getState().retryPending();
    expect(calls).toHaveLength(0); // acknowledged: not sent again
  });

  it("a backend that does not have the endpoint yet leaves removals working on this device", async () => {
    respond = () => new ApiClientError(404, "not_found", "no such route");
    expect(await usePickedDismissed.getState().pull()).toBe(false);
    usePickedDismissed.getState().dismiss("tt1");
    await flush();
    expect(usePickedDismissed.getState().ids).toEqual(["tt1"]);
  });
});
