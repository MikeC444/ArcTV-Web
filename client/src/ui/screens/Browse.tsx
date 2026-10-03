import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { MdExtension } from "react-icons/md";
import { useNavigate, useSearchParams } from "react-router-dom";
import { GENRE_OPTIONS } from "../../domain/genreOptions";
import { activeProviders, useProviders } from "../../domain/registry";
import type { Content, ContentType } from "../../domain/types";
import { distinctBy, interleave, shuffled } from "../../lib/format";
import { routes } from "../../lib/routes";
import { useAddonsReady, useWatchedIds, withWatched } from "../../state/hooks";
import { withoutBlocked } from "../../domain/blockedGenres";
import { useBlockedSet } from "../../state/blockedGenres";
import { useMyList, type SavedListItem } from "../../state/myList";
import { BackButton } from "../components/BackButton";
import { Pill } from "../components/Buttons";
import { ContentCard } from "../components/ContentCard";
import { GenrePicker } from "../components/GenrePicker";
import { SortPicker } from "../components/SortPicker";
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

/**
 * What each Movies / TV / genre page has loaded so far (kept until the site is reloaded): coming Back from a title finds the
 * same titles in the same order — including the pages loaded by scrolling — so the page can return to the exact spot.
 */
interface PagerSnapshot {
  items: Content[];
  page: number;
  hasMore: boolean;
}
const pagerCache = new Map<string, PagerSnapshot>();

/** TypeBrowseViewModel / GenreResultsViewModel — first page from every provider, then "skip" pages as you scroll. */
function usePager(kind: { type: "type"; value: ContentType; genre?: string | null } | { type: "genre"; value: string }): Pager {
  const providers = useProviders((s) => s.providers);
  const ready = useAddonsReady();
  const genreOfType = kind.type === "type" ? kind.genre ?? undefined : undefined; // the Movies / TV Shows drop-down
  const kindKey = `${kind.type}:${kind.value}:${genreOfType ?? ""}`;
  const cacheKey = `${kindKey}|${providers.map((p) => p.id).join(",")}`;
  const cachedAtStart = pagerCache.get(cacheKey);
  const [items, setItems] = useState<Content[]>(() => cachedAtStart?.items ?? []);
  const [status, setStatus] = useState<Pager["status"]>(cachedAtStart ? "loaded" : "loading");
  const [tick, setTick] = useState(0);
  const state = useRef({ page: 1, hasMore: true, loading: false, seen: new Set<string>(), gen: 0, items: [] as Content[] });

  useEffect(() => {
    const s = state.current;
    const gen = ++s.gen;
    s.page = 1;
    s.hasMore = true;
    s.loading = false;
    s.seen = new Set();
    const hit = pagerCache.get(cacheKey);
    if (hit) {
      s.page = hit.page;
      s.hasMore = hit.hasMore;
      s.items = hit.items;
      s.seen = new Set(hit.items.map((c) => c.id));
      setItems(hit.items);
      setStatus("loaded");
      return;
    }
    s.items = [];
    setItems([]);
    setStatus("loading");
    if (!ready) return;
    if (providers.length === 0) {
      setStatus("loaded");
      return;
    }
    void (async () => {
      const results = await Promise.all(
        providers.map(async (provider) => {
          try {
            if (kind.type === "type") return { ok: true as const, items: (await provider.getSectionsByType(kind.value, genreOfType)).flatMap((sec) => sec.items) };
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
      s.items = merged;
      if (merged.length > 0) pagerCache.set(cacheKey, { items: merged, page: s.page, hasMore: s.hasMore });
      setItems(merged);
      setStatus(merged.length > 0 ? "loaded" : anyFailed ? "error" : "loaded");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providers, kindKey, cacheKey, tick, ready]);

  const loadMore = useCallback(() => {
    const s = state.current;
    if (s.loading || !s.hasMore || providers.length === 0) return;
    s.loading = true;
    const gen = s.gen;
    const page = s.page;
    void (async () => {
      const results = await Promise.all(providers.map((p) => (kind.type === "type" ? p.getMoreItemsByType(kind.value, page, genreOfType) : p.getMoreGenreItems(kind.value, page)).catch(() => [] as Content[])));
      if (gen !== s.gen) return;
      const fresh = distinctBy(kind.type === "type" ? shuffled(results.flat()) : interleave(results), (c) => c.id).filter((c) => !s.seen.has(c.id));
      if (fresh.length === 0) s.hasMore = false;
      else {
        s.page++;
        fresh.forEach((c) => s.seen.add(c.id));
        s.items = [...s.items, ...fresh];
        setItems(s.items);
      }
      pagerCache.set(cacheKey, { items: s.items, page: s.page, hasMore: s.hasMore });
      s.loading = false;
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providers, kindKey, cacheKey]);

  return {
    items,
    status,
    loadMore,
    retry: () => {
      pagerCache.delete(cacheKey);
      setTick((t) => t + 1);
    },
  };
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
            <ContentCard content={content} />
          </div>
        ))}
      </div>
      <div ref={sentinel} style={{ height: 1 }} aria-hidden="true" />
      <div style={{ height: "calc(48 * var(--dp))" }} />
    </>
  );
}

function Page({ title, children, filters, back, headExtra }: { title: string; children: ReactNode; filters?: ReactNode; back?: string; headExtra?: ReactNode }) {
  useEffect(() => {
    document.title = `${title} · Arc TV`;
  }, [title]);
  return (
    <div className="page">
      {back ? <div className="page__back"><BackButton fallback={back} /></div> : null}
      <div className="page__head">
        <h1 className="t-display-md page__title">{title}</h1>
        {headExtra}
      </div>
      {filters ? <div className="page__filters">{filters}</div> : null}
      {children}
    </div>
  );
}

function CatalogPage({ title, pager, emptyMessage, back, headExtra }: { title: string; pager: Pager; emptyMessage: string; back?: string; headExtra?: ReactNode }) {
  const watched = useWatchedIds();
  const [sort, setSort] = useState<SortMode>("FEATURED");
  const navigate = useNavigate();
  const blocked = useBlockedSet();
  const items = useMemo(() => sortContent(withoutBlocked(pager.items, blocked), sort).map((c) => withWatched(c, watched)), [pager.items, sort, watched, blocked]);

  if (pager.status === "loading") return <GridSkeleton title={title} back={back} headExtra={headExtra} />;
  if (pager.status === "error") return <div className="page"><FullScreenError message="Couldn't reach your installed addons. Check your connection and try again." onRetry={pager.retry} /></div>;
  if (activeProviders().length === 0)
    return (
      <Page title={title} back={back} headExtra={headExtra}>
        <EmptyState icon={<MdExtension size={48} />} title="No addons installed" message="Install an addon to bring movies and TV shows into Arc TV." actionLabel="Browse Addons" actionIcon={<MdExtension />} onAction={() => navigate(routes.settings("addons"))} />
      </Page>
    );
  return (
    <Page
      title={title}
      back={back}
      headExtra={headExtra}
      filters={items.length > 0 ? SORTS.map((s) => <Pill key={s.id} label={s.label} selected={sort === s.id} large onClick={() => setSort(s.id)} dataAttrs={{ autofocus: s.id === "FEATURED" }} />) : undefined}
    >
      {items.length === 0 ? <p className="page__empty">{emptyMessage}</p> : <ContentGrid items={items} onLoadMore={pager.loadMore} />}
    </Page>
  );
}

/**
 * Movies / TV Shows with the genre drop-down. The chosen genre lives in the address (?genre=Action), so going Back from a title returns to the
 * same filtered list, and a filtered list can be shared; choosing replaces the address rather than adding a history step.
 */
function TypeScreen({ title, type }: { title: string; type: ContentType }) {
  const [params, setParams] = useSearchParams();
  const requested = params.get("genre");
  const blockedGenres = useBlockedSet();
  const options = useMemo(() => GENRE_OPTIONS[type].filter((g) => !blockedGenres.has(g.toLowerCase())), [type, blockedGenres]);
  const genre = requested && options.includes(requested) ? requested : null;
  const pager = usePager({ type: "type", value: type, genre });
  const picker = <GenrePicker genres={options} value={genre} onChange={(g) => setParams(g ? { genre: g } : {}, { replace: true })} />;
  return <CatalogPage title={title} pager={pager} headExtra={picker} emptyMessage={genre ? `No ${genre} ${title.toLowerCase()} found right now.` : "Nothing to show here right now."} />;
}
export const MoviesScreen = () => <TypeScreen title="Movies" type="MOVIE" />;
export const TvShowsScreen = () => <TypeScreen title="TV Shows" type="TV_SHOW" />;

type ListSort = "RECENT" | "TITLE" | "HIGHEST_RATED" | "NEWEST";
const LIST_SORTS: Array<{ id: ListSort; label: string }> = [
  { id: "RECENT", label: "Recently Added" },
  { id: "TITLE", label: "A–Z" },
  { id: "HIGHEST_RATED", label: "Highest Rated" },
  { id: "NEWEST", label: "Newest" },
];

const sortSaved = (items: SavedListItem[], sort: ListSort): SavedListItem[] => {
  const recent = items.slice().reverse();
  if (sort === "RECENT") return recent;
  if (sort === "TITLE") return recent.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }));
  if (sort === "HIGHEST_RATED") return recent.sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1));
  return recent.sort((a, b) => (b.year ?? -1) - (a.year ?? -1));
};

/** MyListScreen.kt — All / Watched filter, sorted by recently added (default), A–Z, rating or year. */
export function MyListScreen() {
  const items = useMyList((s) => s.items);
  const [filter, setFilter] = useState<"ALL" | "WATCHED">("ALL");
  const [sort, setSort] = useState<ListSort>("RECENT");
  const content = useMemo<Content[]>(() => {
    const filtered = filter === "WATCHED" ? items.filter((i) => i.watched) : items;
    return sortSaved(filtered, sort).map(savedToContent);
  }, [items, filter, sort]);
  return (
    <Page
      title="My List"
      headExtra={<SortPicker<ListSort> options={LIST_SORTS} value={sort} onChange={setSort} />}
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

