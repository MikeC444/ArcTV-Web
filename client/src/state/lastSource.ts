import type { ContentType } from "../domain/types";
import { readJson, userKey, writeJson } from "./persist";

/**
 * "Remember the last stream I picked for this title/episode" (LastSourceRepository.kt). Like on the TV this is a
 * device-local convenience — it is not part of the synced account data.
 */
const key = (providerId: string, contentId: string, type: ContentType, season: number | null, episode: number | null) =>
  `${providerId}|${contentId}|${type}|${season ?? -1}|${episode ?? -1}`;

export function findLastStreamId(userId: string, providerId: string, contentId: string, type: ContentType, season: number | null, episode: number | null): string | null {
  return readJson<Record<string, string>>(userKey(userId, "lastSource"), {})[key(providerId, contentId, type, season, episode)] ?? null;
}

export function setLastStreamId(userId: string, providerId: string, contentId: string, type: ContentType, season: number | null, episode: number | null, streamId: string): void {
  const map = readJson<Record<string, string>>(userKey(userId, "lastSource"), {});
  map[key(providerId, contentId, type, season, episode)] = streamId;
  writeJson(userKey(userId, "lastSource"), map);
}
