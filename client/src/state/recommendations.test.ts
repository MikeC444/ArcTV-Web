import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("../lib/api")>()), api: vi.fn(async () => undefined) }));

const { useFeedback } = await import("./feedback");
const { useMyList } = await import("./myList");
const { usePickedDismissed } = await import("./pickedDismissed");
const { cachedResult, storeResult, clearRecommendationCache, interactionInputs, excludedFromPicks, previousShown, rememberShown } = await import("./recommendations");
const { collectInteractions, signatureOf } = await import("../domain/recommend/signals");
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
  it("keeps watched and watchlist distinct, counts TV shows like movies, and lets feedback win", () => {
    const list = [saved("w", true), saved("l", false), { ...saved("s", true), type: "TV_SHOW" as const }, saved("d", true)];
    const out = collectInteractions(interactionInputs(list, { d: { value: "dislike", title: "d" }, x: { value: "like", title: "x" } }));
    const kinds = Object.fromEntries(out.map((i) => [i.id, i.kind]));
    expect(kinds).toEqual({ w: "completed", l: "watchlist", s: "completed", d: "dislike", x: "like" });
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

describe("titles kept out of Picked for you", () => {
  it("excludes finished, liked, disliked and Continue Watching titles, but not ones only saved to My List", () => {
    const list = [
      { id: "saved", type: "MOVIE", title: "Saved", watched: false },
      { id: "done", type: "MOVIE", title: "Done", watched: true },
    ] as Parameters<typeof excludedFromPicks>[0];
    const feedback = { liked: { value: "like" as const, title: "Liked" }, nope: { value: "dislike" as const, title: "Nope" } };
    const ids = excludedFromPicks(list, feedback, ["resume"]);
    expect([...ids].sort()).toEqual(["done", "liked", "nope", "resume"]);
    expect(ids.has("saved")).toBe(false);
  });
});

describe("removing a title from Picked for you by hand", () => {
  it("keeps it out of the row without becoming feedback or changing the taste signature", () => {
    usePickedDismissed.getState().hydrate("u1", "main");
    const list = [{ id: "saved", type: "MOVIE", title: "Saved", watched: false }] as Parameters<typeof excludedFromPicks>[0];
    const before = signatureOf(collectInteractions(interactionInputs(list, {})));
    usePickedDismissed.getState().dismiss("tt9");
    expect(excludedFromPicks(list, {}, [], usePickedDismissed.getState().ids).has("tt9")).toBe(true);
    // the interactions the recommendation is scored from do not know about it at all
    expect(signatureOf(collectInteractions(interactionInputs(list, {})))).toBe(before);
    expect(useFeedback.getState().entries).toEqual({});
  });
  it("is remembered per account and profile, ignores repeats, and can be cleared", () => {
    usePickedDismissed.getState().hydrate("u1", "main");
    usePickedDismissed.getState().dismiss("a");
    usePickedDismissed.getState().dismiss("a");
    expect(usePickedDismissed.getState().ids).toEqual(["a"]);
    usePickedDismissed.getState().hydrate("u1", "main"); // a reload
    expect(usePickedDismissed.getState().ids).toEqual(["a"]);
    usePickedDismissed.getState().hydrate("u2", "main");
    expect(usePickedDismissed.getState().ids).toEqual([]);
    usePickedDismissed.getState().hydrate("u1", "main");
    usePickedDismissed.getState().clear();
    usePickedDismissed.getState().hydrate("u1", "main");
    expect(usePickedDismissed.getState().ids).toEqual([]);
  });
  it("does nothing without a signed-in account", () => {
    usePickedDismissed.getState().reset();
    usePickedDismissed.getState().dismiss("a");
    expect(usePickedDismissed.getState().ids).toEqual([]);
  });
});

describe("what the previous page load showed", () => {
  it("is read once per page load, kept per account and profile, and wiped with the account", () => {
    rememberShown("u1", "main", ["a", "b"]);
    expect([...previousShown("u1", "main")].sort()).toEqual(["a", "b"]);
    rememberShown("u1", "main", ["c"]); // this load's row: the next load will see it, this one keeps the original
    expect([...previousShown("u1", "main")].sort()).toEqual(["a", "b"]);
    expect(previousShown("u2", "main").size).toBe(0);
    clearRecommendationCache();
    expect([...previousShown("u1", "main")]).toEqual(["c"]);
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

describe("TV shows take part in feedback", () => {
  it("a show's rating is stored and synced as a TV_SHOW", () => {
    useFeedback.getState().hydrate("u-tv");
    useFeedback.getState().set({ id: "tt-show", title: "A Show", type: "TV_SHOW", providerId: "p" }, "like");
    expect(useFeedback.getState().entries["tt-show"]?.contentType).toBe("TV_SHOW");
    useFeedback.getState().set({ id: "tt-show", title: "A Show" }, "dislike"); // a later change keeps the type it already had
    expect(useFeedback.getState().entries["tt-show"]?.contentType).toBe("TV_SHOW");
  });
});
