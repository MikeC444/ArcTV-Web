import type { ContentType, Stream } from "../domain/types";
import { readJson, writeJson } from "./persist";
import { libraryKey } from "./profile";

/**
 * "Remember the last stream I picked for this title/episode" (LastSourceRepository.kt). Like on the TV this is a
 * device-local convenience — it is not part of the synced account data.
 *
 * It keeps the source's id and also what the source was (addon, release name, info hash): an addon can hand out new ids between two
 * fetches, and a part-watched title should still carry on with the same release instead of going back to the source list.
 */
export interface LastSource {
  streamId: string;
  providerLabel?: string;
  releaseTitle?: string;
  infoHash?: string | null;
}

const key = (providerId: string, contentId: string, type: ContentType, season: number | null, episode: number | null) =>
  `${providerId}|${contentId}|${type}|${season ?? -1}|${episode ?? -1}`;

const storeKey = (userId: string) => libraryKey(userId, "lastSource");

/** Older entries are just the id string; newer ones are objects. */
type Stored = string | LastSource;

export function findLastSource(userId: string, providerId: string, contentId: string, type: ContentType, season: number | null, episode: number | null): LastSource | null {
  const stored = readJson<Record<string, Stored>>(storeKey(userId), {})[key(providerId, contentId, type, season, episode)];
  if (!stored) return null;
  return typeof stored === "string" ? { streamId: stored } : stored;
}

export function findLastStreamId(userId: string, providerId: string, contentId: string, type: ContentType, season: number | null, episode: number | null): string | null {
  return findLastSource(userId, providerId, contentId, type, season, episode)?.streamId ?? null;
}

export function setLastSource(userId: string, providerId: string, contentId: string, type: ContentType, season: number | null, episode: number | null, stream: Stream): void {
  const map = readJson<Record<string, Stored>>(storeKey(userId), {});
  map[key(providerId, contentId, type, season, episode)] = { streamId: stream.id, providerLabel: stream.providerLabel, releaseTitle: stream.releaseTitle, infoHash: stream.infoHash ?? null };
  writeJson(storeKey(userId), map);
}

/**
 * Finds the source a title was last watched on in a fresh list: the same id when it is still there, otherwise the same torrent (info
 * hash), otherwise the same release from the same addon, otherwise the same release name. Nothing is guessed beyond that.
 */
export function matchLastSource(streams: Stream[], last: LastSource | null): Stream | null {
  if (!last) return null;
  const byId = streams.find((s) => s.id === last.streamId);
  if (byId) return byId;
  if (last.infoHash) {
    const hash = last.infoHash.toLowerCase();
    const byHash = streams.find((s) => s.infoHash?.toLowerCase() === hash);
    if (byHash) return byHash;
  }
  if (!last.releaseTitle) return null;
  return streams.find((s) => s.releaseTitle === last.releaseTitle && s.providerLabel === last.providerLabel) ?? streams.find((s) => s.releaseTitle === last.releaseTitle) ?? null;
}
