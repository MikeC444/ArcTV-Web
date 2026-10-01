import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "../lib/api";
import { resetMonotonicClock } from "../lib/iso";
import type { Content } from "../domain/types";

// The stores talk to the web server through api(); these tests replace it with a scriptable fake.
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

const { useMyList } = await import("./myList");
const { useContinueWatching } = await import("./continueWatching");
const { useSettings } = await import("./settings");
const { useAddons } = await import("./addons");
const { retryPendingAll, resetAllStores, hydrateAll } = await import("./sync");
const { wipeUser, userKey, readJson } = await import("./persist");
const { useProviders } = await import("../domain/registry");

const movie = (id: string, extra: Partial<Content> = {}): Content => ({ id, type: "MOVIE", title: `Title ${id}`, description: "", posterUrl: "p.jpg", backdropUrl: "b.jpg", year: 2020, rating: 7.5, providerId: "prov", genres: [], cast: [], seasons: [], watched: false, ...extra });
const offline = () => new ApiClientError(0, "network", "offline");
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  localStorage.clear();
  calls.length = 0;
  respond = () => undefined;
  resetMonotonicClock();
  resetAllStores();
});

describe("watched catch-up from history", () => {
  const history = { items: [
    { providerId: "prov", contentId: "tt1", contentType: "MOVIE", title: "One", posterUrl: null, completed: true, watchedAt: "2026-01-01T00:00:00.000Z" },
    { providerId: "prov", contentId: "tt2", contentType: "MOVIE", title: "Two", posterUrl: null, completed: true, watchedAt: "2026-01-02T00:00:00.000Z" },
  ] };
  const answer = (path: string, method: string, body?: unknown) => (path.startsWith("/user/history") ? history : method === "POST" ? body : undefined);

  it("does not put back a title the person removed, and does not run again after sign-out and sign-in", async () => {
    respond = answer;
    hydrateAll("u1");
    await useMyList.getState().backfillWatchedFromHistory();
    expect(useMyList.getState().items.map((i) => i.id).sort()).toEqual(["tt1", "tt2"]);

    useMyList.getState().toggle(movie("tt1")); // removed from My List
    wipeUser("u1"); // what sign-out does
    resetAllStores();
    hydrateAll("u1");
    useMyList.setState({ items: [] });
    await useMyList.getState().backfillWatchedFromHistory(); // second launch after signing back in
    expect(useMyList.getState().items).toHaveLength(0);
  });

  it("skips a dismissed title even on a browser that has not run the catch-up yet", async () => {
    respond = answer;
    hydrateAll("u1");
    useMyList.getState().toggle(movie("tt1"));
    await flush();
    useMyList.getState().toggle(movie("tt1")); // add then remove -> dismissed
    await flush();
    await useMyList.getState().backfillWatchedFromHistory();
    expect(useMyList.getState().items.map((i) => i.id)).toEqual(["tt2"]);
  });
});

describe("My List sync", () => {
  it("adds locally at once and pushes the item with a client timestamp (last-write-wins key)", async () => {
    hydrateAll("u1");
    respond = (_path, method, body) => (method === "POST" ? { ...(body as object), updatedAt: (body as { updatedAt: string }).updatedAt } : undefined);
    useMyList.getState().toggle(movie("tt1"));
    expect(useMyList.getState().items.map((i) => i.id)).toEqual(["tt1"]); // optimistic
    await flush();
    const post = calls.find((c) => c.method === "POST" && c.path === "/user/watchlist")!;
    expect(post.body).toMatchObject({ providerId: "prov", contentId: "tt1", contentType: "MOVIE", title: "Title tt1", watched: false });
    expect(typeof (post.body as { updatedAt: string }).updatedAt).toBe("string");
  });

  it("removing pushes a DELETE keyed by the natural key with a newer timestamp", async () => {
    hydrateAll("u1");
    respond = (_path, method, body) => (method === "POST" ? body : undefined);
    useMyList.getState().toggle(movie("tt1"));
    await flush();
    const addedAt = (calls.find((c) => c.method === "POST")!.body as { updatedAt: string }).updatedAt;
    useMyList.getState().toggle(movie("tt1"));
    expect(useMyList.getState().items).toHaveLength(0);
    await flush();
    const del = calls.find((c) => c.method === "DELETE")!;
    const q = new URLSearchParams(del.path.split("?")[1]);
    expect(q.get("providerId")).toBe("prov");
    expect(q.get("contentId")).toBe("tt1");
    expect(q.get("contentType")).toBe("MOVIE");
    expect(Date.parse(q.get("updatedAt")!)).toBeGreaterThan(Date.parse(addedAt));
  });

  it("queues changes made offline and delivers them when connectivity returns", async () => {
    hydrateAll("u1");
    respond = () => offline();
    useMyList.getState().toggle(movie("tt1"));
    await flush();
    expect(readJson(userKey("u1", "outbox:watchlist"), {})).toHaveProperty("prov|tt1|MOVIE");
    expect(useMyList.getState().items).toHaveLength(1); // still visible locally

    respond = (_path, method, body) => (method === "POST" ? body : undefined);
    calls.length = 0;
    await retryPendingAll();
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(1);
    expect(readJson(userKey("u1", "outbox:watchlist"), {})).toEqual({});
  });

  it("a pull never clobbers a change that hasn't reached the server yet", async () => {
    hydrateAll("u1");
    respond = () => offline();
    useMyList.getState().toggle(movie("tt-new"));
    await flush();
    respond = () => ({ items: [{ providerId: "prov", contentId: "tt-old", contentType: "MOVIE", title: "Old", updatedAt: "2020-01-01T00:00:00.000Z", watched: false }] });
    await useMyList.getState().pull();
    expect(useMyList.getState().items.map((i) => i.id).sort()).toEqual(["tt-new", "tt-old"]);
  });

  it("reconciles with the server's authoritative row when it lost a last-write-wins race", async () => {
    hydrateAll("u1");
    respond = (_path, method, body) => (method === "POST" ? { ...(body as object), watched: true, updatedAt: "2099-01-01T00:00:00.000Z" } : undefined);
    useMyList.getState().toggle(movie("tt1"));
    await flush();
    expect(useMyList.getState().items[0]).toMatchObject({ id: "tt1", watched: true, updatedAt: "2099-01-01T00:00:00.000Z" });
  });

  it("marking a title watched that isn't in the list adds it as watched; toggling twice un-watches", async () => {
    hydrateAll("u1");
    respond = (_path, method, body) => (method === "POST" ? body : undefined);
    useMyList.getState().toggleWatched(movie("tt9"));
    expect(useMyList.getState().items[0]).toMatchObject({ id: "tt9", watched: true });
    useMyList.getState().toggleWatched(movie("tt9"));
    expect(useMyList.getState().items[0]).toMatchObject({ id: "tt9", watched: false });
    useMyList.getState().markWatched(movie("tt9"));
    useMyList.getState().markWatched(movie("tt9")); // idempotent
    await flush();
    expect(useMyList.getState().items).toHaveLength(1);
  });

  it("ignores titles that have no provider (can't be synced)", () => {
    hydrateAll("u1");
    useMyList.getState().toggle(movie("tt1", { providerId: null }));
    expect(useMyList.getState().items).toHaveLength(0);
  });
});

describe("Continue Watching", () => {
  const report = (over: Partial<Parameters<ReturnType<typeof useContinueWatching.getState>["reportProgress"]>[0]> = {}) =>
    useContinueWatching.getState().reportProgress({ providerId: "prov", contentId: "tt1", contentType: "MOVIE", seasonNumber: null, episodeNumber: null, episodeTitle: null, title: "T", posterUrl: null, backdropUrl: null, positionMs: 60_000, durationMs: 600_000, completed: false, ...over });

  it("shows progress immediately, replaces per title, and sends the report", async () => {
    hydrateAll("u1");
    respond = (path, _method, body) => (path === "/user/watch-progress" ? { continueWatching: { ...(body as object), lastWatchedAt: (body as { watchedAt: string }).watchedAt } } : undefined);
    report();
    report({ positionMs: 120_000 });
    expect(useContinueWatching.getState().items).toHaveLength(1);
    expect(useContinueWatching.getState().items[0]!.positionMs).toBe(120_000);
    await flush();
    expect(calls.filter((c) => c.path === "/user/watch-progress")).toHaveLength(2);
  });

  it("completed=true removes the title from the row (Remove from Continue Watching / finished)", async () => {
    hydrateAll("u1");
    respond = () => ({ continueWatching: null });
    report();
    expect(useContinueWatching.getState().items).toHaveLength(1);
    report({ completed: true });
    expect(useContinueWatching.getState().items).toHaveLength(0);
  });

  it("finds the resume point only for the matching title", () => {
    hydrateAll("u1");
    respond = () => ({ continueWatching: null });
    report({ contentId: "a" });
    expect(useContinueWatching.getState().findResumePoint("prov", "a", "MOVIE")?.positionMs).toBe(60_000);
    expect(useContinueWatching.getState().findResumePoint("prov", "b", "MOVIE")).toBeUndefined();
    expect(useContinueWatching.getState().findResumePoint("other", "a", "MOVIE")).toBeUndefined();
  });

  it("keeps an unsent report in the outbox while offline", async () => {
    hydrateAll("u1");
    respond = () => offline();
    report();
    await flush();
    expect(Object.keys(readJson(userKey("u1", "outbox:continueWatching"), {}))).toEqual(["prov|tt1|MOVIE"]);
  });

  it("pull orders most-recent first", async () => {
    hydrateAll("u1");
    respond = () => ({
      items: [
        { providerId: "p", contentId: "old", contentType: "MOVIE", title: "Old", positionMs: 1, durationMs: 2, lastWatchedAt: "2024-01-01T00:00:00.000Z" },
        { providerId: "p", contentId: "new", contentType: "MOVIE", title: "New", positionMs: 1, durationMs: 2, lastWatchedAt: "2025-01-01T00:00:00.000Z" },
      ],
    });
    await useContinueWatching.getState().pull();
    expect(useContinueWatching.getState().items.map((e) => e.contentId)).toEqual(["new", "old"]);
  });
});

describe("Settings sync", () => {
  it("pushes the whole record with a fresh updatedAt on every change", async () => {
    hydrateAll("u1");
    respond = (_path, method, body) => (method === "PUT" ? body : undefined);
    useSettings.getState().setPlayer({ defaultSubtitleLanguage: "fr" });
    useSettings.getState().setRowHidden("row-1", true);
    await flush();
    const puts = calls.filter((c) => c.method === "PUT");
    expect(puts).toHaveLength(2);
    expect(puts[1]!.body).toMatchObject({ defaultSubtitleLanguage: "fr", hiddenRowIds: ["row-1"], autoplayNextEpisode: true, subtitlesEnabled: true });
    expect(Date.parse((puts[1]!.body as { updatedAt: string }).updatedAt)).toBeGreaterThan(Date.parse((puts[0]!.body as { updatedAt: string }).updatedAt));
  });

  it("applies the account's settings on pull", async () => {
    hydrateAll("u1");
    respond = () => ({ homeRowOrder: ["b", "a"], hiddenRowIds: ["x"], autoplayNextEpisode: false, skipIntroEnabled: false, subtitlesEnabled: false, defaultSubtitleLanguage: "es", updatedAt: "2025-05-05T00:00:00.000Z" });
    const result = await useSettings.getState().pull();
    expect(result).toEqual({ ok: true, empty: false });
    expect(useSettings.getState().homeRows).toEqual({ order: ["b", "a"], hiddenRowIds: ["x"] });
    expect(useSettings.getState().player).toEqual({ autoplayNextEpisode: false, skipIntroEnabled: false, subtitlesEnabled: false, defaultSubtitleLanguage: "es" });
  });

  it("recognises an account that has never saved settings", async () => {
    hydrateAll("u1");
    respond = () => ({ homeRowOrder: [], hiddenRowIds: [], autoplayNextEpisode: true, skipIntroEnabled: true, subtitlesEnabled: true, defaultSubtitleLanguage: null, updatedAt: null });
    expect(await useSettings.getState().pull()).toEqual({ ok: true, empty: true });
  });

  it("does not overwrite a pending local change with older cloud data", async () => {
    hydrateAll("u1");
    respond = () => offline();
    useSettings.getState().setPlayer({ autoplayNextEpisode: false });
    await flush();
    respond = () => ({ homeRowOrder: [], hiddenRowIds: [], autoplayNextEpisode: true, skipIntroEnabled: true, subtitlesEnabled: true, defaultSubtitleLanguage: null, updatedAt: "2000-01-01T00:00:00.000Z" });
    await useSettings.getState().pull();
    expect(useSettings.getState().player.autoplayNextEpisode).toBe(false);
  });

  it("keeps the navigation volume on this device only (never sent to the account)", async () => {
    hydrateAll("u1");
    respond = () => undefined;
    useSettings.getState().setNavigationVolume(0.2);
    await flush();
    expect(calls).toHaveLength(0);
    expect(useSettings.getState().navigationVolume).toBe(0.2);
  });
});

describe("Addons", () => {
  const cinemeta = { id: "com.linvo.cinemeta", name: "Cinemeta", version: "3.0.14", types: ["movie", "series"], catalogs: [{ type: "movie", id: "top", extra: [{ name: "genre", options: ["Action"] }] }] };

  it("round-trips the addon manifest exactly as stored in the cloud", async () => {
    hydrateAll("u1");
    respond = () => ({ items: [{ manifestUrl: "https://a.example/manifest.json", addonId: cinemeta.id, name: cinemeta.name, manifestJson: { ...cinemeta, futureField: { keep: "me" } }, enabled: true, sortOrder: 0, updatedAt: "2025-01-01T00:00:00.000Z" }] });
    expect(await useAddons.getState().pull()).toEqual({ ok: true, empty: false });
    expect(useProviders.getState().providers.map((p) => p.id)).toEqual(["com.linvo.cinemeta"]);
    respond = (_path, method, body) => (method === "POST" ? body : undefined);
    calls.length = 0;
    useAddons.getState().setEnabled("https://a.example/manifest.json", false);
    await flush();
    const posted = calls.find((c) => c.method === "POST")!.body as { manifestJson: Record<string, unknown>; enabled: boolean };
    expect(posted.enabled).toBe(false);
    expect(posted.manifestJson.futureField).toEqual({ keep: "me" }); // nothing an addon declares is lost
    expect(useProviders.getState().providers).toHaveLength(0); // disabled addons stop contributing catalogs
  });

  it("removes an addon locally and via DELETE", async () => {
    hydrateAll("u1");
    respond = () => ({ items: [{ manifestUrl: "https://a.example/manifest.json", addonId: "x", name: "X", manifestJson: { id: "x", name: "X" }, enabled: true, sortOrder: 0, updatedAt: "2025-01-01T00:00:00.000Z" }] });
    await useAddons.getState().pull();
    respond = () => undefined;
    calls.length = 0;
    useAddons.getState().remove("https://a.example/manifest.json");
    expect(useAddons.getState().addons).toHaveLength(0);
    await flush();
    expect(calls[0]!.method).toBe("DELETE");
    expect(new URLSearchParams(calls[0]!.path.split("?")[1]).get("manifestUrl")).toBe("https://a.example/manifest.json");
  });

  it("bootstraps the default addon only once, only when the list is empty", async () => {
    hydrateAll("u1");
    respond = (_path, method, body) => (method === "POST" ? body : undefined);
    useAddons.getState().bootstrapDefault();
    expect(useAddons.getState().addons.map((a) => a.manifest.id)).toEqual(["com.linvo.cinemeta"]);
    await flush();
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(1);
    useAddons.getState().remove("https://v3-cinemeta.strem.io/manifest.json");
    useAddons.getState().bootstrapDefault(); // user removed it on purpose → don't bring it back
    expect(useAddons.getState().addons).toHaveLength(0);
  });
});

describe("account isolation in the browser", () => {
  it("one user's cache and queued writes are never visible to — or pushed as — another user", async () => {
    hydrateAll("alice");
    respond = () => offline();
    useMyList.getState().toggle(movie("alice-secret"));
    await flush();
    expect(useMyList.getState().items).toHaveLength(1);

    resetAllStores();
    hydrateAll("bob");
    expect(useMyList.getState().items).toEqual([]);
    respond = (_path, method, body) => (method === "POST" ? body : undefined);
    calls.length = 0;
    await retryPendingAll();
    expect(calls).toHaveLength(0); // Alice's queued write is not replayed under Bob's session

    resetAllStores();
    hydrateAll("alice");
    expect(useMyList.getState().items.map((i) => i.id)).toEqual(["alice-secret"]); // she still has it
    await retryPendingAll();
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(1); // …and it is delivered when SHE is signed in
  });

  it("explicit sign-out wipes that user's data from the browser", () => {
    hydrateAll("alice");
    useMyList.getState().toggle(movie("x"));
    useSettings.getState().setPlayer({ autoplayNextEpisode: false });
    expect(Object.keys(localStorage).some((k) => k.startsWith("mtv:v1:alice:"))).toBe(true);
    wipeUser("alice");
    expect(Object.keys(localStorage).filter((k) => k.startsWith("mtv:v1:alice:"))).toEqual([]);
  });
});
