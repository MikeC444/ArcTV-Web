import type { LiveChannel } from "../domain/live";

/**
 * The channels the person was last looking at, in the order shown, so the player can switch to the next or previous one (arrow keys or
 * its buttons) and knows a channel's name and logo without asking the addon again. Kept in memory only; a reload just loses the neighbours.
 */
let lineup: LiveChannel[] = [];
const keyOf = (c: Pick<LiveChannel, "providerId" | "type" | "id">) => `${c.providerId}|${c.type}|${c.id}`;
const known = new Map<string, LiveChannel>();

export function setLiveLineup(channels: LiveChannel[]): void {
  lineup = channels;
  for (const c of channels) known.set(keyOf(c), c);
}

export const findLiveChannel = (providerId: string, type: string, id: string): LiveChannel | null => known.get(`${providerId}|${type}|${id}`) ?? null;

/** The channel [step] places along the lineup from this one (wrapping round), or null when it is not in the lineup or alone in it. */
export function neighbourChannel(current: Pick<LiveChannel, "providerId" | "type" | "id">, step: 1 | -1): LiveChannel | null {
  const at = lineup.findIndex((c) => keyOf(c) === keyOf(current));
  if (at < 0 || lineup.length < 2) return null;
  return lineup[(at + step + lineup.length) % lineup.length] ?? null;
}

export const resetLiveLineup = (): void => {
  lineup = [];
  known.clear();
};
