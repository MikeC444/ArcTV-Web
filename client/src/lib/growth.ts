/** The developer panel's user-growth series (one point per day, UTC) and the small calculations the chart needs. */
export interface GrowthPoint {
  /** The day as YYYY-MM-DD. */
  date: string;
  /** Accounts created that day. */
  newUsers: number;
  /** Accounts that existed by the end of that day. */
  total: number;
}

export type GrowthRange = 7 | 30 | 90 | "all";
export const GROWTH_RANGES: Array<{ id: GrowthRange; label: string }> = [
  { id: 7, label: "7 days" },
  { id: 30, label: "30 days" },
  { id: 90, label: "90 days" },
  { id: "all", label: "All" },
];

/**
 * The series without the quiet stretch before the first sign-up (keeping the one day before it as the starting point), so a young product's
 * chart doesn't open with weeks of flat line. With no sign-ups at all in the window the whole series is kept (it is honestly flat), and an
 * empty product has no series.
 */
export function trimLeadingEmpty(points: GrowthPoint[]): GrowthPoint[] {
  if (!points.some((p) => p.total > 0)) return [];
  const first = points.findIndex((p) => p.newUsers > 0);
  return first < 0 ? points : points.slice(Math.max(0, first - 1));
}

/** The points a range button shows: the last N days (or all of them), never counting the quiet days before the first sign-up. */
export function rangePoints(points: GrowthPoint[], range: GrowthRange): GrowthPoint[] {
  const trimmed = trimLeadingEmpty(points);
  return range === "all" ? trimmed : trimmed.slice(-range);
}

/** How many accounts were created across the shown points. */
export const addedIn = (points: GrowthPoint[]): number => points.reduce((sum, p) => sum + p.newUsers, 0);

/** Clean axis values from 0 up to just above [max], about [count] steps (1 / 2 / 5 times a power of ten). */
export function niceTicks(max: number, count = 4): number[] {
  if (!(max > 0)) return [0, 1];
  const raw = max / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * magnitude).find((s) => s >= raw) ?? 10 * magnitude;
  const ticks: number[] = [];
  for (let v = 0; v < max + step; v += step) ticks.push(v);
  return ticks;
}

/** 0, 950, 1K, 1.2K, 12K: compact from 1,000 up, for axis ticks. */
export function compactNumber(n: number): string {
  if (Math.abs(n) < 1000) return String(n);
  const k = n / 1000;
  return `${Number.isInteger(k) || k >= 10 ? Math.round(k) : k.toFixed(1)}K`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "Oct 9" for 2026-10-09 (the date is a UTC day, so no time zone shifts it). */
export function formatDay(date: string): string {
  const [, month, day] = date.split("-").map(Number);
  return `${MONTHS[(month ?? 1) - 1] ?? ""} ${day ?? ""}`.trim();
}

/** About [count] evenly spaced indices for the axis labels, always including the first and the last. */
export function labelIndices(length: number, count = 5): number[] {
  if (length <= 0) return [];
  if (length <= count) return Array.from({ length }, (_, i) => i);
  const picked = new Set<number>();
  for (let i = 0; i < count; i++) picked.add(Math.round((i * (length - 1)) / (count - 1)));
  return [...picked].sort((a, b) => a - b);
}
