import type { Stream } from "../domain/types";

/**
 * The source the person just picked, carried from the source list to the player in memory.
 *
 * The player used to ask every addon for its sources again and look the chosen one up by its id. An addon that hands out a fresh id (or
 * address) on every request, as AIOStreams does, was then never found again, and the person got "This source is no longer available"
 * without anything having played. Handing the chosen source over avoids both the second lookup and that failure. In memory only, and
 * only the latest pick: a retry of the same source still finds it, a different title never sees it.
 */
let held: Stream | null = null;

export function putHandoff(stream: Stream): void {
  held = stream;
}

/** The held source when it is the one with this id, else null. */
export function getHandoff(streamId: string): Stream | null {
  return held && held.id === streamId ? held : null;
}
