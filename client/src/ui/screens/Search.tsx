import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { MdSearch, MdSearchOff } from "react-icons/md";
import { useSearchParams } from "react-router-dom";
import { activeProviders } from "../../domain/registry";
import type { Content } from "../../domain/types";
import { distinctBy, interleave } from "../../lib/format";
import { withoutBlocked } from "../../domain/blockedGenres";
import { useBlockedSet } from "../../state/blockedGenres";
import { sectionWithWatched, useWatchedIds } from "../../state/hooks";
import { MangoButton } from "../components/Buttons";
import { ContentRow } from "../components/ContentRow";
import { EmptyState, Spinner } from "../components/States";

type SearchState =
  | { kind: "idle" }
  | { kind: "searching" }
  | { kind: "results"; movies: Content[]; tvShows: Content[] }
  | { kind: "none"; query: string }
  | { kind: "error"; message: string };

/** SearchViewModel.kt — every provider searched; merged, deduped, split into Movies / TV Shows. */
export async function runSearch(query: string): Promise<SearchState> {
  const providers = activeProviders();
  if (providers.length === 0) return { kind: "none", query };
  const settled = await Promise.allSettled(providers.map((p) => p.search(query)));
  const lists = settled.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
  const merged = distinctBy(interleave(lists), (c) => c.id);
  const movies = merged.filter((c) => c.type === "MOVIE");
  const tvShows = merged.filter((c) => c.type === "TV_SHOW");
  if (movies.length || tvShows.length) return { kind: "results", movies, tvShows };
  return settled.some((r) => r.status === "rejected") ? { kind: "error", message: "Couldn't reach your installed addons. Check your connection and try again." } : { kind: "none", query };
}

export function SearchScreen() {
  const [params, setParams] = useSearchParams();
  const urlQuery = params.get("q") ?? "";
  const [query, setQuery] = useState(urlQuery);
  const [state, setState] = useState<SearchState>({ kind: "idle" });
  const watched = useWatchedIds();
  const blocked = useBlockedSet();
  const generation = useRef(0);

  const submit = useCallback(async (value: string) => {
    if (value.trim() === "") return;
    const gen = ++generation.current;
    setState({ kind: "searching" });
    const result = await runSearch(value.trim());
    if (gen === generation.current) setState(result);
  }, []);

  useEffect(() => {
    document.title = "Search · Arc TV";
    if (urlQuery) void submit(urlQuery);
    // run once for a deep link / back navigation with ?q=
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setParams(query.trim() ? { q: query.trim() } : {}, { replace: true });
    void submit(query);
  };

  return (
    <div className="page">
      <h1 className="t-display-md page__title">Search</h1>
      <form className="search__bar" onSubmit={onSubmit} role="search">
        <label className="sr-only" htmlFor="q">
          Search movies and TV shows
        </label>
        <input id="q" className="mfield" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search movies and TV shows" autoComplete="off" enterKeyHint="search" data-autofocus="true" />
        <MangoButton text="Search" icon={<MdSearch />} variant="white" type="submit" />
      </form>
      <div aria-live="polite">
        {state.kind === "idle" ? <p className="c-text-2 t-body-md page__pad">Search for movies and TV shows across your installed addons.</p> : null}
        {state.kind === "searching" ? (
          <div className="search__status page__pad">
            <Spinner small /> <span className="c-text-2 t-body-md">Searching…</span>
          </div>
        ) : null}
        {state.kind === "results" ? (
          <>
            {withoutBlocked(state.movies, blocked).length ? <ContentRow section={sectionWithWatched({ id: "search_movies", title: "Movies", items: withoutBlocked(state.movies, blocked), style: "STANDARD" }, watched)} /> : null}
            {withoutBlocked(state.tvShows, blocked).length ? <ContentRow section={sectionWithWatched({ id: "search_tv_shows", title: "TV Shows", items: withoutBlocked(state.tvShows, blocked), style: "STANDARD" }, watched)} /> : null}
          </>
        ) : null}
        {state.kind === "none" ? <EmptyState icon={<MdSearchOff size={48} />} title="No results" message={`Nothing found for "${state.query}". Try a different search.`} /> : null}
        {state.kind === "error" ? <p className="c-coral t-body-md page__pad" role="alert">{state.message}</p> : null}
      </div>
    </div>
  );
}
