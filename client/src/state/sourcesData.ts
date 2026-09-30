import { useCallback, useEffect, useMemo, useState } from "react";
import { assessStream } from "../domain/playability";
import { activeProviders } from "../domain/registry";
import { resolutionOrdinal, type Content, type ContentType, type Stream } from "../domain/types";
import { useAuth } from "./auth";
import { useAddonsReady } from "./hooks";
import { useContinueWatching } from "./continueWatching";
import { findLastStreamId } from "./lastSource";

export type SourcesState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "loaded"; content: Content; streams: Stream[]; recommendedId: string | null; searchingMore: boolean; autoSelect: Stream | null };

/** Best stream = highest resolution, then most seeders; streams a browser can actually play win over ones it can't. */
export function recommendedStreamId(streams: Stream[]): string | null {
  const rank = (s: Stream) => (assessStream(s).level === "no" ? 1 : 0);
  return (
    streams
      .slice()
      .sort((a, b) => rank(a) - rank(b) || resolutionOrdinal(a.resolutionTier) - resolutionOrdinal(b.resolutionTier) || (b.seeders ?? -1) - (a.seeders ?? -1))
      .at(0)?.id ?? null
  );
}

/** SourcesViewModel.kt — progressive: rows appear as each addon answers; a resume with a remembered source skips the list. */
export function useSources(providerId: string, type: ContentType, id: string, season: number | null, episode: number | null, skipAutoSelect: boolean) {
  const userId = useAuth((s) => s.user?.id);
  const ready = useAddonsReady();
  const [state, setState] = useState<SourcesState>({ kind: "loading" });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    if (!ready) return;
    const providers = activeProviders();
    const owner = providers.find((p) => p.id === providerId);
    const resume = useContinueWatching.getState().findResumePoint(providerId, id, type);
    const sameTarget = !!resume && (resume.seasonNumber ?? null) === season && (resume.episodeNumber ?? null) === episode;
    const resumeFlow = sameTarget && !skipAutoSelect;

    void (async () => {
      const contentPromise = owner ? owner.getDetails(type, id).catch(() => null) : Promise.resolve(null);
      const fail = () => !cancelled && setState({ kind: "error", message: "Couldn't load details for this title." });

      if (resumeFlow) {
        const streams = (await Promise.all(providers.map((p) => p.getStreams(type, id, season, episode).catch(() => [] as Stream[])))).flat();
        const content = await contentPromise;
        if (cancelled) return;
        if (!content) return fail();
        const lastId = userId ? findLastStreamId(userId, providerId, id, type, season, episode) : null;
        setState({ kind: "loaded", content, streams, recommendedId: recommendedStreamId(streams), searchingMore: false, autoSelect: lastId ? (streams.find((s) => s.id === lastId) ?? null) : null });
        return;
      }

      const content = await contentPromise;
      if (cancelled) return;
      if (!content) return fail();
      if (providers.length === 0) return setState({ kind: "loaded", content, streams: [], recommendedId: null, searchingMore: false, autoSelect: null });
      const accumulated: Stream[] = [];
      let remaining = providers.length;
      providers.forEach((provider) => {
        void provider.getStreams(type, id, season, episode).catch(() => [] as Stream[]).then((streams) => {
          if (cancelled) return;
          accumulated.push(...streams);
          remaining--;
          setState({ kind: "loaded", content, streams: accumulated.slice(), recommendedId: recommendedStreamId(accumulated), searchingMore: remaining > 0, autoSelect: null });
        });
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [providerId, type, id, season, episode, skipAutoSelect, userId, tick, ready]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return useMemo(() => ({ state, reload }), [state, reload]);
}
