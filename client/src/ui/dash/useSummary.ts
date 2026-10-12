import { useCallback, useEffect, useState } from "react";
import { fetchAdminSummary, type AdminSummary } from "../../state/admin";

const REFRESH_MS = 30_000;

/** The dashboard's summary numbers, refreshed every 30 seconds while the tab is visible. */
export function useSummary() {
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const refresh = useCallback(async () => {
    try {
      setSummary(await fetchAdminSummary());
      setError(null);
      setUpdatedAt(Date.now());
    } catch {
      setError("Couldn't load the dashboard. You may not be an admin, or the service is unreachable.");
    }
  }, []);
  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => document.visibilityState === "visible" && void refresh(), REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);
  return { summary, error, updatedAt, refresh };
}

/** "8s ago" style label that ticks every few seconds. */
export function useAgo(at: number | null): string {
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => tick((n) => n + 1), 5000);
    return () => window.clearInterval(timer);
  }, []);
  if (at == null) return "Loading…";
  const s = Math.max(0, Math.round((Date.now() - at) / 1000));
  return s < 5 ? "Updated just now" : s < 60 ? `Updated ${s}s ago` : `Updated ${Math.round(s / 60)} min ago`;
}
