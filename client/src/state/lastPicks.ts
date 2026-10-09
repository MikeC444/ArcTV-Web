import { PICKED_ROW_ID } from "../domain/recommend/config";
import type { ContentType, HomeSection } from "../domain/types";
import { readJson, writeJson } from "./persist";
import { profileKey } from "./profile";

/** One title from the last "Picked for you" row, kept so Settings can say why it was picked. */
export interface LastPick {
  id: string;
  title: string;
  type: ContentType;
  providerId: string | null;
  posterUrl: string | null;
  genres: string[];
  reason: string | null;
}

const key = (userId: string, profileId: string) => profileKey(userId, profileId, "lastPicks");

/** Remembers the personal row Home last showed (only a personalised row, never the popular fallback). */
export function rememberLastPicks(userId: string, profileId: string, section: HomeSection | null, mode: "personal" | "popular" | null): void {
  if (!section || section.id !== PICKED_ROW_ID || mode !== "personal") return;
  const picks: LastPick[] = section.items.map((c) => ({ id: c.id, title: c.title, type: c.type, providerId: c.providerId ?? null, posterUrl: c.posterUrl ?? null, genres: c.genres.map((g) => g.name), reason: c.recommendReason ?? null }));
  writeJson(key(userId, profileId), picks);
}

export const readLastPicks = (userId: string, profileId: string): LastPick[] => readJson<LastPick[]>(key(userId, profileId), []);
