import type { Content } from "../domain/types";

/** The picture and logo of the title being opened, kept from the page before so the player's loading screen can show them at once (before its own details arrive). */
export type PlayerArt = Pick<Content, "id" | "title" | "backdropUrl" | "logoUrl">;
const cache = new Map<string, PlayerArt>();

export const rememberPlayerArt = (content: PlayerArt): void => {
  cache.set(content.id, { id: content.id, title: content.title, backdropUrl: content.backdropUrl, logoUrl: content.logoUrl ?? null });
  if (cache.size > 50) cache.delete(cache.keys().next().value as string);
};
export const peekPlayerArt = (id: string): PlayerArt | null => cache.get(id) ?? null;
