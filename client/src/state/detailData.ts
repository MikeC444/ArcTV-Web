import { useCallback, useEffect, useRef, useState } from "react";
import { useProviders } from "../domain/registry";
import type { Content, ContentType } from "../domain/types";
import { api } from "../lib/api";
import { distinctBy } from "../lib/format";
import { useAddonsReady, withWatched } from "./hooks";
import { consumeDetailPreview } from "./pendingDetail";

/** DetailViewModel.kt */
export type DetailState = { kind: "loading" } | { kind: "error"; message: string } | { kind: "success"; content: Content; similar: Content[] };
export type LookupState<T> = { kind: "idle" | "loading" | "notFound" } | { kind: "found"; value: T };

export function useDetail(providerId: string, type: ContentType, id: string, watchedIds: Set<string>) {
  const providers = useProviders((s) => s.providers);
  const ready = useAddonsReady();
  const preview = useRef<Content | undefined>(consumeDetailPreview(id));
  const [content, setContent] = useState<Content | null>(preview.current ?? null);
  const [similar, setSimilar] = useState<Content[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [, setLoading] = useState(!preview.current);
  const [trailer, setTrailer] = useState<LookupState<string>>({ kind: "idle" });
  const [releaseDate, setReleaseDate] = useState<LookupState<string>>({ kind: "idle" });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setTrailer({ kind: "idle" });
    setReleaseDate({ kind: "idle" });
    if (!ready) return;
    const provider = providers.find((p) => p.id === providerId);
    if (!provider) {
      if (!content) {
        setError("This addon is no longer installed.");
        setLoading(false);
      }
      return;
    }
    if (!content) setLoading(true);
    void (async () => {
      const detail = await provider.getDetails(type, id).catch(() => null);
      if (cancelled) return;
      if (!detail) {
        if (!content) setError("Couldn't load details for this title.");
        setLoading(false);
        return;
      }
      setContent(detail);
      setLoading(false);

      // Trailer + release date come from the existing API (it holds the TMDB key); both degrade quietly.
      setTrailer({ kind: "loading" });
      const trailerQuery = new URLSearchParams({ title: detail.title, type: detail.type });
      if (detail.year) trailerQuery.set("year", String(detail.year));
      void api<{ youtubeVideoId: string | null }>(`/user/trailer?${trailerQuery}`)
        .then((r) => !cancelled && setTrailer(r.youtubeVideoId ? { kind: "found", value: r.youtubeVideoId } : { kind: "notFound" }))
        .catch(() => !cancelled && setTrailer({ kind: "notFound" }));
      if (detail.type === "MOVIE") {
        setReleaseDate({ kind: "loading" });
        const q = new URLSearchParams({ title: detail.title });
        if (detail.year) q.set("year", String(detail.year));
        void api<{ releaseDate: string | null }>(`/user/release-date?${q}`)
          .then((r) => !cancelled && setReleaseDate(r.releaseDate ? { kind: "found", value: r.releaseDate } : { kind: "notFound" }))
          .catch(() => !cancelled && setReleaseDate({ kind: "notFound" }));
      } else setReleaseDate({ kind: "notFound" });

      // "You may also like": other titles from the same addon, preferring shared genres.
      try {
        const all: Content[] = [];
        for await (const batch of provider.getHomeSections()) all.push(...batch.flatMap((s) => s.items));
        if (cancelled) return;
        const pool = distinctBy(all, (c) => c.id).filter((c) => c.id !== detail.id);
        const genreIds = new Set(detail.genres.map((g) => g.id));
        const matches = genreIds.size ? pool.filter((c) => c.genres.some((g) => genreIds.has(g.id))) : [];
        setSimilar((matches.length ? matches : pool).slice(0, 15));
      } catch {
        /* similar row is optional */
      }
    })();
    return () => {
      cancelled = true;
    };
    // `content` deliberately omitted — it is the preview we already have, not an input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providers, ready, providerId, type, id, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  const state: DetailState = content ? { kind: "success", content: withWatched(content, watchedIds), similar: similar.map((c) => withWatched(c, watchedIds)) } : error ? { kind: "error", message: error } : { kind: "loading" };
  return { state, trailer, releaseDate, reload };
}
