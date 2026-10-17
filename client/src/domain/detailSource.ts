import { CINEMETA_PROVIDER_ID } from "../lib/routes";
import type { CatalogProvider } from "./provider";
import type { Content, ContentType } from "./types";

const IMDB_ID = /^tt\d+$/;

/**
 * Which installed addons to ask for a title's details, in order: Cinemeta first while it is installed and turned on (for a title with an IMDb id,
 * which is all it knows), then the addon the title came from, then every other installed addon in the person's own order. Only addons that are turned
 * on are in `installedIds` (a turned-off addon is not a provider).
 */
export function detailOrder(installedIds: readonly string[], ownerId: string, contentId: string, metaId: string = CINEMETA_PROVIDER_ID): string[] {
  const order: string[] = [];
  if (IMDB_ID.test(contentId) && installedIds.includes(metaId)) order.push(metaId);
  if (installedIds.includes(ownerId) && !order.includes(ownerId)) order.push(ownerId);
  for (const id of installedIds) if (!order.includes(id)) order.push(id);
  return order;
}

/**
 * A title's details from the first addon in `detailOrder` that has them (a failure or "don't know it" moves on to the next). The result keeps `ownerId` as
 * its addon, so Continue Watching, the last source and My List stay filed under the addon the title came from; only the details come from elsewhere.
 * Null when none of them has the title.
 */
export async function loadDetails(providers: readonly CatalogProvider[], ownerId: string, type: ContentType, id: string): Promise<Content | null> {
  for (const providerId of detailOrder(providers.map((p) => p.id), ownerId, id)) {
    const provider = providers.find((p) => p.id === providerId);
    const detail = await provider?.getDetails(type, id).catch(() => null);
    if (detail) return { ...detail, providerId: ownerId };
  }
  return null;
}
