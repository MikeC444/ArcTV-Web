import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MdLiveTv, MdSearch } from "react-icons/md";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { categoryKey, type LiveChannel, type LiveType } from "../../domain/live";
import { useProviders } from "../../domain/registry";
import { distinctBy, interleave } from "../../lib/format";
import { routes } from "../../lib/routes";
import { setLiveLineup } from "../../state/liveLineup";
import { useAddonsReady, useHasLiveTv } from "../../state/hooks";
import { Pill } from "../components/Buttons";
import { EmptyState, Spinner } from "../components/States";

const SEARCH_DELAY_MS = 350;
/** A page that adds fewer new channels than this is taken to be the last one. */
const MIN_NEW_FOR_MORE = 1;

type TypeFilter = "all" | LiveType;
const keyOf = (c: Pick<LiveChannel, "providerId" | "type" | "id">) => `${c.providerId}|${c.type}|${c.id}`;
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "TV";

/**
 * The Live TV tab: the channels (and live events) of every installed addon that has them, with category chips from what the catalogues list,
 * a filter for channels or events and for which addon, and a search. Pressing one opens it full screen. The tab only exists while such an
 * addon is installed, so opening the address without one goes Home.
 */
export function LiveTvScreen() {
  const ready = useAddonsReady();
  const hasLive = useHasLiveTv();
  const providers = useProviders((s) => s.providers);
  const liveProviders = useMemo(() => providers.filter((p) => p.hasLiveTv === true), [providers]);
  const [params, setParams] = useSearchParams();
  const requestedGenre = params.get("genre");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [providerFilter, setProviderFilter] = useState("");
  const [typed, setTyped] = useState("");
  const [query, setQuery] = useState("");
  const [channels, setChannels] = useState<LiveChannel[]>([]);
  const [status, setStatus] = useState<"loading" | "loaded">("loading");
  const [hasMore, setHasMore] = useState(false);
  const page = useRef(0);
  const run = useRef(0);

  useEffect(() => {
    document.title = "Live TV · Arc TV";
  }, []);

  const types = useMemo(() => [...new Set(liveProviders.flatMap((p) => p.liveTypes?.() ?? []))] as LiveType[], [liveProviders]);
  const categories = useMemo(() => {
    const seen = new Map<string, string>();
    for (const p of liveProviders) for (const g of p.liveGenres?.() ?? []) if (!seen.has(categoryKey(g))) seen.set(categoryKey(g), g);
    return [...seen.values()].sort((a, b) => a.localeCompare(b));
  }, [liveProviders]);
  const genre = requestedGenre && categories.some((g) => categoryKey(g) === categoryKey(requestedGenre)) ? categories.find((g) => categoryKey(g) === categoryKey(requestedGenre))! : null;
  const sources = useMemo(() => liveProviders.filter((p) => !providerFilter || p.id === providerFilter), [liveProviders, providerFilter]);
  const sourcesKey = sources.map((p) => p.id).join(",");

  // typing searches after a short pause
  useEffect(() => {
    const t = window.setTimeout(() => setQuery(typed.trim()), SEARCH_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [typed]);

  const fetchPage = useCallback(
    async (pageNumber: number): Promise<LiveChannel[]> => {
      const type = typeFilter === "all" ? undefined : typeFilter;
      const lists = await Promise.all(
        sources.map((p) =>
          query
            ? (p.searchLiveChannels?.(query) ?? Promise.resolve([] as LiveChannel[]))
            : (p.getLiveChannels?.({ genre: genre ?? undefined, type, page: pageNumber }) ?? Promise.resolve([] as LiveChannel[])),
        ),
      );
      const merged = distinctBy(interleave(lists), keyOf);
      return type ? merged.filter((c) => c.type === type) : merged;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sourcesKey, query, genre, typeFilter],
  );

  useEffect(() => {
    if (!ready || sources.length === 0) return undefined;
    const mine = ++run.current;
    page.current = 0;
    setStatus("loading");
    setChannels([]);
    setHasMore(false);
    void fetchPage(0).then((first) => {
      if (run.current !== mine) return;
      setChannels(first);
      setHasMore(!query && first.length >= MIN_NEW_FOR_MORE);
      setStatus("loaded");
    });
    return () => {
      run.current += 1;
    };
  }, [ready, sources.length, fetchPage, query]);

  useEffect(() => setLiveLineup(channels), [channels]);

  const loadMore = useCallback(() => {
    if (!hasMore || status !== "loaded") return;
    const mine = run.current;
    const next = page.current + 1;
    page.current = next;
    setHasMore(false); // until this page says there is more
    void fetchPage(next).then((more) => {
      if (run.current !== mine) return;
      setChannels((current) => {
        const seen = new Set(current.map(keyOf));
        const fresh = more.filter((c) => !seen.has(keyOf(c)));
        setHasMore(fresh.length >= MIN_NEW_FOR_MORE);
        return fresh.length > 0 ? [...current, ...fresh] : current;
      });
    });
  }, [hasMore, status, fetchPage]);

  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasMore) return undefined;
    const observer = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && loadMore(), { rootMargin: "600px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loadMore, channels.length]);

  if (ready && !hasLive) return <Navigate to={routes.home} replace />;

  const setGenre = (g: string | null) => setParams(g ? { genre: g } : {}, { replace: true });
  const showSource = liveProviders.length > 1;

  return (
    <div className="page live">
      <div className="page__head">
        <h1 className="t-display-md page__title page__title--icon"><MdLiveTv aria-hidden="true" /> Live TV</h1>
        <label className="live__search">
          <MdSearch aria-hidden="true" />
          <input type="search" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Search channels" aria-label="Search channels" />
        </label>
      </div>
      <div className="page__filters live__filters">
        {types.length > 1 ? (
          <div className="live__chips" role="group" aria-label="Channels or events">
            <Pill label="All" selected={typeFilter === "all"} onClick={() => setTypeFilter("all")} />
            {types.includes("tv") ? <Pill label="Channels" selected={typeFilter === "tv"} onClick={() => setTypeFilter("tv")} /> : null}
            {types.includes("events") ? <Pill label="Live events" selected={typeFilter === "events"} onClick={() => setTypeFilter("events")} /> : null}
          </div>
        ) : null}
        {liveProviders.length > 1 ? (
          <div className="live__chips" role="group" aria-label="Addon">
            <Pill label="All addons" selected={providerFilter === ""} onClick={() => setProviderFilter("")} />
            {liveProviders.map((p) => <Pill key={p.id} label={p.name} selected={providerFilter === p.id} onClick={() => setProviderFilter(p.id)} />)}
          </div>
        ) : null}
        {categories.length > 0 && !query ? (
          <div className="live__chips live__chips--scroll hide-scroll" role="group" aria-label="Categories">
            <Pill label="Everything" selected={genre === null} onClick={() => setGenre(null)} />
            {categories.map((g) => <Pill key={g} label={g} selected={genre !== null && categoryKey(genre) === categoryKey(g)} onClick={() => setGenre(g)} />)}
          </div>
        ) : null}
      </div>

      {status === "loading" ? (
        <div className="live__loading"><Spinner /></div>
      ) : channels.length === 0 ? (
        <EmptyState
          icon={<MdLiveTv />}
          title={query ? "No channels match" : "No channels right now"}
          message={query ? `Nothing for “${query}”. Try a different name.` : genre ? `No ${genre} channels came back. Try another category.` : "Your TV addons didn't return any channels right now."}
        />
      ) : (
        <>
          <ul className="live__grid" role="list">
            {channels.map((c) => (
              <li key={keyOf(c)}>
                <Link className="livecard" to={routes.liveChannel(c.providerId, c.type, c.id)} aria-label={`Watch ${c.name}`} data-shape={c.shape}>
                  <span className="livecard__logo">
                    {c.logoUrl ? <img src={c.logoUrl} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")} /> : null}
                    <b aria-hidden="true">{initials(c.name)}</b>
                    <span className="livecard__badge">{c.type === "events" ? "EVENT" : "LIVE"}</span>
                  </span>
                  <span className="livecard__name">{c.name}</span>
                  {showSource || c.genres.length > 0 ? <span className="livecard__sub">{[c.genres[0], showSource ? c.providerName : null].filter(Boolean).join(" · ")}</span> : null}
                </Link>
              </li>
            ))}
          </ul>
          <div ref={sentinel} style={{ height: 1 }} aria-hidden="true" />
          <div style={{ height: "calc(48 * var(--dp))" }} />
        </>
      )}
    </div>
  );
}
