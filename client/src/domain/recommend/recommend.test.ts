import { beforeEach, describe, expect, it } from "vitest";
import { CATEGORY_WEIGHTS, MIN_INTERACTIONS_FOR_PERSONALISATION, SIGNAL_WEIGHTS } from "./config";
import { recommend, type Candidate, type FeatureLoader } from "./engine";
import { explainCandidate } from "./explain";
import { featuresFromMeta, type Features } from "./features";
import { buildPreferences } from "./preferences";
import { cosine, scoreCandidate } from "./score";
import { collectInteractions, interactionOf, signatureOf, type InteractionInput } from "./signals";

const f = (genres: string[], directors: string[] = [], cast: string[] = []): Features => ({ genres, directors, cast });

// A small catalogue with real-looking metadata. Titles are only labels.
const META: Record<string, Features> = {
  heist1: f(["crime", "thriller"], ["nolan"], ["a", "b"]),
  space1: f(["sci-fi", "adventure"], ["villeneuve"], ["c", "d"]),
  rom1: f(["romance", "comedy"], ["ephron"], ["e", "f"]),
  heist2: f(["crime", "thriller"], ["nolan"], ["a", "g"]),
  heist3: f(["crime", "action"], ["mann"], ["h"]),
  space2: f(["sci-fi", "drama"], ["villeneuve"], ["c", "i"]),
  space3: f(["sci-fi", "adventure"], ["scott"], ["j"]),
  rom2: f(["romance", "drama"], ["ephron"], ["e", "k"]),
  rom3: f(["romance", "comedy"], ["curtis"], ["l"]),
  nometa: f([]),
};
const pool: Candidate[] = ["heist2", "heist3", "space2", "space3", "rom2", "rom3", "nometa"].map((id) => ({ id, title: id, genres: META[id]!.genres, rating: 7 }));
const loader: FeatureLoader = async (refs) => new Map(refs.map((r) => [r.id, META[r.id] ?? null]));
const input = (id: string, extra: Partial<InteractionInput> = {}): InteractionInput => ({ id, title: id, completed: false, inWatchlist: false, ...extra });
const run = (inputs: InteractionInput[], excludeIds: string[] = [], candidates: Candidate[] = pool) =>
  recommend({ interactions: collectInteractions(inputs), excludeIds: new Set(excludeIds), pool: candidates, interactionRefs: new Map(), loadFeatures: loader });
const ids = (r: { items: Array<{ id: string }> }) => r.items.map((i) => i.id);

describe("signals", () => {
  it("uses the configured weights, strongest applicable signal per movie", () => {
    expect(interactionOf(input("x", { feedback: "like" }))?.weight).toBe(SIGNAL_WEIGHTS.like);
    expect(interactionOf(input("x", { completed: true }))?.weight).toBe(SIGNAL_WEIGHTS.completed);
    expect(interactionOf(input("x", { inWatchlist: true }))?.weight).toBe(SIGNAL_WEIGHTS.watchlist);
    expect(interactionOf(input("x", { completed: true, inWatchlist: true }))?.kind).toBe("completed");
    expect(interactionOf(input("x"))).toBeNull(); // merely opening a page / starting playback leaves no signal
  });
  it("explicit feedback overrides finishing and saving: a disliked movie stays negative", () => {
    const i = interactionOf(input("x", { feedback: "dislike", completed: true, inWatchlist: true }))!;
    expect(i.kind).toBe("dislike");
    expect(i.weight).toBe(-5);
    expect(interactionOf(input("y", { feedback: "like", completed: false, inWatchlist: false }))?.weight).toBe(5);
  });
  it("is rebuilt from stored facts, so repeated progress updates cannot inflate it", () => {
    // the same finished movie reported ten times is still one stored fact
    const once = collectInteractions([input("heist1", { completed: true })]);
    const many = collectInteractions(Array.from({ length: 10 }, () => input("heist1", { completed: true })));
    expect(many).toEqual(once);
    expect(many[0]!.weight).toBe(SIGNAL_WEIGHTS.completed);
  });
});

describe("preferences and score", () => {
  it("splits a movie's weight equally among its unique features per category", () => {
    const prefs = buildPreferences(collectInteractions([input("heist1", { feedback: "like" })]), new Map([["heist1", META.heist1!]]));
    expect(prefs.genre.get("crime")).toBeCloseTo(2.5); // 5 / 2 genres
    expect(prefs.director.get("nolan")).toBeCloseTo(5);
    expect(prefs.cast.get("a")).toBeCloseTo(2.5); // 5 / 2 cast
  });
  it("a long cast list does not outweigh a short one", () => {
    const longCast = f(["drama"], [], ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"]);
    const prefs = buildPreferences(collectInteractions([input("L", { feedback: "like" })]), new Map([["L", longCast]]));
    const total = [...prefs.cast.values()].reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(5);
  });
  it("cosine keeps negative preferences negative", () => {
    const prefs = buildPreferences(collectInteractions([input("heist1", { feedback: "dislike" })]), new Map([["heist1", META.heist1!]]));
    expect(scoreCandidate(META.heist2!, prefs)!.score).toBeLessThan(0);
    expect(cosine(new Map([["x", 1]]), new Map([["x", -2]]))).toBeCloseTo(-1);
  });
  it("combines categories with the configured weights and renormalises when one is missing", () => {
    const prefs = buildPreferences(collectInteractions([input("heist1", { feedback: "like" })]), new Map([["heist1", META.heist1!]]));
    const full = scoreCandidate(META.heist2!, prefs)!;
    const expected = (CATEGORY_WEIGHTS.genre * full.categories.genre! + CATEGORY_WEIGHTS.director * full.categories.director! + CATEGORY_WEIGHTS.cast * full.categories.cast!) / (CATEGORY_WEIGHTS.genre + CATEGORY_WEIGHTS.director + CATEGORY_WEIGHTS.cast);
    expect(full.score).toBeCloseTo(expected);
    const genreOnly = scoreCandidate(f(["crime", "thriller"]), prefs)!;
    expect(Object.keys(genreOnly.categories)).toEqual(["genre"]);
    expect(genreOnly.score).toBeCloseTo(genreOnly.categories.genre!); // weight renormalised to 100 %
  });
  it("handles missing metadata and empty preference vectors", () => {
    const prefs = buildPreferences(collectInteractions([input("heist1", { feedback: "like" })]), new Map([["heist1", META.heist1!]]));
    expect(scoreCandidate(null, prefs)).toBeNull();
    expect(scoreCandidate(f([]), prefs)).toBeNull(); // nothing comparable → unscored
    const empty = buildPreferences(collectInteractions([input("nometa", { feedback: "like" })]), new Map([["nometa", META.nometa!]]));
    expect(scoreCandidate(META.heist2!, empty)).toBeNull(); // no nonzero profile vector
    const noGenreNoCast = scoreCandidate(f([], ["nolan"]), prefs)!;
    expect(Object.keys(noGenreNoCast.categories)).toEqual(["director"]);
  });
  it("normalises Cinemeta fields (genres, director, cast, app_extras.cast)", () => {
    const features = featuresFromMeta({ genres: ["Sci-Fi", " sci-fi "], director: ["Denis  Villeneuve"], cast: ["Zendaya"], app_extras: { cast: [{ name: "Zendaya" }, { name: "Timothée Chalamet" }, { name: null }] } });
    expect(features).toEqual({ genres: ["sci-fi"], directors: ["denis villeneuve"], cast: ["zendaya", "timothée chalamet"] });
    expect(featuresFromMeta({})).toEqual({ genres: [], directors: [], cast: [] });
  });
});

describe("recommend()", () => {
  const sciFiFan3 = [input("space1", { feedback: "like" }), input("space2", { feedback: "like" }), input("heist1", { inWatchlist: true })];
  const romFan = [input("rom1", { feedback: "like" }), input("rom2", { feedback: "like" }), input("heist1", { inWatchlist: true })];

  it("ranks the same catalogue differently for different profiles", async () => {
    const a = await run(sciFiFan3, ["space2"]);
    const b = await run(romFan, ["rom2"]);
    expect(a.mode).toBe("personal");
    expect(b.mode).toBe("personal");
    expect(ids(a)[0]).toBe("space3");
    expect(ids(b)[0]).toBe("rom3");
    expect(ids(a)).not.toEqual(ids(b));
  });
  it("is deterministic", async () => {
    expect(ids(await run(sciFiFan3, ["space2"]))).toEqual(ids(await run(sciFiFan3, ["space2"])));
  });
  it("never returns excluded titles (finished, disliked, dismissed, in Continue Watching) but still offers watchlisted ones", async () => {
    const r = await run(sciFiFan3, ["space3", "heist2"]);
    expect(ids(r)).not.toContain("space3");
    expect(ids(r)).not.toContain("heist2");
    const withWatchlisted = await run([...sciFiFan3, input("rom3", { inWatchlist: true })], []);
    expect(ids(withWatchlisted)).toContain("rom3"); // a watchlist entry alone is not "watched"
  });
  it("a Not-for-me title drops out and pushes down what resembles it", async () => {
    const liked = await run([...romFan, input("heist1", { feedback: "like" })]);
    const disliked = await run([...romFan, input("heist1", { feedback: "dislike" })]);
    const rank = (r: { items: Array<{ id: string }> }, id: string) => ids(r).indexOf(id);
    expect(rank(disliked, "heist2")).toBeGreaterThan(rank(liked, "heist2"));
    expect(disliked.mode === "personal" && disliked.items.find((i) => i.id === "heist2")!.score!).toBeLessThan(0);
  });
  it("explanations come from real positive contributions", async () => {
    const r = await run(sciFiFan3, ["space2"]);
    const top = r.items[0]!;
    expect(top.reason).toMatch(/^Because you liked space[12]$/);
    const prefs = buildPreferences(collectInteractions(sciFiFan3), new Map(Object.entries(META)));
    expect(explainCandidate(f(["western"]), prefs)).toBeNull(); // nothing positive matched → no invented reason
  });
  it("cold start: too little history gives the labelled popular fallback (no scores, no reasons)", async () => {
    expect(MIN_INTERACTIONS_FOR_PERSONALISATION).toBe(3);
    const r = await run([input("space1", { feedback: "like" }), input("rom1", { inWatchlist: true })]);
    expect(r.mode).toBe("popular");
    expect(r.items.every((i) => i.score === null && i.reason === null)).toBe(true);
    expect(await run([])).toMatchObject({ mode: "popular" });
    const onlyNegative = await run([input("space1", { feedback: "dislike" }), input("rom1", { feedback: "dislike" }), input("heist1", { feedback: "dislike" })]);
    expect(onlyNegative.mode).toBe("popular");
  });
  it("falls back when nothing can be scored (no metadata anywhere)", async () => {
    const blind = (await recommend({ interactions: collectInteractions(sciFiFan3), excludeIds: new Set(), pool: [{ id: "x", title: "x", genres: [], rating: 5 }], interactionRefs: new Map(), loadFeatures: async () => new Map() })).mode;
    expect(blind).toBe("popular");
  });
  it("returns at most 20 and bounds how many candidates get a detail lookup", async () => {
    const big: Candidate[] = Array.from({ length: 300 }, (_, i) => ({ id: `m${i}`, title: `m${i}`, genres: ["sci-fi"], rating: 5 }));
    let looked = 0;
    const counting: FeatureLoader = async (refs, limit) => {
      looked = Math.max(looked, Math.min(limit, refs.length));
      return new Map(refs.map((r) => [r.id, META[r.id] ?? f(["sci-fi"])]));
    };
    const r = await recommend({ interactions: collectInteractions(sciFiFan3), excludeIds: new Set(), pool: big, interactionRefs: new Map(), loadFeatures: counting });
    expect(r.items.length).toBeLessThanOrEqual(20);
    expect(looked).toBeLessThanOrEqual(60);
  });
  it("popular fallback skips excluded titles and duplicates", async () => {
    const r = await run([], ["heist2"], [...pool, pool[0]!]);
    expect(ids(r)).not.toContain("heist2");
    expect(new Set(ids(r)).size).toBe(ids(r).length);
  });
});

describe("cache signature (invalidation)", () => {
  it("changes exactly when feedback, completion or watchlist change", () => {
    const base = [input("a", { feedback: "like" }), input("b", { inWatchlist: true })];
    const sig = signatureOf(collectInteractions(base));
    expect(signatureOf(collectInteractions(base))).toBe(sig);
    expect(signatureOf(collectInteractions([input("a", { feedback: "dislike" }), input("b", { inWatchlist: true })]))).not.toBe(sig); // edit
    expect(signatureOf(collectInteractions([input("a", { feedback: "like" })]))).not.toBe(sig); // removal
    expect(signatureOf(collectInteractions([...base, input("c", { completed: true })]))).not.toBe(sig); // new completion
    expect(signatureOf(collectInteractions([input("a", { feedback: "like", completed: true }), input("b", { inWatchlist: true })]))).toBe(sig); // finishing a liked movie changes nothing
  });
  beforeEach(() => undefined);
});
