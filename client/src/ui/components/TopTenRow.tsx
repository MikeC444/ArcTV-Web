import { useEffect, useState } from "react";
import { useProviders } from "../../domain/registry";
import type { Content } from "../../domain/types";
import { fetchServiceTitles, viewerRegion } from "../../state/streamingTitles";
import { ContentCard } from "./ContentCard";
import { ScrollRow } from "./ScrollRow";

const COUNT = 10;
/** One answer per service and country for the session, so coming back to the page does not ask again. */
const cache = new Map<string, Content[]>();

/** Movies and series taken in turn (each list is most popular first), so the ten mix both the way a streaming service's own chart does. */
export function topTen(movies: Content[], shows: Content[]): Content[] {
  const out: Content[] = [];
  const seen = new Set<string>();
  for (let i = 0; out.length < COUNT && (i < movies.length || i < shows.length); i++) {
    for (const c of [shows[i], movies[i]]) {
      if (c && !seen.has(c.id) && out.length < COUNT) {
        seen.add(c.id);
        out.push(c);
      }
    }
  }
  return out;
}

/** The row's heading. */
const TOP_TEN_TITLE = "Top 10 Today";

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
 * can't be had (no TMDB key on the server).
 */
export function TopTenRow({ service }: { service: string }) {
  const region = viewerRegion();
  const key = `${service}:${region}`;
  const providerId = useProviders((s) => s.providers.find((p) => p.streamingServices?.().includes(service))?.id ?? null);
  const [items, setItems] = useState<Content[]>(() => cache.get(key) ?? []);

  useEffect(() => {
    const hit = cache.get(key);
    if (hit) {
      setItems(hit);
      return undefined;
    }
    let cancelled = false;
    void Promise.all([fetchServiceTitles(service, "MOVIE", 1, providerId), fetchServiceTitles(service, "TV_SHOW", 1, providerId)]).then(([movies, shows]) => {
      const ten = topTen(movies.items, shows.items);
      if (ten.length === 0) return;
      cache.set(key, ten);
      if (!cancelled) setItems(ten);
    });
    return () => {
      cancelled = true;
    };
  }, [key, service, providerId]);

  if (items.length === 0) return null;
  const title = TOP_TEN_TITLE;
  return (
    <section className="row top10" aria-label={title}>
      <h2 className="row__title" style={{ margin: 0 }}>
        {title}
      </h2>
      <ScrollRow label={title} className="row__scroller hide-scroll top10__scroller" contentKey={items.map((c) => c.id).join(",")} centerOn=".card__surface" role="list">
        {items.map((content, i) => (
          <div role="listitem" key={content.id} className="top10__item" aria-label={`Number ${i + 1}`}>
            <span className="top10__num" aria-hidden="true">
              {i + 1}
            </span>
            <div className="top10__poster">
              <ContentCard content={content} badge={<NetflixN />} />
            </div>
          </div>
        ))}
      </ScrollRow>
    </section>
  );
}
