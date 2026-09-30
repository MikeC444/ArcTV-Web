/**
 * The backend resolves conflicts with `WHERE EXCLUDED.updated_at > table.updated_at`
 * (last-write-wins, strictly newer). Two quick edits in the same millisecond, or a
 * clock that steps backwards, would therefore silently lose the second write — so
 * every timestamp this client emits is strictly greater than the previous one for the same key.
 */
const lastByKey = new Map<string, number>();

export function nowIso(): string {
  return new Date().toISOString();
}

export function monotonicIso(key: string, now: number = Date.now()): string {
  const last = lastByKey.get(key) ?? 0;
  const next = now > last ? now : last + 1;
  lastByKey.set(key, next);
  return new Date(next).toISOString();
}

export function isoMs(iso: string | null | undefined): number {
  const value = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(value) ? 0 : value;
}

export function resetMonotonicClock(): void {
  lastByKey.clear();
}
