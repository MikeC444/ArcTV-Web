import { useEffect, useState } from "react";
import { MdAccountBalance, MdArticle, MdAutoAwesome, MdCalendarToday, MdCategory, MdDirectionsRun, MdExtension, MdFavorite, MdGavel, MdGroups, MdLandscape, MdLocalMovies, MdMood, MdMusicNote, MdNightsStay, MdPalette, MdScience, MdSearch, MdShield, MdSportsSoccer, MdTerrain, MdTheaterComedy, MdVideocam, MdVisibility } from "react-icons/md";
import type { IconType } from "react-icons";
import { useNavigate } from "react-router-dom";
import { useProviders } from "../../domain/registry";
import { routes } from "../../lib/routes";
import { Surface } from "../components/Surface";
import { Spinner } from "../components/States";
import { useAddonsReady } from "../../state/hooks";

const GENRE_LIST_MIN_YEAR = 2016;
const ACCENTS = ["var(--amber)", "var(--tangerine)", "var(--coral)", "var(--azure)", "var(--teal)"];
const isYear = (value: string) => /^\d+$/.test(value) && Number(value) >= 1900 && Number(value) <= 2100;

/** iconForGenre() in GenresScreen.kt */
export function iconForGenre(genre: string): IconType {
  const key = genre.toLowerCase();
  if (isYear(key)) return MdCalendarToday;
  const table: Array<[string, IconType]> = [
    ["action", MdDirectionsRun], ["adventure", MdTerrain], ["anima", MdPalette], ["comedy", MdMood], ["crime", MdGavel], ["documentary", MdArticle],
    ["drama", MdTheaterComedy], ["famil", MdGroups], ["fantasy", MdAutoAwesome], ["histor", MdAccountBalance], ["horror", MdNightsStay], ["music", MdMusicNote],
    ["myster", MdSearch], ["romance", MdFavorite], ["sci", MdScience], ["thriller", MdVisibility], ["war", MdShield], ["western", MdLandscape], ["reality", MdVideocam], ["sport", MdSportsSoccer],
  ];
  return table.find(([needle]) => key.includes(needle))?.[1] ?? MdLocalMovies;
}

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

export function GenresScreen() {
  const providers = useProviders((s) => s.providers);
  const ready = useAddonsReady();
  const navigate = useNavigate();
  const [genres, setGenres] = useState<string[] | null>(null);
  useEffect(() => {
    document.title = "Genres · Mango TV";
    if (!ready || providers.length === 0) return setGenres(null);
    let cancelled = false;
    setGenres(null);
    void Promise.all(providers.map((p) => p.getAvailableGenres().catch(() => [] as string[]))).then((lists) => !cancelled && setGenres(buildGenreList(lists.flat())));
    return () => {
      cancelled = true;
    };
  }, [providers, ready]);

  return (
    <div className="page">
      <h1 className="t-display-md page__title page__title--icon">
        <MdCategory aria-hidden="true" /> Genres
      </h1>
      <div className="page__body">
        {ready && providers.length === 0 ? (
          <div>
            <p className="c-text-2 t-body-md">Install an addon first — genres will show up here once it's added.</p>
            <p style={{ marginTop: 12 }}>
              <Surface to={routes.settings("addons")} className="pill pill--lg" radius="999px" background="var(--surface-high)"><MdExtension /> Manage addons</Surface>
            </p>
          </div>
        ) : !ready || genres === null ? (
          <Spinner />
        ) : genres.length === 0 ? (
          <p className="c-text-2 t-body-md">Your installed addons aren't reporting any genres right now.</p>
        ) : (
          <div className="genre-grid" role="list">
            {genres.map((genre, index) => {
              const Icon = iconForGenre(genre);
              return (
                <div role="listitem" key={genre} style={{ display: "contents" }}>
                  <Surface
                    to={routes.genre(genre)}
                    className="genre-card"
                    scale={1.05}
                    backgroundImage={`linear-gradient(135deg, var(--surface-high), color-mix(in srgb, ${ACCENTS[index % ACCENTS.length]} 32%, var(--surface-high)))`}
                    dataAttrs={{ autofocus: index === 0 }}
                    ariaLabel={genre}
                    onClick={() => navigate(routes.genre(genre))}
                  >
                    <Icon aria-hidden="true" />
                    <span className="t-label-lg ellipsis">{genre}</span>
                  </Surface>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
