import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { computeStats, type HistoryItem, type WatchStats } from "../domain/stats";

export type WatchStatsState = { kind: "loading" } | { kind: "error" } | { kind: "ready"; stats: WatchStats; truncated: boolean };

const PAGE = 200;
/** A very long history is read up to here (newest first) rather than without end. */
const MAX_PAGES = 25;

interface HistoryPage {
  items: HistoryItem[];
}

/** The signed-in profile's whole watch history, newest first, read a page at a time. */
export async function loadHistory(): Promise<{ items: HistoryItem[]; truncated: boolean }> {
  const items: HistoryItem[] = [];
  let before: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const query = new URLSearchParams({ limit: String(PAGE) });
    if (before) query.set("before", before);
    const result = await api<HistoryPage>(`/user/history?${query}`);
    const batch = Array.isArray(result.items) ? result.items : [];
    items.push(...batch.filter((i) => i && (i.contentType === "MOVIE" || i.contentType === "TV_SHOW")));
    if (batch.length < PAGE) return { items, truncated: false };
    before = batch[batch.length - 1]!.watchedAt;
  }
  return { items, truncated: true };
}

/** Settings → Account → Your stats. Reads nothing until [enabled] (a Plus feature), and again whenever [refreshKey] changes. */
export function useWatchStats(enabled: boolean, refreshKey: unknown = null): WatchStatsState {
  const [state, setState] = useState<WatchStatsState>({ kind: "loading" });
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setState({ kind: "loading" });
    loadHistory()
      .then(({ items, truncated }) => !cancelled && setState({ kind: "ready", stats: computeStats(items), truncated }))
      .catch(() => !cancelled && setState({ kind: "error" }));
    return () => {
      cancelled = true;
    };
  }, [enabled, refreshKey]);
  return state;
}
