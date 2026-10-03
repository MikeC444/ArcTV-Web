const GENRE_LIST_MIN_YEAR = 2016;
const isYear = (value: string) => /^\d+$/.test(value) && Number(value) >= 1900 && Number(value) <= 2100;

/** GenresViewModel: union of every provider's genres, alphabetical, then years newest-first extended back to 2016. */
export function buildGenreList(all: Iterable<string>): string[] {
  const options = [...new Set(all)];
  const years = options.filter(isYear).map(Number);
  const names = options.filter((o) => !isYear(o)).sort((a, b) => a.localeCompare(b));
  if (years.length === 0) return names;
  const max = Math.max(...years);
  const min = Math.min(Math.min(...years), GENRE_LIST_MIN_YEAR);
  const extended: string[] = [];
  for (let y = max; y >= min; y--) extended.push(String(y));
  return [...names, ...extended];
}
