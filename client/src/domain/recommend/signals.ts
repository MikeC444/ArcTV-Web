import { SIGNAL_WEIGHTS } from "./config";

export type Feedback = "like" | "dislike";
export type SignalKind = "like" | "dislike" | "completed" | "watchlist";

/** What is currently stored about one movie for one profile. Built from the stores each time, never accumulated: edits and removals therefore just work. */
export interface InteractionInput {
  id: string;
  title: string;
  feedback?: Feedback | null;
  /** Finished, by the app's existing completion rule (My List entry with watched = true). */
  completed: boolean;
  inWatchlist: boolean;
}

export interface Interaction {
  id: string;
  title: string;
  kind: SignalKind;
  weight: number;
}

/**
 * The single strongest applicable signal for a movie, or null when it carries none.
 * Explicit feedback comes first, so a disliked movie stays negative even if it was finished or saved. Opening a page, starting playback,
 * failures and interrupted sessions are not inputs here at all.
 */
export function interactionOf(input: InteractionInput): Interaction | null {
  if (input.feedback === "like") return { id: input.id, title: input.title, kind: "like", weight: SIGNAL_WEIGHTS.like };
  if (input.feedback === "dislike") return { id: input.id, title: input.title, kind: "dislike", weight: SIGNAL_WEIGHTS.dislike };
  if (input.completed) return { id: input.id, title: input.title, kind: "completed", weight: SIGNAL_WEIGHTS.completed };
  if (input.inWatchlist) return { id: input.id, title: input.title, kind: "watchlist", weight: SIGNAL_WEIGHTS.watchlist };
  return null;
}

/** Stored facts → one Interaction per movie, in a stable order (strongest first, then id). */
export function collectInteractions(inputs: InteractionInput[]): Interaction[] {
  const byId = new Map<string, InteractionInput>();
  for (const input of inputs) {
    const previous = byId.get(input.id);
    byId.set(input.id, previous ? { ...previous, ...input, feedback: input.feedback ?? previous.feedback, completed: input.completed || previous.completed, inWatchlist: input.inWatchlist || previous.inWatchlist } : input);
  }
  const out: Interaction[] = [];
  for (const input of byId.values()) {
    const interaction = interactionOf(input);
    if (interaction) out.push(interaction);
  }
  return out.sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight) || a.id.localeCompare(b.id));
}

/** A short fingerprint of the preference data: it changes exactly when a recommendation could. Used to invalidate cached results. */
export const signatureOf = (interactions: Interaction[]): string =>
  interactions
    .map((i) => `${i.id}:${i.kind}`)
    .sort()
    .join("|");
