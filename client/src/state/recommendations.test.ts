import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("../lib/api")>()), api: vi.fn(async () => undefined) }));

const { useFeedback } = await import("./feedback");
const { useMyList } = await import("./myList");
const { cachedResult, storeResult, clearRecommendationCache, interactionInputs } = await import("./recommendations");
const { collectInteractions, signatureOf } = await import("../domain/recommend/signals");
const { PLUS_EARLY_ACCESS, hasPlusNow } = await import("./plusAccess");
const { resetAllStores } = await import("./sync");

const movie = { id: "tt1", title: "One" };

beforeEach(() => {
  localStorage.clear();
  clearRecommendationCache();
  resetAllStores();
});

describe("feedback store (per profile)", () => {
  it("keeps each profile's feedback separate", () => {
    useFeedback.getState().hydrate("u1", "a");
    useFeedback.getState().set(movie, "like");
    useFeedback.getState().hydrate("u1", "b");
    expect(useFeedback.getState().entries).toEqual({});
    useFeedback.getState().set({ id: "tt2", title: "Two" }, "dislike");
    useFeedback.getState().hydrate("u1", "a");
    expect(Object.keys(useFeedback.getState().entries)).toEqual(["tt1"]);
    useFeedback.getState().hydrate("u2", "a"); // another account never sees it
    expect(useFeedback.getState().entries).toEqual({});
  });
  it("edits replace the earlier feedback and removals delete it; it survives a reload", () => {
    useFeedback.getState().hydrate("u1");
    useFeedback.getState().set(movie, "like");
    useFeedback.getState().set(movie, "dislike");
    expect(useFeedback.getState().entries.tt1!.value).toBe("dislike");
    useFeedback.getState().toggle(movie, "dislike"); // same button again clears it
    expect(useFeedback.getState().entries.tt1).toBeUndefined();
    useFeedback.getState().toggle(movie, "like");
    useFeedback.getState().hydrate("u1"); // reload
    expect(useFeedback.getState().entries.tt1!.value).toBe("like");
  });
  it("writes nothing without a signed-in account", () => {
    useFeedback.getState().set(movie, "like");
    expect(useFeedback.getState().entries).toEqual({});
  });
});

describe("stored data → interactions", () => {
  const saved = (id: string, watched: boolean) => ({ id, type: "MOVIE" as const, title: id, posterUrl: null, backdropUrl: null, year: null, rating: null, providerId: "p", watched, updatedAt: "2026-01-01T00:00:00.000Z" });
  it("keeps watched and watchlist distinct, ignores series, and lets feedback win", () => {
    const list = [saved("w", true), saved("l", false), { ...saved("s", true), type: "TV_SHOW" as const }, saved("d", true)];
    const out = collectInteractions(interactionInputs(list, { d: { value: "dislike", title: "d" }, x: { value: "like", title: "x" } }));
    const kinds = Object.fromEntries(out.map((i) => [i.id, i.kind]));
    expect(kinds).toEqual({ w: "completed", l: "watchlist", d: "dislike", x: "like" });
  });
  it("repeated watched marks do not change the signature (no inflation)", async () => {
    useFeedback.getState().hydrate("u1");
    useMyList.setState({ userId: "u1", items: [saved("w", true)] });
    const once = signatureOf(collectInteractions(interactionInputs(useMyList.getState().items, useFeedback.getState().entries)));
    useMyList.getState().markWatched({ id: "w", type: "MOVIE", title: "w", description: "", posterUrl: null, backdropUrl: null, providerId: "p", genres: [], cast: [], seasons: [], watched: true });
    useMyList.getState().markWatched({ id: "w", type: "MOVIE", title: "w", description: "", posterUrl: null, backdropUrl: null, providerId: "p", genres: [], cast: [], seasons: [], watched: true });
    const again = signatureOf(collectInteractions(interactionInputs(useMyList.getState().items, useFeedback.getState().entries)));
    expect(again).toBe(once);
  });
});

describe("per-profile result cache", () => {
  const result = { mode: "personal" as const, items: [{ id: "a", score: 0.5, reason: null }] };
  it("is reused only while the preference signature and pool are unchanged, and never across profiles", () => {
    storeResult("u1", "a", "sig1", "pool1", result);
    expect(cachedResult("u1", "a", "sig1", "pool1")).toBe(result);
    expect(cachedResult("u1", "a", "sig2", "pool1")).toBeNull(); // preferences changed
    expect(cachedResult("u1", "a", "sig1", "pool2")).toBeNull(); // candidates changed
    expect(cachedResult("u1", "b", "sig1", "pool1")).toBeNull(); // other profile
    expect(cachedResult("u2", "a", "sig1", "pool1")).toBeNull(); // other account
  });
  it("is dropped on sign-out", () => {
    storeResult("u1", "a", "sig1", "pool1", result);
    resetAllStores();
    expect(cachedResult("u1", "a", "sig1", "pool1")).toBeNull();
  });
});

describe("ArcTV Plus early access", () => {
  it("is on for everyone while Plus is in early access, with no private query flag", () => {
    expect(PLUS_EARLY_ACCESS).toBe(true);
    expect(hasPlusNow()).toBe(true);
  });
});
