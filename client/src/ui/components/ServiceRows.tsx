import { useEffect, useRef } from "react";
import type { Content, HomeSection } from "../../domain/types";
import { ContentRow } from "./ContentRow";
import { NetflixN } from "./TopTenRow";

const ROW_MIN = 6; // a row with fewer titles than this is not worth a heading
const ROW_MAX = 40;
const GENRE_ROWS = 8;

/**
 * The rows under a streaming service's Top 10: the titles its page has loaded so far, sorted into "Popular" (the addon's own order), "Top Rated",
 * Movies, TV Shows and then one row per genre the titles carry (the biggest first). A title can sit in several rows. Rows too short to bother with are left out.
 */
export function serviceRows(items: Content[]): HomeSection[] {
  const rows: HomeSection[] = [];
  const add = (id: string, title: string, list: Content[]) => {
    if (list.length >= ROW_MIN) rows.push({ id, title, items: list.slice(0, ROW_MAX), style: "STANDARD" });
  };
  add("popular", "Popular", items);
  add("top-rated", "Top Rated", items.filter((c) => c.rating != null).sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0)));
  add("movies", "Movies", items.filter((c) => c.type === "MOVIE"));
  add("shows", "TV Shows", items.filter((c) => c.type === "TV_SHOW"));
  const byGenre = new Map<string, Content[]>();
  for (const c of items) for (const g of c.genres) byGenre.set(g.name, [...(byGenre.get(g.name) ?? []), c]);
  [...byGenre].sort((a, b) => b[1].length - a[1].length).slice(0, GENRE_ROWS).forEach(([name, list]) => add(`genre-${name}`, name, list));
  return rows;
}

/** Tightly packed poster rows in the streaming-service style (small gaps, no captions, the service's N on each poster); more titles load as the page is scrolled to its end. */
export function ServiceRows({ items, onLoadMore }: { items: Content[]; onLoadMore?: () => void }) {
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !onLoadMore) return;
    const observer = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && onLoadMore(), { rootMargin: "600px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, [onLoadMore, items.length]);
  return (
    <div className="nfrows">
      {serviceRows(items).map((section) => (
        <ContentRow key={section.id} section={section} badge={<NetflixN />} />
      ))}
      <div ref={sentinel} style={{ height: 1 }} aria-hidden="true" />
      <div style={{ height: "calc(48 * var(--dp))" }} />
    </div>
  );
}
