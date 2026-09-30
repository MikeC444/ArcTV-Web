import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { MdExtension } from "react-icons/md";
import { useNavigate } from "react-router-dom";
import { activeProviders, useProviders } from "../../domain/registry";
import type { Content, ContentType } from "../../domain/types";
import { distinctBy, interleave, shuffled } from "../../lib/format";
import { routes } from "../../lib/routes";
import { useWatchedIds, withWatched } from "../../state/hooks";
import { useMyList, type SavedListItem } from "../../state/myList";
import { Pill } from "../components/Buttons";
import { ContentCard } from "../components/ContentCard";
import { GridSkeleton } from "../components/Skeletons";
import { EmptyState, FullScreenError } from "../components/States";

type SortMode = "FEATURED" | "HIGHEST_RATED" | "NEWEST";
const SORTS: Array<{ id: SortMode; label: string }> = [
  { id: "FEATURED", label: "Featured" },
  { id: "HIGHEST_RATED", label: "Highest Rated" },
  { id: "NEWEST", label: "Newest" },
];

export const sortContent = (items: Content[], sort: SortMode): Content[] =>
  sort === "FEATURED" ? items : items.slice().sort((a, b) => (sort === "HIGHEST_RATED" ? (b.rating ?? -1) - (a.rating ?? -1) : (b.year ?? -1) - (a.year ?? -1)));

interface Pager {
  items: Content[];
  status: "loading" | "loaded" | "error";
  loadMore(): void;
  retry(): void;
}

/** TypeBrowseViewModel / GenreResultsViewModel — first page from every provider, then "skip" pages as you scroll. */
function usePager(kind: { type: "type"; value: ContentType } | { type: "genre"; value: string }): Pager {
  const providers = useProviders((s) => s.providers);
  const [items, setItems] = useState<Content[]>([]);
  const [status, setStatus] = useState<Pager["status"]>("loading");
  const [tick, setTick] = useState(0);
  const state = useRef({ page: 1, hasMore: true, loading: false, seen: new Set<string>(), gen: 0 });
  const kindKey = `${kind.type}:${kind.value}`;

  useEffect(() => {
    const s = state.current;
    const gen = ++s.gen;
    s.page = 1;
    s.hasMore = true;
    s.loading = false;
    s.seen = new Set();
    setItems([]);
    if (providers.length === 0) {
      setStatus("loaded");
      return;
    }
    setStatus("loading");
    void (async () => {
      const results = await Promise.all(
        providers.map(async (provider) => {
          try {
            if (kind.type === "type") return { ok: true as const, items: (await provider.getSectionsByType(kind.value)).flatMap((sec) => sec.items) };
            return { ok: true as const, items: (await provider.getGenreSection(kind.value))?.items ?? [] };
          } catch {
            return { ok: false as const, items: [] as Content[] };
          }
        }),
      );
      if (gen !== s.gen) return;
      const anyFailed = results.some((r) => !r.ok);
      // movies/TV are a shuffled browse row; a genre interleaves providers so each addon is represented
      const merged = distinctBy(kind.type === "type" ? shuffled(results.flatMap((r) => r.items)) : interleave(results.map((r) => r.items)), (c) => c.id);
      merged.forEach((c) => s.seen.add(c.id));
      setItems(merged);
      setStatus(merged.length > 0 ? "loaded" : anyFailed ? "error" : "loaded");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providers, kindKey, tick]);

  const loadMore = useCallback(() => {
    const s = state.current;
    if (s.loading || !s.hasMore || providers.length === 0) return;
    s.loading = true;
    const gen = s.gen;
    const page = s.page;
    void (async () => {
      const results = await Promise.all(providers.map((p) => (kind.type === "type" ? p.getMoreItemsByType(kind.value, page) : p.getMoreGenreItems(kind.value, page)).catch(() => [] as Content[])));
      if (gen !== s.gen) return;
      const fresh = distinctBy(kind.type === "type" ? shuffled(results.flat()) : interleave(results), (c) => c.id).filter((c) => !s.seen.has(c.id));
      if (fresh.length === 0) s.hasMore = false;
      else {
        s.page++;
        fresh.forEach((c) => s.seen.add(c.id));
        setItems((current) => [...current, ...fresh]);
      }
      s.loading = false;
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providers, kindKey]);

  return { items, status, loadMore, retry: () => setTick((t) => t + 1) };
}

/** Grid + infinite-scroll sentinel shared by Movies, TV Shows, Genre results and My List. */
export function ContentGrid({ items, onLoadMore }: { items: Content[]; onLoadMore?: () => void }) {
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !onLoadMore) return;
    const observer = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && onLoadMore(), { rootMargin: "600px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, [onLoadMore, items.length]);
  return (
    <>
      <div className="grid" role="list">
        {items.map((content) => (
          <div role="listitem" key={content.id} style={{ display: "contents" }}>
            <ContentCard content={content} scale={0.629} />
          </div>
        ))}
      </div>
      <div ref={sentinel} style={{ height: 1 }} aria-hidden="true" />
      <div style={{ height: "calc(48 * var(--dp))" }} />
    </>
  );
}

function Page({ title, children, filters }: { title: string; children: ReactNode; filters?: ReactNode }) {
  useEffect(() => {
    document.title = `${title} · Mango TV`;
  }, [title]);
  return (
    <div className="page">
      <h1 className="t-display-md page__title">{title}</h1>
      {filters ? <div className="page__filters">{filters}</div> : null}
      {children}
    </div>
  );
}

function CatalogPage({ title, pager, emptyMessage }: { title: string; pager: Pager; emptyMessage: string }) {
  const watched = useWatchedIds();
  const [sort, setSort] = useState<SortMode>("FEATURED");
  const navigate = useNavigate();
  const items = useMemo(() => sortContent(pager.items, sort).map((c) => withWatched(c, watched)), [pager.items, sort, watched]);

  if (pager.status === "loading") return <GridSkeleton title={title} />;
  if (pager.status === "error") return <div className="page"><FullScreenError message="Couldn't reach your installed addons. Check your connection and try again." onRetry={pager.retry} /></div>;
  if (activeProviders().length === 0)
    return (
      <Page title={title}>
        <EmptyState icon={<MdExtension size={48} />} title="No addons installed" message="Install an addon to bring movies and TV shows into Mango TV." actionLabel="Browse Addons" actionIcon={<MdExtension />} onAction={() => navigate(routes.settings("addons"))} />
      </Page>
    );
  return (
    <Page
      title={title}
      filters={items.length > 0 ? SORTS.map((s) => <Pill key={s.id} label={s.label} selected={sort === s.id} large onClick={() => setSort(s.id)} dataAttrs={{ autofocus: s.id === "FEATURED" }} />) : undefined}
    >
      {items.length === 0 ? <p className="page__empty">{emptyMessage}</p> : <ContentGrid items={items} onLoadMore={pager.loadMore} />}
    </Page>
  );
}

export const MoviesScreen = () => <CatalogPage title="Movies" pager={usePager({ type: "type", value: "MOVIE" })} emptyMessage="Nothing to show here right now." />;
export const TvShowsScreen = () => <CatalogPage title="TV Shows" pager={usePager({ type: "type", value: "TV_SHOW" })} emptyMessage="Nothing to show here right now." />;
export const GenreResultsScreen = ({ genre }: { genre: string }) => <CatalogPage title={genre} pager={usePager({ type: "genre", value: genre })} emptyMessage={`Nothing found for ${genre} right now.`} />;

/** MyListScreen.kt — newest-added first, All / Watched filter. */
export function MyListScreen() {
  const items = useMyList((s) => s.items);
  const [filter, setFilter] = useState<"ALL" | "WATCHED">("ALL");
  const content = useMemo<Content[]>(() => {
    const filtered = filter === "WATCHED" ? items.filter((i) => i.watched) : items;
    return filtered.slice().reverse().map(savedToContent);
  }, [items, filter]);
  return (
    <Page
      title="My List"
      filters={[
        <Pill key="ALL" label="All" selected={filter === "ALL"} large onClick={() => setFilter("ALL")} dataAttrs={{ autofocus: true }} />,
        <Pill key="WATCHED" label="Watched" selected={filter === "WATCHED"} large onClick={() => setFilter("WATCHED")} />,
      ]}
    >
      {content.length === 0 ? (
        <p className="page__empty">{filter === "WATCHED" ? "Nothing watched yet. Titles you finish will show up here." : "Your list is empty. Add titles from a Detail page or Home's featured title to see them here."}</p>
      ) : (
        <ContentGrid items={content} />
      )}
    </Page>
  );
}

const savedToContent = (item: SavedListItem): Content => ({
  id: item.id,
  type: item.type,
  title: item.title,
  description: "",
  posterUrl: item.posterUrl,
  backdropUrl: item.backdropUrl,
  year: item.year,
  rating: item.rating,
  providerId: item.providerId,
  genres: [],
  cast: [],
  seasons: [],
  watched: item.watched,
});

