import { useCallback, useEffect, useMemo, useState } from "react";
import { startRank, type DeviceCaps } from "../domain/deviceSupport";
import type { StreamLookup } from "../domain/provider";
import { activeProviders } from "../domain/registry";
import { resolutionOrdinal, type Content, type ContentType, type Stream } from "../domain/types";
import { useAuth } from "./auth";
import { useAddonsReady } from "./hooks";
import { useContinueWatching } from "./continueWatching";
import { findLastStreamId } from "./lastSource";
import { rememberPlayerArt } from "./playerArt";

/** One installed addon and what it answered (or that it is still being asked). */
export interface AddonLookupRow {
  name: string;
  lookup: StreamLookup | { kind: "searching" };
}

export type SourcesState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "loaded"; content: Content; streams: Stream[]; addons: AddonLookupRow[]; recommendedId: string | null; searchingMore: boolean; autoSelect: Stream | null };

/** Best stream = highest resolution, then most seeders; sources this device can play win over ones it can't (or can only show without sound). */
export function recommendedStreamId(streams: Stream[], caps?: DeviceCaps): string | null {
  const rank = (s: Stream) => startRank(s, caps); // playable here first; within that a plain file beats an MKV, and sources that start at once beat ones the debrid service still has to fetch
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
        const reports = await Promise.all(providers.map((p) => p.getStreamReport(type, id, season, episode)));
        const streams = reports.flatMap((r) => r.streams);
        const content = await contentPromise;
        if (cancelled) return;
        if (!content) return fail();
        rememberPlayerArt(content);
        const lastId = userId ? findLastStreamId(userId, providerId, id, type, season, episode) : null;
        setState({ kind: "loaded", content, streams, addons: reports.map((r) => ({ name: r.addonName, lookup: r.lookup })), recommendedId: recommendedStreamId(streams), searchingMore: false, autoSelect: lastId ? (streams.find((s) => s.id === lastId) ?? null) : null });
        return;
      }

      const content = await contentPromise;
      if (cancelled) return;
      if (!content) return fail();
      rememberPlayerArt(content);
      if (providers.length === 0) return setState({ kind: "loaded", content, streams: [], addons: [], recommendedId: null, searchingMore: false, autoSelect: null });
      const accumulated: Stream[] = [];
      const rows: AddonLookupRow[] = providers.map((p) => ({ name: p.name, lookup: { kind: "searching" } }));
      let remaining = providers.length;
      const publish = () => setState({ kind: "loaded", content, streams: accumulated.slice(), addons: rows.slice(), recommendedId: recommendedStreamId(accumulated), searchingMore: remaining > 0, autoSelect: null });
      publish();
      providers.forEach((provider, index) => {
        void provider.getStreamReport(type, id, season, episode).then((report) => {
          if (cancelled) return;
          accumulated.push(...report.streams);
          rows[index] = { name: report.addonName, lookup: report.lookup };
          remaining--;
          publish();
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
