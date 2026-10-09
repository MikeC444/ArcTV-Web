import { beforeEach, describe, expect, it, vi } from "vitest";
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

const { useContinueWatching } = await import("./continueWatching");
const { resetAllStores } = await import("./sync");

const flush = () => new Promise((r) => setTimeout(r, 0));
const dto = (over: Record<string, unknown> = {}) => ({ providerId: "p", contentId: "tt1", contentType: "MOVIE", title: "One", positionMs: 1000, durationMs: 9000, lastWatchedAt: "2026-01-01T00:00:00.000Z", deletedAt: null, ...over });
const progress = { providerId: "p", contentId: "tt1", contentType: "MOVIE" as const, seasonNumber: null, episodeNumber: null, episodeTitle: null, title: "One", posterUrl: null, backdropUrl: null, positionMs: 1_500_000, durationMs: 6_000_000, completed: false };

beforeEach(() => {
  localStorage.clear();
  calls.length = 0;
  respond = (_p, method, body) => (method === "POST" ? { continueWatching: dto({ ...(body as object) }) } : undefined);
  resetAllStores();
  useContinueWatching.getState().hydrate("u1");
});

describe("removing a title from Continue Watching", () => {
  it("takes it out at once and tells the account WITHOUT sending a finished report", async () => {
    useContinueWatching.getState().reportProgress(progress);
    await flush();
    calls.length = 0;
    useContinueWatching.getState().removeEntry("p", "tt1", "MOVIE");
    expect(useContinueWatching.getState().items).toEqual([]); // gone straight away
    await flush();
    expect(calls).toHaveLength(1);
    expect(calls[0]!.method).toBe("DELETE");
    expect(calls[0]!.path).toMatch(/^\/user\/continue-watching\?/);
    expect(calls[0]!.path).toContain("contentId=tt1");
    expect(calls.some((c) => c.path === "/user/watch-progress")).toBe(false); // no "completed" report, so nothing becomes watched
  });

  it("with no saved position left, playing again has nowhere to resume from", async () => {
    useContinueWatching.getState().reportProgress(progress);
    await flush();
    useContinueWatching.getState().removeEntry("p", "tt1", "MOVIE");
    await flush();
    expect(useContinueWatching.getState().findResumePoint("p", "tt1", "MOVIE")).toBeUndefined();
  });

  it("offline: stays hidden, is not brought back by a pull, and is sent when the connection returns", async () => {
    useContinueWatching.getState().reportProgress(progress);
    await flush();
    respond = () => new ApiClientError(0, "network", "offline");
    useContinueWatching.getState().removeEntry("p", "tt1", "MOVIE");
    await flush();
    respond = (_p, method) => (method === "GET" ? { items: [dto()] } : undefined); // the account still lists it
    await useContinueWatching.getState().pull();
    expect(useContinueWatching.getState().items).toEqual([]); // still hidden
    calls.length = 0;
    respond = () => undefined;
    await useContinueWatching.getState().retryPending();
    expect(calls.filter((c) => c.method === "DELETE")).toHaveLength(1);
    calls.length = 0;
    await useContinueWatching.getState().retryPending();
    expect(calls).toHaveLength(0); // sent once
  });

  it("if the account has newer playback of it, that wins and it comes back", async () => {
    useContinueWatching.getState().reportProgress(progress);
    await flush();
    respond = (_p, method) => (method === "DELETE" ? dto({ positionMs: 5000 }) : undefined); // not deleted: a later playback on another device
    useContinueWatching.getState().removeEntry("p", "tt1", "MOVIE");
    await flush();
    expect(useContinueWatching.getState().items.map((e) => e.positionMs)).toEqual([5000]);
  });
});
