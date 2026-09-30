export function formatTimestamp(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const mm = hours > 0 ? String(minutes).padStart(2, "0") : String(minutes);
  return hours > 0 ? `${hours}:${mm}:${String(seconds).padStart(2, "0")}` : `${mm}:${String(seconds).padStart(2, "0")}`;
}

/** "1h 32m" — Kotlin: "${it / 60}h ${it % 60}m" */
export function formatRuntime(minutes: number): string {
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/** "Resume from 1h 12m" — Kotlin: formatElapsed */
export function formatElapsed(positionMs: number): string {
  const totalMinutes = Math.max(0, Math.floor(positionMs / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

/** yyyy-MM-dd → "Mar 5, 2024" (DetailHeroSection.formatReleaseDate) */
export function formatReleaseDate(isoDate: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(date);
}

export function formatSpeed(speed: number): string {
  return Number.isInteger(speed) ? `${speed}x` : `${speed}x`;
}

export function pluralize(count: number, one: string, many = `${one}s`): string {
  return count === 1 ? `1 ${one}` : `${count} ${many}`;
}

export function shuffled<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j] as T, copy[i] as T];
  }
  return copy;
}

export function distinctBy<T, K>(items: readonly T[], key: (item: T) => K): T[] {
  const seen = new Set<K>();
  const out: T[] = [];
  for (const item of items) {
    const k = key(item);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(item);
    }
  }
  return out;
}

/** movie[0], series[0], movie[1], … — HomeSection merging (StremioAddonProvider.interleave). */
export function interleave<T>(lists: readonly (readonly T[])[]): T[] {
  if (lists.length === 1) return [...(lists[0] as readonly T[])];
  const result: T[] = [];
  const max = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < max; i++) for (const list of lists) if (i < list.length) result.push(list[i] as T);
  return result;
}
