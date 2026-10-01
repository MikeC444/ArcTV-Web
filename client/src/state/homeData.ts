import { useEffect, useMemo, useRef, useState } from "react";
import { applyRowOrder, dedupeRows, withoutShownTitles } from "../domain/homeRows";
import { useProviders } from "../domain/registry";
import type { CatalogProvider } from "../domain/provider";
import { pickHeroTitles } from "../domain/heroPool";
import type { Content, HomeSection } from "../domain/types";
import { distinctBy } from "../lib/format";
import { withoutBlocked } from "../domain/blockedGenres";
import { useBlockedSet } from "./blockedGenres";
import { useAuth } from "./auth";
import { useContinueWatching, type ContinueWatchingEntry } from "./continueWatching";
import { sectionWithWatched, useAddonsReady, useWatchedIds } from "./hooks";
import { readJson, userKey, writeJson } from "./persist";
import { useSettings } from "./settings";

/** HomeViewModel.kt */
const HERO_POOL_SIZE = 10;
const CACHE_MAX_AGE_MS = 7 * 24 * 3600_000;
const CACHE_ITEMS_PER_ROW = 30;
/** A Home row shows this many posters (the Movies / TV Shows pages have the full, scrolling lists). Rendering every title of ~30 rows froze phones for seconds on every visit. */
const HOME_ROW_ITEM_LIMIT = 30;
export const CONTINUE_WATCHING_ROW_ID = "continue_watching";

export type HomeState =
  | { kind: "loading" }
  | { kind: "empty" }
  | { kind: "error"; message: string }
  | { kind: "success"; hero: Content[]; sections: HomeSection[] };

interface HomeCache {
  at: number;
  sections: HomeSection[];
}

/**
 * The hero's titles are chosen once per app launch ("picked fresh each time you launch the app"), not on every visit to Home.
 * They are picked again only if the rows the person has enabled change (Settings → Home Rows) or the rows turn out to come from
 * the offline copy, so a title from a row that has since been switched off never lingers in the hero.
 */
let heroLock: { key: string; titles: Content[] } | null = null;
export const resetHomeSession = (): void => {
  heroLock = null;
};

const entryToContent = (entry: ContinueWatchingEntry): Content => ({
  id: entry.contentId,
  type: entry.contentType,
  title: entry.title,
  description: "",
  posterUrl: entry.posterUrl,
  backdropUrl: entry.backdropUrl,
  providerId: entry.providerId,
  genres: [],
  cast: [],
  seasons: [],
  watched: false,
  watchProgress: { positionMs: entry.positionMs, durationMs: entry.durationMs, seasonNumber: entry.seasonNumber, episodeNumber: entry.episodeNumber, episodeTitle: entry.episodeTitle },
});

function trimForCache(sections: HomeSection[]): HomeSection[] {
  return sections.map((s) => ({
    ...s,
    items: s.items.slice(0, CACHE_ITEMS_PER_ROW).map((c) => ({ ...c, cast: [], seasons: [], description: c.description.slice(0, 280) })),
  }));
}

async function collect(provider: CatalogProvider, onBatch: (batch: HomeSection[]) => void): Promise<boolean> {
  try {
    for await (const batch of provider.getHomeSections()) onBatch(batch);
    return true;
  } catch {
    return false;
  }
}

/** Fetches every provider's home rows progressively, then merges Continue Watching, hidden/ordered rows and watched flags. */
export function useHome(): { state: HomeState; reload(): void; ready: boolean } {
  const providers = useProviders((s) => s.providers);
  const addonsReady = useAddonsReady();
  const userId = useAuth((s) => s.user?.id);
  const prefs = useSettings((s) => s.homeRows);
  const cw = useContinueWatching((s) => s.items);
  const watchedIds = useWatchedIds();
  const blocked = useBlockedSet();

  const [raw, setRaw] = useState<HomeSection[]>([]);
  const [fetched, setFetched] = useState(false);
  const [failed, setFailed] = useState(false);
  const [complete, setComplete] = useState(false); // every addon has finished answering
  const [cacheOnly, setCacheOnly] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);
  const generation = useRef(0);

  // instant paint from the last session's rows
  useEffect(() => {
    if (!userId) return;
    const cache = readJson<HomeCache | null>(userKey(userId, "homeCache"), null);
    if (cache && Date.now() - cache.at < CACHE_MAX_AGE_MS && cache.sections.length) {
      setRaw(cache.sections);
      setFetched(true);
      setCacheOnly(true);
    }
  }, [userId]);

  useEffect(() => {
    const gen = ++generation.current;
    if (!addonsReady) return;
    setComplete(false);
    if (providers.length === 0) {
      if (!cacheOnly) {
        setRaw([]);
        setFetched(true);
        setFailed(false);
      }
      setComplete(true);
      return;
    }
    if (!cacheOnly) setFetched(false);
    const sections: HomeSection[] = [];
    let anyFailed = false;
    let gotBatch = false;
    void Promise.all(
      providers.map(async (provider) => {
        const ok = await collect(provider, (batch) => {
          if (gen !== generation.current) return;
          if (!gotBatch) {
            gotBatch = true;
            sections.length = 0;
            setCacheOnly(false);
          }
          sections.push(...batch);
          setRaw(sections.slice());
          setFetched(true);
        });
        if (!ok) anyFailed = true;
      }),
    ).then(() => {
      if (gen !== generation.current) return;
      setFailed(anyFailed);
      setComplete(true);
      if (sections.length === 0 && !(anyFailed && cacheOnly)) {
        setFetched(true);
        setCacheOnly(false);
        if (!cacheOnly) setRaw([]);
      }
      if (sections.length > 0 && userId) writeJson(userKey(userId, "homeCache"), { at: Date.now(), sections: trimForCache(sections) } satisfies HomeCache);
    });
    // `cacheOnly` intentionally omitted: it only gates the first paint and must not re-trigger the fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providers, reloadTick, userId, addonsReady]);

  const state = useMemo<HomeState>(() => {
    if (!fetched || !addonsReady) return { kind: "loading" };
    const rawSections = blocked.size ? raw.map((s) => ({ ...s, items: withoutBlocked(s.items, blocked) })).filter((s) => s.items.length > 0) : raw;
    const visible = dedupeRows(applyRowOrder(rawSections, prefs).filter((s) => !prefs.hiddenRowIds.includes(s.id))).map((s) => sectionWithWatched(s, watchedIds));
    const cwEntries = withoutShownTitles(cw, visible); // a title that already sits in another row is not repeated under Continue Watching
    const cwSection: HomeSection | null = cwEntries.length ? { id: CONTINUE_WATCHING_ROW_ID, title: "Continue Watching", style: "CONTINUE_WATCHING", items: cwEntries.map(entryToContent).map((c) => (watchedIds.has(c.id) ? { ...c, watched: true } : c)) } : null;
    const shown = visible.map((s) => (s.items.length > HOME_ROW_ITEM_LIMIT ? { ...s, items: s.items.slice(0, HOME_ROW_ITEM_LIMIT) } : s));
    const sections = [...(cwSection ? [cwSection] : []), ...shown];

    const pool = distinctBy(visible.flatMap((s) => s.items), (c) => c.id);
    // The hero: 10 random titles from the rows the person has enabled. Wait until those rows hold at least 10 (or everything has
    // loaded); if they never do, the rest is made up at random from the other rows.
    const lockKey = `${prefs.hiddenRowIds.join("|")}#${cacheOnly}#${[...blocked].join("|")}`;
    if (heroLock && heroLock.key !== lockKey) heroLock = null;
    if (!heroLock && (pool.length >= HERO_POOL_SIZE || complete || cacheOnly)) {
      const backup = distinctBy(rawSections.flatMap((s) => s.items), (c) => c.id);
      const titles = pickHeroTitles(pool, backup, HERO_POOL_SIZE);
      if (titles.length > 0) heroLock = { key: lockKey, titles };
    }
    const hero = (heroLock?.titles ?? []).map((c) => (watchedIds.has(c.id) ? { ...c, watched: true } : c));
    if (hero.length > 0 || sections.length > 0) return { kind: "success", hero, sections };
    if (failed) return { kind: "error", message: "Couldn't reach your installed addons. Check your connection and try again." };
    return { kind: "empty" };
  }, [fetched, addonsReady, raw, prefs, blocked, cw, watchedIds, cacheOnly, failed, complete]);

  return { state, reload: () => setReloadTick((t) => t + 1), ready: fetched && !cacheOnly };
}
