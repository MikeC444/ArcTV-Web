/**
 * The genre rows of the built-in catalog. Names follow Cinemeta's ("Sci-Fi", "Reality-TV"…) so Home, Genres and the TV app
 * read the same; each maps to TMDB's own genre ids, which differ between movies and TV shows (TMDB has no TV "Horror",
 * "Romance" or "Thriller", for instance — those rows simply hold movies).
 */
export const MOVIE_GENRES: Record<string, number[]> = {
  Action: [28],
  Adventure: [12],
  Animation: [16],
  Comedy: [35],
  Crime: [80],
  Documentary: [99],
  Drama: [18],
  Family: [10751],
  Fantasy: [14],
  History: [36],
  Horror: [27],
  Music: [10402],
  Mystery: [9648],
  Romance: [10749],
  "Sci-Fi": [878],
  Thriller: [53],
  War: [10752],
  Western: [37],
};

export const TV_GENRES: Record<string, number[]> = {
  Action: [10759],
  Adventure: [10759],
  Animation: [16],
  Comedy: [35],
  Crime: [80],
  Documentary: [99],
  Drama: [18],
  Family: [10751],
  Fantasy: [10765],
  Kids: [10762],
  Mystery: [9648],
  "Reality-TV": [10764],
  "Sci-Fi": [10765],
  War: [10768],
  Western: [37],
};

/** Shown as genres but really hand-made collections (the "featured" catalogs). */
export const COLLECTIONS = ["Trending", "Top Rated"] as const;

export const GENRE_NAMES = Array.from(new Set([...Object.keys(MOVIE_GENRES), ...Object.keys(TV_GENRES)])).sort();

/** TMDB genre id → a Cinemeta-style name, for the genre labels on a title. */
const NAME_BY_ID = new Map<number, string>();
for (const table of [MOVIE_GENRES, TV_GENRES]) for (const [name, ids] of Object.entries(table)) for (const id of ids) if (!NAME_BY_ID.has(id)) NAME_BY_ID.set(id, name);
NAME_BY_ID.set(10759, "Action"); // "Action & Adventure"
NAME_BY_ID.set(10765, "Sci-Fi"); // "Sci-Fi & Fantasy"
export const genreName = (id: number): string | undefined => NAME_BY_ID.get(id);
