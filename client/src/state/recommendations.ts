import { useEffect, useMemo, useRef, useState } from "react";
import { activeProviders } from "../domain/registry";
import { MAX_RESULTS, PICKED_ROW_ID, PICKED_ROW_TITLE, POPULAR_ROW_TITLE } from "../domain/recommend/config";
import { recommend, type Candidate, type EngineResult, type MovieRef } from "../domain/recommend/engine";
import { loadFeaturesCached } from "../domain/recommend/featureCache";
import { collectInteractions, signatureOf, type InteractionInput } from "../domain/recommend/signals";
import type { Content, HomeSection } from "../domain/types";
import { useAuth } from "./auth";
import { useContinueWatching } from "./continueWatching";
import { useFeedback } from "./feedback";
import { useMyList, type SavedListItem } from "./myList";
import { usePickedDismissed } from "./pickedDismissed";
import { useHasPlus } from "./plusAccess";
import { readJson, userKey, writeJson } from "./persist";
import { activeProfileId } from "./profile";

/** What the profile's stored data says, as engine inputs. Rebuilt from the current stores every time, so edits and removals are always reflected. */
export function interactionInputs(list: SavedListItem[], feedback: Record<string, { value: "like" | "dislike"; title: string }>): InteractionInput[] {
  const inputs = new Map<string, InteractionInput>();
  for (const item of list) {
    if (item.type !== "MOVIE") continue;
    inputs.set(item.id, { id: item.id, title: item.title, completed: item.watched === true, inWatchlist: true });
  }
  for (const [id, entry] of Object.entries(feedback)) {
    const base = inputs.get(id) ?? { id, title: entry.title, completed: false, inWatchlist: false };
    inputs.set(id, { ...base, feedback: entry.value });
  }
  return [...inputs.values()];
}

/**
 * Titles that never appear in "Picked for you": ones already finished, already rated either way (a title you liked is one
 * you know, so it is a reason to pick others, not something to be picked itself), and ones in Continue Watching. A title
 * that is only saved to My List is still offered. Titles the user removed from the row by hand are kept out too, without counting as feedback.
 */
export function excludedFromPicks(
  list: SavedListItem[],
  feedback: Record<string, { value: "like" | "dislike"; title: string }>,
  continueWatchingIds: string[],
  dismissedIds: string[] = [],
): Set<string> {
  const ids = new Set<string>();
  for (const i of list) if (i.watched) ids.add(i.id);
  for (const id of Object.keys(feedback)) ids.add(id);
  for (const id of continueWatchingIds) ids.add(id);
  for (const id of dismissedIds) ids.add(id); // removed from the row by hand: kept out of it, but not a taste signal (see pickedDismissed.ts)
  return ids;
}

/** Fixed for one page load and different on the next: a refresh rotates most of the row (domain/recommend/rotation.ts) while browsing stays stable. */
const PAGE_SEED = Math.floor(Math.random() * 0xffffffff);

const shownKey = (userId: string, profileId: string): string => userKey(userId, `picked:shown:${profileId}`);
const previousShownMemo = new Map<string, ReadonlySet<string>>();

/** The ids the previous page load showed (read once per page load, so they don't change as this load's row is rebuilt). Wiped with the account on sign-out. */
export function previousShown(userId: string, profileId: string): ReadonlySet<string> {
  const key = shownKey(userId, profileId);
  let ids = previousShownMemo.get(key);
  if (!ids) {
    ids = new Set(readJson<string[]>(key, []));
    previousShownMemo.set(key, ids);
  }
  return ids;
}

/** Remembers what this load showed, for the next load to move away from. */
export const rememberShown = (userId: string, profileId: string, ids: string[]): void => writeJson(shownKey(userId, profileId), ids);

// ── per-profile result cache ────────────────────────────────────────────────
interface CacheEntry {
  signature: string;
  poolKey: string;
  result: EngineResult;
}
const resultCache = new Map<string, CacheEntry>();
const cacheKey = (userId: string, profileId: string) => `${userId}|${profileId}`;

/** A cached result is only reused while the profile's preference data and the candidate pool are unchanged. */
export function cachedResult(userId: string, profileId: string, signature: string, poolKey: string): EngineResult | null {
  const hit = resultCache.get(cacheKey(userId, profileId));
  return hit && hit.signature === signature && hit.poolKey === poolKey ? hit.result : null;
}
export const storeResult = (userId: string, profileId: string, signature: string, poolKey: string, result: EngineResult): void => {
  resultCache.set(cacheKey(userId, profileId), { signature, poolKey, result });
};
export const clearRecommendationCache = (): void => {
  resultCache.clear();
  previousShownMemo.clear();
};

const toCandidate = (c: Content): Candidate => ({ id: c.id, title: c.title, providerId: c.providerId, genres: c.genres.map((g) => g.name), rating: c.rating });

/** Looks a movie's features up through the addon that listed it (one bounded, cached request). */
async function fetchFeatures(ref: MovieRef) {
  const providers = activeProviders();
  const provider = (ref.providerId ? providers.find((p) => p.id === ref.providerId) : undefined) ?? providers.find((p) => typeof p.getFeatures === "function");
  return provider?.getFeatures ? provider.getFeatures("MOVIE", ref.id) : null;
}

export interface PickedForYou {
  /** The row to show, or null (not Plus, signed out, or nothing to show). */
  section: HomeSection | null;
  mode: "personal" | "popular" | null;
}

/**
 * The "Picked for you" row. Plus-only (hidden preview for now). Recomputed when the profile's feedback, watchlist or finished movies change,
 * or when the candidate pool changes; otherwise served from the per-profile cache.
 */
export function usePickedForYou(pool: Content[] | undefined): PickedForYou {
  const hasPlus = useHasPlus();
  const userId = useAuth((s) => s.user?.id);
  const list = useMyList((s) => s.items);
  const feedback = useFeedback((s) => s.entries);
  const continueWatching = useContinueWatching((s) => s.items);
  const dismissed = usePickedDismissed((s) => s.ids);
  const [result, setResult] = useState<EngineResult | null>(null);
  const generation = useRef(0);

  const movies = useMemo(() => (pool ?? []).filter((c) => c.type === "MOVIE"), [pool]);
  const interactions = useMemo(() => collectInteractions(interactionInputs(list, feedback)), [list, feedback]);
  const signature = useMemo(() => signatureOf(interactions), [interactions]);
  const poolKey = useMemo(() => movies.map((m) => m.id).sort().join(","), [movies]);
  const excludeIds = useMemo(() => excludedFromPicks(list, feedback, continueWatching.map((e) => e.contentId), dismissed), [list, feedback, continueWatching, dismissed]);

  useEffect(() => {
    if (!hasPlus || !userId || movies.length === 0) {
      setResult(null);
      return;
    }
    const profileId = activeProfileId(userId);
    const hit = cachedResult(userId, profileId, signature + "#" + [...excludeIds].sort().join(","), poolKey);
    if (hit) {
      setResult(hit);
      return;
    }
    const gen = ++generation.current;
    const refs = new Map<string, MovieRef>(list.map((i) => [i.id, { id: i.id, providerId: i.providerId }]));
    void recommend({
      interactions,
      excludeIds,
      pool: movies.map(toCandidate),
      seed: PAGE_SEED,
      previousShown: previousShown(userId, profileId),
      interactionRefs: refs,
      loadFeatures: (r, limit) => loadFeaturesCached(r, limit, fetchFeatures),
    })
      .then((res) => {
        if (gen !== generation.current) return;
        storeResult(userId, profileId, signature + "#" + [...excludeIds].sort().join(","), poolKey, res);
        if (res.mode === "personal") rememberShown(userId, profileId, res.items.map((i) => i.id));
        setResult(res);
      })
      .catch(() => gen === generation.current && setResult(null));
  }, [hasPlus, userId, movies, signature, poolKey, interactions, excludeIds, list]);

  return useMemo<PickedForYou>(() => {
    if (!result || result.items.length === 0) return { section: null, mode: null };
    const byId = new Map(movies.map((m) => [m.id, m]));
    const items: Content[] = [];
    for (const pick of result.items) {
      const movie = byId.get(pick.id);
      if (!movie || feedback[movie.id] || dismissed.includes(movie.id)) continue; // a title you rate or remove disappears at once, before any recompute
      items.push({ ...movie, recommendReason: result.mode === "personal" ? pick.reason : null, pickedForYou: true });
    }
    if (items.length === 0) return { section: null, mode: null };
    return { section: { id: PICKED_ROW_ID, title: result.mode === "personal" ? PICKED_ROW_TITLE : POPULAR_ROW_TITLE, style: "STANDARD", items: items.slice(0, MAX_RESULTS) }, mode: result.mode };
  }, [result, movies, feedback, dismissed]);
}
