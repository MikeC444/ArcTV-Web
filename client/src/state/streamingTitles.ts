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

/** The countries a browser's time zone points to when its language carries no region ("en" alone): the common zones, by exact name or by the area before the slash. */
const ZONE_REGION: Record<string, string> = {
  "Australia/": "AU", "Pacific/Auckland": "NZ", "Pacific/Chatham": "NZ", "Europe/London": "GB", "Europe/Dublin": "IE", "Europe/Paris": "FR", "Europe/Berlin": "DE",
  "Europe/Madrid": "ES", "Europe/Rome": "IT", "Europe/Amsterdam": "NL", "Europe/Stockholm": "SE", "Europe/Oslo": "NO", "Europe/Copenhagen": "DK", "Europe/Warsaw": "PL",
  "America/Toronto": "CA", "America/Vancouver": "CA", "America/Edmonton": "CA", "America/Halifax": "CA", "America/Winnipeg": "CA", "America/Mexico_City": "MX",
  "America/Sao_Paulo": "BR", "America/Argentina/": "AR", "America/New_York": "US", "America/Chicago": "US", "America/Denver": "US", "America/Los_Angeles": "US",
  "America/Phoenix": "US", "America/Anchorage": "US", "Pacific/Honolulu": "US", "Asia/Tokyo": "JP", "Asia/Seoul": "KR", "Asia/Kolkata": "IN", "Asia/Calcutta": "IN",
  "Asia/Singapore": "SG", "Asia/Manila": "PH", "Asia/Hong_Kong": "HK", "Africa/Johannesburg": "ZA",
};

/**
 * The viewer's country as TMDB wants it (what a service carries differs by country), from the browser alone with no permission prompt: the region of its
 * language ("en-AU" is AU), else the country of its time zone (Australia/Sydney is AU), else the US.
 */
export function viewerRegion(
  language: string | undefined = typeof navigator === "undefined" ? undefined : navigator.language,
  timeZone: string | undefined = typeof Intl === "undefined" ? undefined : Intl.DateTimeFormat().resolvedOptions().timeZone,
): string {
  const region = language?.match(/[-_]([A-Za-z]{2})$/)?.[1];
  if (region) return region.toUpperCase();
  const zone = timeZone ? ZONE_REGION[timeZone] ?? ZONE_REGION[`${timeZone.split("/")[0]}/`] : undefined;
  return zone ?? "US";
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
