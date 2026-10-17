import type { Content, ContentType } from "../domain/types";
import { api } from "../lib/api";

interface ServiceTitle {
  imdbId: string;
  type: ContentType;
  title: string;
  year: number | null;
  rating: number | null;
  overview: string;
  poster: string | null;
  backdrop: string | null;
}
interface ServiceTitlesAnswer {
  available: boolean;
  items: ServiceTitle[];
  page: number;
  totalPages: number;
}

export interface ServiceTitlesPage {
  /** False when there is no TMDB source for this service (or the server has no TMDB key): the page keeps to the addon's own titles. */
  available: boolean;
  items: Content[];
  totalPages: number;
}

/** The viewer's country as TMDB wants it (what a service carries differs by country); the browser's language region, else the UK. */
export function viewerRegion(language: string | undefined = typeof navigator === "undefined" ? undefined : navigator.language): string {
  const region = language?.match(/[-_]([A-Za-z]{2})$/)?.[1];
  return region ? region.toUpperCase() : "GB";
}

/**
 * One page (about 20) of a service's movies or series, most popular first, beyond what its addon lists. Titles open through `providerId` (the addon the
 * service page came from) like the addon's own do. Never throws: a failed ask is "not available".
 */
export async function fetchServiceTitles(service: string, type: ContentType, page: number, providerId: string | null): Promise<ServiceTitlesPage> {
  try {
    const query = new URLSearchParams({ service, type, page: String(page), region: viewerRegion() });
    const answer = await api<ServiceTitlesAnswer>(`/user/streaming-titles?${query}`);
    return {
      available: answer.available,
      totalPages: answer.totalPages,
      items: answer.items.map((t) => ({
        id: t.imdbId,
        type: t.type,
        title: t.title,
        description: t.overview,
        posterUrl: t.poster,
        backdropUrl: t.backdrop,
        year: t.year,
        rating: t.rating,
        genres: [],
        cast: [],
        seasons: [],
        watched: false,
        providerId,
      })),
    };
  } catch {
    return { available: false, items: [], totalPages: 0 };
  }
}
