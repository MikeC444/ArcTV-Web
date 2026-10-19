import { useEffect, useRef, useState } from "react";
import { isBlocked } from "../../domain/blockedGenres";
import { loadDetails } from "../../domain/detailSource";
import { activeProviders, useProviders } from "../../domain/registry";
import type { Content } from "../../domain/types";
import { useBlockedSet } from "../../state/blockedGenres";
import { fetchServiceTitles, viewerRegion } from "../../state/streamingTitles";
import { ContentCard } from "./ContentCard";
import { ScrollRow } from "./ScrollRow";
import { Shimmer } from "./Skeletons";

const COUNT = 10;
/** One answer per service, country and set of blocked genres for the session, so coming back to the page does not ask again. */
const cache = new Map<string, Content[]>();
/** How many candidates are looked at when some are blocked (the ten shown come from the first few that are left). */
const POOL = 30;
const NONE: Content[] = [];

/** Movies and series taken in turn (each list is most popular first), so the ranking mixes both the way a streaming service's own chart does. */
function rankedPool(movies: Content[], shows: Content[], limit: number): Content[] {
  const out: Content[] = [];
  const seen = new Set<string>();
  for (let i = 0; out.length < limit && (i < movies.length || i < shows.length); i++) {
    for (const c of [shows[i], movies[i]]) {
      if (c && !seen.has(c.id) && out.length < limit) {
        seen.add(c.id);
        out.push(c);
      }
    }
  }
  return out;
}

export const topTen = (movies: Content[], shows: Content[]): Content[] => rankedPool(movies, shows, COUNT);

/**
 * The first `count` of `pool` (in order) that carry none of the blocked genres. TMDB's list has no genres, so each candidate's are looked up (a chunk
 * at a time, `count` at once); a title whose genres can't be found is kept, as everywhere else a title with no genres is.
 */
export async function pickUnblocked(pool: Content[], blocked: ReadonlySet<string>, genresOf: (c: Content) => Promise<Content["genres"] | null>, count: number): Promise<Content[]> {
  const out: Content[] = [];
  for (let at = 0; at < pool.length && out.length < count; at += count) {
    const chunk = pool.slice(at, at + count);
    const genres = await Promise.all(chunk.map((c) => genresOf(c).catch(() => null)));
    chunk.forEach((c, i) => {
      if (out.length < count && !isBlocked({ genres: genres[i] ?? c.genres }, blocked)) out.push(c);
    });
  }
  return out;
}

/** The row's heading. */
const TOP_TEN_TITLE = "Top 10 Today";

/**
 * The big outlined rank behind a poster. Drawn as SVG text (not CSS text-stroke, which some browsers drop) and stretched to a set width, so the number
 * is there at any font and size; its colours come from `.top10__num` in `components.css`.
 */
function RankNumber({ rank }: { rank: number }) {
  const width = String(rank).length * 56 + 6;
  return (
    <svg className="top10__num" viewBox={`0 0 ${width} 80`} aria-hidden="true" focusable="false">
      <text x="3" y="76" fontSize="100" textLength={width - 6} lengthAdjust="spacingAndGlyphs">
        {rank}
      </text>
    </svg>
  );
}

/** The service's red N, drawn as three bars, on the corner of each poster. */
export function NetflixN() {
  return (
    <svg className="top10__badge" viewBox="0 0 24 40" aria-hidden="true" focusable="false">
      <rect x="0" y="0" width="8" height="40" fill="#e50914" />
      <rect x="16" y="0" width="8" height="40" fill="#e50914" />
      <polygon points="0,0 8,0 24,40 16,40" fill="#b1060f" />
    </svg>
  );
}

/**
 * Netflix's page opens with its ten most popular titles in the viewer's country: a big outlined number tucked behind each poster. The order is TMDB's
 * popularity for the service (the same list the page carries on with), not Netflix's own chart. Nothing is shown until the list arrives, or when it
 * can't be had (no TMDB key on the server). `onTitles` is told which titles it shows. Titles with a genre the person has blocked are left out (their genres are looked up, as TMDB sends none).
 */
export function TopTenRow({ service, onTitles }: { service: string; onTitles?: (ids: Set<string> | null) => void }) {
  const region = viewerRegion();
  const blocked = useBlockedSet();
  const key = `${service}:${region}:${[...blocked].sort().join(",")}`;
  const providerId = useProviders((s) => s.providers.find((p) => p.streamingServices?.().includes(service))?.id ?? null);
  const [shown, setShown] = useState<{ key: string; items: Content[]; done: boolean }>(() => ({ key, items: cache.get(key) ?? [], done: cache.has(key) }));
  // never show what was fetched for other blocked genres
  const items = shown.key === key ? shown.items : (cache.get(key) ?? NONE);
  const done = shown.key === key ? shown.done : cache.has(key);

  useEffect(() => {
    const hit = cache.get(key);
    if (hit) {
      setShown({ key, items: hit, done: true });
      return undefined;
    }
    let cancelled = false;
    void Promise.all([fetchServiceTitles(service, "MOVIE", 1, providerId), fetchServiceTitles(service, "TV_SHOW", 1, providerId)]).then(async ([movies, shows]) => {
      const ten =
        blocked.size === 0 || !providerId
          ? topTen(movies.items, shows.items)
          : await pickUnblocked(rankedPool(movies.items, shows.items, POOL), blocked, (c) => loadDetails(activeProviders(), providerId, c.type, c.id).then((d) => d?.genres ?? null), COUNT);
      if (ten.length > 0) cache.set(key, ten);
      if (!cancelled) setShown({ key, items: ten, done: true }); // nothing to show (no list for this service) leaves the row out
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, service, providerId]);

  const onTitlesRef = useRef(onTitles);
  onTitlesRef.current = onTitles;
  // tell the page which titles the row shows, so it can leave them out of what is listed below
  // (null while the list is still on its way)
  useEffect(() => onTitlesRef.current?.(done ? new Set(items.map((c) => c.id)) : null), [items, done]);

  const title = TOP_TEN_TITLE;
  // while the list is on its way: the heading, and grey posters with their numbers
  if (items.length === 0 && !done)
    return (
      <section className="row top10" aria-busy="true" aria-label={title}>
        <h2 className="row__title" style={{ margin: 0 }}>
          {title}
        </h2>
        <div className="row__scroller hide-scroll top10__scroller" aria-hidden="true" style={{ overflow: "hidden" }}>
          {Array.from({ length: COUNT }, (_, i) => (
            <div key={i} className="top10__item">
              <RankNumber rank={i + 1} />
              <div className="top10__poster">
                <Shimmer style={{ aspectRatio: "2 / 3", width: "100%" }} />
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  if (items.length === 0) return null;
  return (
    <section className="row top10" aria-label={title}>
      <h2 className="row__title" style={{ margin: 0 }}>
        {title}
      </h2>
      <ScrollRow label={title} className="row__scroller hide-scroll top10__scroller" contentKey={items.map((c) => c.id).join(",")} centerOn=".card__surface" role="list">
        {items.map((content, i) => (
          <div role="listitem" key={content.id} className="top10__item" aria-label={`Number ${i + 1}`}>
            <RankNumber rank={i + 1} />
            <div className="top10__poster">
              <ContentCard content={content} badge={<NetflixN />} />
            </div>
          </div>
        ))}
      </ScrollRow>
    </section>
  );
}
