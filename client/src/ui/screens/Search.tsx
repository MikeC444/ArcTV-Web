import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { MdClose, MdHistory, MdSearch, MdSearchOff } from "react-icons/md";
import { useNavigate, useSearchParams } from "react-router-dom";
import { activeProviders } from "../../domain/registry";
import type { Content } from "../../domain/types";
import { distinctBy, interleave, pluralize } from "../../lib/format";
import { routes } from "../../lib/routes";
import { withoutBlocked } from "../../domain/blockedGenres";
import { useAuth } from "../../state/auth";
import { useBlockedSet } from "../../state/blockedGenres";
import { stashDetailPreview } from "../../state/pendingDetail";
import { useRecentSearches } from "../../state/recentSearches";
import { sectionWithWatched, useWatchedIds } from "../../state/hooks";
import { ContentCard } from "../components/ContentCard";
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

const SEARCH_DELAY_MS = 350;
const SUGGESTION_COUNT = 5;

export function SearchScreen() {
  const [params, setParams] = useSearchParams();
  const urlQuery = params.get("q") ?? "";
  const [query, setQuery] = useState(urlQuery);
  const [state, setState] = useState<SearchState>({ kind: "idle" });
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const watched = useWatchedIds();
  const blocked = useBlockedSet();
  const navigate = useNavigate();
  const userId = useAuth((s) => s.user?.id);
  const recents = useRecentSearches((s) => s.items);
  const generation = useRef(0);

  useEffect(() => {
    useRecentSearches.getState().load();
  }, [userId]);

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

  // Search as you type: wait for a short pause, and never for a single letter.
  const typedAt = useRef(false);
  useEffect(() => {
    if (!typedAt.current) return undefined;
    const q = query.trim();
    if (q === "") {
      generation.current++;
      setState({ kind: "idle" });
      setParams({}, { replace: true });
      return undefined;
    }
    if (q.length < 2) return undefined;
    const timer = window.setTimeout(() => {
      setParams({ q }, { replace: true });
      void submit(q);
    }, SEARCH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [query, setParams, submit]);

  const shown = useMemo(() => {
    if (state.kind !== "results") return { movies: [] as Content[], tvShows: [] as Content[] };
    return { movies: withoutBlocked(state.movies, blocked), tvShows: withoutBlocked(state.tvShows, blocked) };
  }, [state, blocked]);
  const suggestions = useMemo(() => [...shown.movies, ...shown.tvShows].slice(0, SUGGESTION_COUNT), [shown]);
  const showSuggestions = open && query.trim().length >= 2 && suggestions.length > 0;

  const change = (value: string) => {
    typedAt.current = true;
    setQuery(value);
    setOpen(true);
    setHighlight(-1);
  };
  const runNow = (value: string) => {
    const q = value.trim();
    if (q === "") return;
    typedAt.current = true;
    setQuery(q);
    setOpen(false);
    setParams({ q }, { replace: true });
    useRecentSearches.getState().add(q);
    void submit(q);
  };
  const pick = (content: Content) => {
    const providerId = content.providerId ?? "";
    if (!providerId) return;
    useRecentSearches.getState().add(query);
    stashDetailPreview(content);
    setOpen(false);
    navigate(routes.detail(providerId, content.type, content.id, content.title));
  };
  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const chosen = showSuggestions && highlight >= 0 ? suggestions[highlight] : undefined;
    if (chosen) pick(chosen);
    else runNow(query);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape" && showSuggestions) {
      event.preventDefault();
      event.nativeEvent.stopPropagation();
      setOpen(false);
      return;
    }
    if (!showSuggestions || (event.key !== "ArrowDown" && event.key !== "ArrowUp")) return;
    event.preventDefault();
    event.nativeEvent.stopPropagation(); // keep the arrows for the list while it is open
    const last = suggestions.length - 1;
    setHighlight((h) => (event.key === "ArrowDown" ? (h >= last ? 0 : h + 1) : h <= 0 ? last : h - 1));
  };
  const clear = () => {
    typedAt.current = true;
    setQuery("");
    setOpen(false);
    document.getElementById("q")?.focus();
  };

  const hasResults = shown.movies.length > 0 || shown.tvShows.length > 0;
  return (
    <div className="page">
      <h1 className="t-display-md page__title">Search</h1>
      <form className="search__bar" onSubmit={onSubmit} role="search">
        <div className="sbar" onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node | null) && setOpen(false)}>
          <label className="sr-only" htmlFor="q">
            Search movies and TV shows
          </label>
          <div className="sbar__field">
            <MdSearch aria-hidden="true" />
            <input
              id="q"
              className="sbar__input"
              type="search"
              role="combobox"
              aria-expanded={showSuggestions}
              aria-controls="search-suggestions"
              aria-activedescendant={showSuggestions && highlight >= 0 ? `suggestion-${highlight}` : undefined}
              aria-autocomplete="list"
              value={query}
              onChange={(e) => change(e.target.value)}
              onFocus={() => setOpen(true)}
              onKeyDown={onKeyDown}
              placeholder="Search movies and TV shows"
              autoComplete="off"
              enterKeyHint="search"
              data-autofocus="true"
            />
            {query ? (
              <button type="button" className="sbar__clear" aria-label="Clear search" onClick={clear}>
                <MdClose aria-hidden="true" />
              </button>
            ) : null}
          </div>
          {showSuggestions ? (
            <ul className="sbar__list" id="search-suggestions" role="listbox" aria-label="Matching titles">
              {suggestions.map((c, i) => (
                <li
                  key={c.id}
                  id={`suggestion-${i}`}
                  role="option"
                  aria-selected={i === highlight}
                  className="sbar__option"
                  data-active={i === highlight || undefined}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(c)}
                  onMouseEnter={() => setHighlight(i)}
                >
                  {c.posterUrl ? <img className="sbar__thumb" src={c.posterUrl} alt="" referrerPolicy="no-referrer" /> : <span className="sbar__thumb" />}
                  <span className="sbar__title">{c.title}</span>
                  <span className="sbar__meta">{c.type === "MOVIE" ? "Movie" : "TV Show"}{c.year ? ` · ${c.year}` : ""}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </form>
      <div aria-live="polite">
        {state.kind === "idle" ? (
          <>
            {recents.length > 0 ? (
              <section className="recent page__pad" aria-labelledby="recent-title">
                <div className="recent__head">
                  <h2 id="recent-title" className="t-title-md">Recent searches</h2>
                  <button type="button" className="recent__clear" onClick={() => useRecentSearches.getState().clear()}>Clear</button>
                </div>
                <ul className="recent__list">
                  {recents.map((term) => (
                    <li key={term} className="recent__chip">
                      <button type="button" className="recent__term" onClick={() => runNow(term)}>
                        <MdHistory aria-hidden="true" />
                        {term}
                      </button>
                      <button type="button" className="recent__remove" aria-label={`Remove ${term} from recent searches`} onClick={() => useRecentSearches.getState().remove(term)}>
                        <MdClose aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            <p className="c-text-2 t-body-md page__pad">Search for movies and TV shows across your installed addons.</p>
          </>
        ) : null}
        {state.kind === "searching" ? (
          <div className="search__status page__pad">
            <Spinner small /> <span className="c-text-2 t-body-md">Searching…</span>
          </div>
        ) : null}
        {state.kind === "results" && hasResults ? (
          <div onClickCapture={() => useRecentSearches.getState().add(query)}>
            {shown.movies.length ? <ResultGrid title="Movies" items={shown.movies} watched={watched} /> : null}
            {shown.tvShows.length ? <ResultGrid title="TV Shows" items={shown.tvShows} watched={watched} /> : null}
          </div>
        ) : null}
        {state.kind === "none" || (state.kind === "results" && !hasResults) ? <EmptyState icon={<MdSearchOff size={48} />} title="No results" message={`Nothing found for "${state.kind === "none" ? state.query : query.trim()}". Try a different search.`} /> : null}
        {state.kind === "error" ? <p className="c-coral t-body-md page__pad" role="alert">{state.message}</p> : null}
      </div>
    </div>
  );
}

/** A titled, wrapping poster grid: no sideways scrolling to see every match. */
function ResultGrid({ title, items, watched }: { title: string; items: Content[]; watched: ReturnType<typeof useWatchedIds> }) {
  const marked = sectionWithWatched({ id: `search_${title}`, title, items, style: "STANDARD" }, watched).items;
  return (
    <section aria-label={title}>
      <h2 className="t-title-lg search__heading">
        {title} <span className="c-text-3 t-body-md">{pluralize(items.length, "result")}</span>
      </h2>
      <div className="grid" role="list">
        {marked.map((content) => (
          <div role="listitem" key={content.id} style={{ display: "contents" }}>
            <ContentCard content={content} />
          </div>
        ))}
      </div>
    </section>
  );
}
